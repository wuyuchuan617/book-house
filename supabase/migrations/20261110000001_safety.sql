-- M5 安全：A6–A8 檢舉／封鎖書店、設定 › 已封鎖的帳號、審核（service role）

-- A8 封鎖：以書店找到店主再封鎖（讀者看不到 owner_id 以外的店主資料）
create or replace function public.block_bookstore(p_bookstore_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select owner_id into v_owner from public.bookstores where id = p_bookstore_id;
  if v_owner is null then
    raise exception 'bookstore not found' using errcode = 'P0002';
  end if;
  if v_owner = auth.uid() then
    raise exception 'cannot block yourself' using errcode = '23514';
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), v_owner)
  on conflict do nothing;  -- apply_block trigger 會移除雙方的追蹤
end $$;

-- A7 檢舉書店（可同時封鎖）。同一人對同一間書店 24 小時內只算一次
create or replace function public.report_bookstore(
  p_bookstore_id uuid,
  p_reason public.report_reason,
  p_detail text default null,
  p_also_block boolean default false
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.bookstores where id = p_bookstore_id) then
    raise exception 'bookstore not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.reports
             where reporter_id = auth.uid() and target_type = 'bookstore' and target_id = p_bookstore_id
               and created_at > now() - interval '24 hours') then
    raise exception 'already reported recently' using errcode = '23505';
  end if;
  insert into public.reports (reporter_id, target_type, target_id, reason, detail, also_blocked)
  values (auth.uid(), 'bookstore', p_bookstore_id, p_reason, nullif(left(trim(p_detail), 500), ''), coalesce(p_also_block, false));
  if p_also_block then
    perform public.block_bookstore(p_bookstore_id);
  end if;
end $$;

-- 設定 › 已封鎖的帳號（被封鎖的書店對自己是隱藏的，名稱只能由這裡取得）
create or replace function public.my_blocked_accounts()
returns table (blocked_id uuid, display_name text, store_name text, blocked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.blocked_id, p.display_name, s.name, b.created_at
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  left join public.bookstores s on s.owner_id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc
$$;

-- ---------------------------------------------------------------------------
-- 審核（只給 service role／Supabase 後台使用）
-- ---------------------------------------------------------------------------
create or replace view public.moderation_queue as
  select r.target_id as bookstore_id, s.name as store_name, s.slug, s.status,
         count(*) as report_count,
         count(distinct r.reporter_id) as reporter_count,
         array_agg(distinct r.reason) as reasons,
         max(r.created_at) as last_reported_at,
         array_remove(array_agg(r.detail order by r.created_at desc), null) as details
  from public.reports r
  join public.bookstores s on s.id = r.target_id
  where r.target_type = 'bookstore' and r.status in ('open', 'reviewing')
  group by r.target_id, s.name, s.slug, s.status
  order by count(distinct r.reporter_id) desc, max(r.created_at) desc;

revoke all on public.moderation_queue from anon, authenticated;

-- p_action：'pause'（暫停營業、讀者看不到）、'restore'（恢復）、'dismiss'（檢舉不成立）
create or replace function public.moderate_bookstore(p_bookstore_id uuid, p_action text, p_moderator uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_action = 'pause' then
    update public.bookstores set status = 'paused' where id = p_bookstore_id;
    update public.reports set status = 'actioned', reviewed_by = p_moderator, reviewed_at = now()
     where target_type = 'bookstore' and target_id = p_bookstore_id and status in ('open', 'reviewing');
  elsif p_action = 'restore' then
    update public.bookstores set status = 'active' where id = p_bookstore_id;
  elsif p_action = 'dismiss' then
    update public.reports set status = 'dismissed', reviewed_by = p_moderator, reviewed_at = now()
     where target_type = 'bookstore' and target_id = p_bookstore_id and status in ('open', 'reviewing');
  else
    raise exception 'unknown action %', p_action;
  end if;
end $$;

revoke execute on function public.block_bookstore(uuid), public.report_bookstore(uuid, public.report_reason, text, boolean),
  public.my_blocked_accounts(), public.moderate_bookstore(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.block_bookstore(uuid), public.report_bookstore(uuid, public.report_reason, text, boolean),
  public.my_blocked_accounts() to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on public.moderation_queue to service_role;
    grant execute on function public.moderate_bookstore(uuid, text, uuid) to service_role;
  end if;
end $$;
