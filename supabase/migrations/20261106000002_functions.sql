-- Helpers、triggers、RPC
-- 時區：月份一律以 Asia/Taipei 計算

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.current_period()
returns date language sql stable as $$
  select date_trunc('month', (now() at time zone 'Asia/Taipei'))::date
$$;

create or replace function public.my_bookstore_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.bookstores where owner_id = auth.uid()
$$;

create or replace function public.is_store_owner(p_bookstore_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bookstores where id = p_bookstore_id and owner_id = auth.uid()
  )
$$;

create or replace function public.is_curation_owner(p_curation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.curations c
    join public.bookstores s on s.id = c.bookstore_id
    where c.id = p_curation_id and s.owner_id = auth.uid()
  )
$$;

create or replace function public.is_reading_owner(p_reading_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.readings r
    join public.bookstores s on s.id = r.bookstore_id
    where r.id = p_reading_id and s.owner_id = auth.uid()
  )
$$;

-- 目前使用者與 p_user 之間任一方封鎖對方
create or replace function public.is_blocked_with(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.blocks
    where (blocker_id = auth.uid() and blocked_id = p_user)
       or (blocker_id = p_user and blocked_id = auth.uid())
  )
$$;

-- 讀者可見的書店：營業中、店主沒有申請刪除、雙方沒有封鎖
create or replace function public.is_store_visible(p_bookstore_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bookstores s
    join public.profiles p on p.id = s.owner_id
    where s.id = p_bookstore_id
      and s.status = 'active'
      and p.delete_requested_at is null
      and not public.is_blocked_with(s.owner_id)
  )
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger bookstores_updated_at before update on public.bookstores
  for each row execute function public.set_updated_at();
create trigger curations_updated_at before update on public.curations
  for each row execute function public.set_updated_at();
create trigger curation_items_updated_at before update on public.curation_items
  for each row execute function public.set_updated_at();
create trigger readings_updated_at before update on public.readings
  for each row execute function public.set_updated_at();
create trigger reading_notes_updated_at before update on public.reading_notes
  for each row execute function public.set_updated_at();

-- 登入後建立 profile（Apple／Google 帶入名字與頭像）
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, ''), '@', 1),
      '讀者'
    ), 40),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  insert into public.notification_prefs (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 策展狀態只能經 publish／unpublish 函式改變
create or replace function public.guard_curation_status()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.via_rpc', true), '') <> 'on' then
    if tg_op = 'INSERT' and new.status <> 'draft' then
      raise exception 'new curations must start as draft' using errcode = '42501';
    elsif tg_op = 'UPDATE' and (new.status is distinct from old.status
                               or new.published_at is distinct from old.published_at) then
      raise exception 'use publish_curation() / unpublish_curation()' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger curations_status_guard before insert or update on public.curations
  for each row execute function public.guard_curation_status();

-- 每檔最多 3 個主題標籤
create or replace function public.limit_curation_tags()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.curation_tags where curation_id = new.curation_id) >= 3 then
    raise exception 'a curation can have at most 3 tags' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger curation_tags_limit before insert on public.curation_tags
  for each row execute function public.limit_curation_tags();

-- 不能追蹤自己的書店
create or replace function public.prevent_self_follow()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.bookstores where id = new.bookstore_id and owner_id = new.follower_id) then
    raise exception 'cannot follow your own bookstore' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger follows_no_self before insert on public.follows
  for each row execute function public.prevent_self_follow();

-- 店主閱讀：建立後不能換書；標記讀完時寫入 finished_at
create or replace function public.guard_reading()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.book_id <> old.book_id then
    raise exception 'book cannot be changed; remove and add again' using errcode = '42501';
  end if;
  if new.status = 'finished' and new.finished_at is null then
    new.finished_at := current_date;
  elsif new.status = 'reading' then
    new.finished_at := null;
  end if;
  return new;
end $$;

create trigger readings_guard before insert or update on public.readings
  for each row execute function public.guard_reading();

-- 新增心得時，更新 reading 的 updated_at（列表依最近更新排序）
create or replace function public.touch_reading()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.readings set updated_at = now() where id = new.reading_id;
  return new;
end $$;

create trigger reading_notes_touch after insert on public.reading_notes
  for each row execute function public.touch_reading();

-- 封鎖時移除雙方的追蹤
create or replace function public.apply_block()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.follows f
  using public.bookstores s
  where s.id = f.bookstore_id
    and ((f.follower_id = new.blocker_id and s.owner_id = new.blocked_id)
      or (f.follower_id = new.blocked_id and s.owner_id = new.blocker_id));
  return new;
end $$;

create trigger blocks_apply after insert on public.blocks
  for each row execute function public.apply_block();

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------

-- 把店名轉成 slug；中文店名轉不出英數時用 store-xxxxxx
create or replace function public.slugify(p_text text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function public.is_slug_available(p_slug text)
returns table (available boolean, suggestions text[])
language plpgsql stable security definer set search_path = '' as $$
declare
  v_slug text := lower(p_slug);
  v_taken boolean;
begin
  v_taken := v_slug !~ '^[a-z0-9]([a-z0-9-]{1,28})[a-z0-9]$'
          or v_slug in ('admin', 'api', 'app', 'help', 'login', 'settings', 'store', 'explore', 'www')
          or exists (select 1 from public.bookstores
                     where slug = v_slug::extensions.citext and owner_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'));
  if not v_taken then
    return query select true, array[]::text[];
  else
    return query
      select false, array(
        select candidate from (values
          (left(v_slug, 26) || '-' || to_char(now(), 'YY')),
          (left(v_slug, 25) || '-' || substr(md5(random()::text), 1, 4)),
          ('my-' || left(v_slug, 27))
        ) as c(candidate)
        where candidate ~ '^[a-z0-9]([a-z0-9-]{1,28})[a-z0-9]$'
          and not exists (select 1 from public.bookstores where slug = candidate::extensions.citext)
      );
  end if;
end $$;

-- 開店步驟 1（O2）
create or replace function public.create_bookstore(
  p_name text,
  p_owner_name text,
  p_color public.store_color default 'moss'
) returns public.bookstores
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_base text;
  v_slug text;
  v_store public.bookstores;
  i int := 0;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if exists (select 1 from public.bookstores where owner_id = v_uid) then
    raise exception 'you already have a bookstore' using errcode = '23505';
  end if;

  v_base := left(public.slugify(p_name), 24);
  if char_length(v_base) < 3 then
    v_base := 'store-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;
  v_slug := v_base;
  while exists (select 1 from public.bookstores where slug = v_slug::extensions.citext) loop
    i := i + 1;
    v_slug := v_base || '-' || i;
  end loop;

  insert into public.bookstores (owner_id, name, owner_name, color, slug)
  values (v_uid, p_name, p_owner_name, p_color, v_slug)
  returning * into v_store;
  return v_store;
end $$;

-- 發布（V1：只能發布本月的策展；V2 會改成可預約）
create or replace function public.publish_curation(p_curation_id uuid)
returns public.curations
language plpgsql security definer set search_path = '' as $$
declare
  c public.curations;
begin
  select * into c from public.curations where id = p_curation_id for update;
  if not found or not public.is_curation_owner(p_curation_id) then
    raise exception 'curation not found' using errcode = 'P0002';
  end if;
  if c.status = 'published' then
    return c;
  end if;
  if c.title is null or char_length(trim(c.title)) = 0 then
    raise exception 'title is required to publish' using errcode = '23514';
  end if;
  if not exists (select 1 from public.curation_items where curation_id = c.id) then
    raise exception 'add at least 1 book to publish' using errcode = '23514';
  end if;
  if c.period <> public.current_period() then
    raise exception 'only this month''s curation can be published' using errcode = '23514';
  end if;
  if exists (select 1 from public.curations
             where bookstore_id = c.bookstore_id and period = c.period
               and status in ('published', 'scheduled') and id <> c.id) then
    raise exception 'this month already has a published curation' using errcode = '23505';
  end if;

  perform set_config('app.via_rpc', 'on', true);
  update public.curations
     set status = 'published', published_at = now()
   where id = c.id
  returning * into c;
  perform set_config('app.via_rpc', 'off', true);
  return c;
end $$;

create or replace function public.unpublish_curation(p_curation_id uuid)
returns public.curations
language plpgsql security definer set search_path = '' as $$
declare
  c public.curations;
begin
  if not public.is_curation_owner(p_curation_id) then
    raise exception 'curation not found' using errcode = 'P0002';
  end if;
  perform set_config('app.via_rpc', 'on', true);
  update public.curations
     set status = 'draft', published_at = null, scheduled_for = null
   where id = p_curation_id
  returning * into c;
  perform set_config('app.via_rpc', 'off', true);
  return c;
end $$;

-- 拖曳排序：p_item_ids 為新順序
create or replace function public.reorder_curation_items(p_curation_id uuid, p_item_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_curation_owner(p_curation_id) then
    raise exception 'curation not found' using errcode = 'P0002';
  end if;
  update public.curation_items ci
     set position = o.ord
    from unnest(p_item_ids) with ordinality as o(item_id, ord)
   where ci.id = o.item_id and ci.curation_id = p_curation_id;
end $$;

-- 拜訪去重寫入；訪客傳入裝置雜湊值，登入者以 user id 計
create or replace function public.record_visit(p_curation_id uuid, p_visitor_key text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_key text := coalesce(auth.uid()::text, p_visitor_key);
begin
  if v_key is null then
    return;
  end if;
  if public.is_curation_owner(p_curation_id) then
    return; -- 店主自己不計
  end if;
  if not exists (
    select 1 from public.curations c
    where c.id = p_curation_id and c.status = 'published' and public.is_store_visible(c.bookstore_id)
  ) then
    return;
  end if;
  insert into public.curation_visits (curation_id, visitor_key, visit_date)
  values (p_curation_id, v_key, (now() at time zone 'Asia/Taipei')::date)
  on conflict do nothing;
end $$;

-- 店主數據（M1）
create or replace function public.my_store_stats()
returns table (
  bookstore_id uuid,
  follower_count bigint,
  visits_this_month bigint,
  published_curation_count bigint
) language sql stable security definer set search_path = '' as $$
  select
    s.id,
    (select count(*) from public.follows f where f.bookstore_id = s.id),
    (select count(*) from public.curation_visits v
       join public.curations c on c.id = v.curation_id
      where c.bookstore_id = s.id and v.visit_date >= public.current_period()),
    (select count(*) from public.curations c where c.bookstore_id = s.id and c.status = 'published')
  from public.bookstores s
  where s.owner_id = auth.uid()
$$;

create or replace function public.my_curation_visits()
returns table (curation_id uuid, visit_count bigint)
language sql stable security definer set search_path = '' as $$
  select c.id, count(v.*)
  from public.curations c
  join public.bookstores s on s.id = c.bookstore_id and s.owner_id = auth.uid()
  left join public.curation_visits v on v.curation_id = c.id
  group by c.id
$$;

-- 刪除帳號（M10）：30 天內重新登入可取消
create or replace function public.request_account_deletion(p_reason text default null)
returns void language sql security definer set search_path = '' as $$
  update public.profiles
     set delete_requested_at = now(), delete_reason = left(p_reason, 500)
   where id = auth.uid()
$$;

create or replace function public.cancel_account_deletion()
returns void language sql security definer set search_path = '' as $$
  update public.profiles
     set delete_requested_at = null, delete_reason = null
   where id = auth.uid() and delete_requested_at > now() - interval '30 days'
$$;

-- 排程用（service role）：刪除申請超過 30 天的帳號
create or replace function public.purge_deleted_accounts()
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  with gone as (
    delete from auth.users u
    using public.profiles p
    where p.id = u.id and p.delete_requested_at < now() - interval '30 days'
    returning u.id
  ) select count(*) into n from gone;
  return n;
end $$;

-- 權限：RPC 預設不給 anon／authenticated，逐一開放
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.current_period(),
  public.is_store_visible(uuid),
  public.is_slug_available(text),
  public.record_visit(uuid, text)
to anon, authenticated;
grant execute on function
  public.my_bookstore_id(),
  public.is_store_owner(uuid),
  public.is_curation_owner(uuid),
  public.is_reading_owner(uuid),
  public.is_blocked_with(uuid),
  public.slugify(text),
  public.create_bookstore(text, text, public.store_color),
  public.publish_curation(uuid),
  public.unpublish_curation(uuid),
  public.reorder_curation_items(uuid, uuid[]),
  public.my_store_stats(),
  public.my_curation_visits(),
  public.request_account_deletion(text),
  public.cancel_account_deletion()
to authenticated;
-- RLS policy 會呼叫的 helper 也要讓 anon 能執行
grant execute on function public.is_blocked_with(uuid), public.is_store_owner(uuid),
  public.is_curation_owner(uuid), public.is_reading_owner(uuid) to anon;
