-- v1.8 ②：活動（分享看到的書市集、簽書會…）
-- PRD 6.23 第 2 點；畫布 19. v1.8（AE1–AE4）
-- 表名用 book_events（public.events 是埋點用的）。活動是共用的一筆，每個人的分享（自己的話＋照片）掛在活動底下；同一個人對同一個活動只分享一次。

-- ---------------------------------------------------------------------------
-- 1. 表
-- ---------------------------------------------------------------------------
create table if not exists public.book_events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 40),
  event_type  text not null default 'other' check (event_type in ('market', 'signing', 'talk', 'club', 'exhibit', 'other')),
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  place_id    uuid references public.places (id) on delete set null,
  online      boolean not null default false,
  url         text check (url ~* '^https?://' and char_length(url) <= 500),
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  merged_into uuid references public.book_events (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint events_where check (place_id is not null or online),
  constraint events_end_after_start check (ends_at is null or ends_at >= starts_at)
);
create index if not exists book_events_upcoming_idx on public.book_events (starts_at) where merged_into is null;
create index if not exists book_events_place_idx on public.book_events (place_id, starts_at) where merged_into is null;

create table if not exists public.book_event_shares (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.book_events (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text check (char_length(body) between 1 and 500),
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 3),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (event_id, user_id)
);
create index if not exists book_event_shares_event_idx on public.book_event_shares (event_id, created_at desc);

create table if not exists public.book_event_going (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  event_id   uuid not null references public.book_events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create table if not exists public.book_event_reports (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.book_events (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason     text not null check (char_length(reason) between 1 and 300),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.book_events enable row level security;
alter table public.book_event_shares enable row level security;
alter table public.book_event_going enable row level security;
alter table public.book_event_reports enable row level security;

drop policy if exists events_read on public.book_events;
create policy events_read on public.book_events for select using (true);
drop policy if exists events_insert on public.book_events;
create policy events_insert on public.book_events for insert to authenticated with check (created_by = auth.uid());
-- 新增的人可以改到活動開始
drop policy if exists events_update on public.book_events;
create policy events_update on public.book_events for update to authenticated
  using (created_by = auth.uid() and starts_at > now()) with check (created_by = auth.uid());

drop policy if exists shares_read on public.book_event_shares;
create policy shares_read on public.book_event_shares for select using (true);
drop policy if exists shares_own on public.book_event_shares;
create policy shares_own on public.book_event_shares for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists going_own on public.book_event_going;
create policy going_own on public.book_event_going for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists event_reports_insert on public.book_event_reports;
create policy event_reports_insert on public.book_event_reports for insert to authenticated with check (user_id = auth.uid());

grant select on public.book_events, public.book_event_shares to anon, authenticated;
grant insert, update on public.book_events to authenticated;
grant insert, update, delete on public.book_event_shares to authenticated;
grant select, insert, delete on public.book_event_going to authenticated;
grant insert on public.book_event_reports to authenticated;

-- 地點要是公開場所；不能新增已經結束的活動；改了就更新 updated_at
create or replace function public.guard_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.place_id is not null and not exists (select 1 from public.places where id = new.place_id and public_ok) then
    raise exception 'event_private_place';
  end if;
  if tg_op = 'INSERT' and coalesce(new.ends_at, new.starts_at) < now() - interval '1 day' then
    raise exception 'event_already_over';
  end if;
  new.title := trim(new.title);
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists book_events_guard on public.book_events;
create trigger book_events_guard before insert or update on public.book_events for each row execute function public.guard_event();

-- 照片：分享的照片放在 diary bucket 的 {user}/{share_id}/…，公開可讀
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    execute 'drop policy if exists diary_images_read on storage.objects';
    execute $p$
      create policy diary_images_read on storage.objects for select to anon, authenticated
      using (bucket_id = 'diary' and (
        (storage.foldername(name))[1] = auth.uid()::text
        or exists (select 1 from public.public_posts c where c.id::text = (storage.foldername(name))[2])
        or exists (select 1 from public.book_event_shares s where s.id::text = (storage.foldername(name))[2])))
    $p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. 讀：卡片 JSON、找活動、探索、活動頁、地點頁
-- ---------------------------------------------------------------------------
create or replace function public.event_json(e public.book_events)
returns jsonb language sql stable security definer set search_path = '' as $$
  with sh as (
    select s.*, st.slug, st.name as store_name, st.color, st.avatar_path, p.display_name
    from public.book_event_shares s
    join public.profiles p on p.id = s.user_id
    left join public.bookstores st on st.owner_id = s.user_id and st.status = 'active'
    where s.event_id = e.id and not public.is_blocked_with(s.user_id)
  )
  select jsonb_build_object(
    'id', e.id, 'title', e.title, 'event_type', e.event_type, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
    'online', e.online, 'url', e.url,
    'place', (select jsonb_build_object('id', pl.id, 'name', pl.name, 'address', pl.address) from public.places pl where pl.id = e.place_id),
    'share_count', (select count(*) from sh),
    'sharers', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(x.store_name, x.display_name), 'slug', x.slug, 'color', x.color, 'avatar_path', x.avatar_path) order by x.created_at desc)
                          from (select * from sh order by created_at desc limit 3) x), '[]'::jsonb),
    'latest', (select jsonb_build_object('body', x.body, 'name', coalesce(x.store_name, x.display_name)) from sh x where x.body is not null order by x.created_at desc limit 1),
    'going_count', (select count(*) from public.book_event_going g where g.event_id = e.id),
    'i_going', exists (select 1 from public.book_event_going g where g.event_id = e.id and g.user_id = auth.uid()),
    'i_shared', exists (select 1 from public.book_event_shares s where s.event_id = e.id and s.user_id = auth.uid()),
    'mine', e.created_by = auth.uid()
  )
$$;

-- 分享前先找：名稱、地點、同一天、同一個連結；只找還沒結束的
create or replace function public.find_events(p_query text default null, p_place_id uuid default null, p_date date default null, p_url text default null, p_limit int default 10)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.event_json(e) order by e.starts_at), '[]'::jsonb)
  from (
    select e.* from public.book_events e
    left join public.places pl on pl.id = e.place_id
    where e.merged_into is null
      and coalesce(e.ends_at, e.starts_at) >= now() - interval '6 hours'
      and (
        (nullif(trim(p_query), '') is not null and (e.title ilike '%' || trim(p_query) || '%' or pl.name ilike '%' || trim(p_query) || '%'))
        or (p_place_id is not null and e.place_id = p_place_id and (p_date is null or (e.starts_at at time zone 'Asia/Taipei')::date = p_date))
        or (nullif(trim(p_url), '') is not null and e.url = trim(p_url))
      )
    order by e.starts_at
    limit least(greatest(p_limit, 1), 20)
  ) e
$$;

-- 探索 › 貼文 › 活動：一個活動一筆，依日期排、只放還沒結束的
create or replace function public.explore_events(p_limit int default 30)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.event_json(e) order by e.starts_at), '[]'::jsonb)
  from (
    select e.* from public.book_events e
    where e.merged_into is null
      and coalesce(e.ends_at, e.starts_at + interval '3 hours') >= now()
      and exists (select 1 from public.book_event_shares s where s.event_id = e.id and not public.is_blocked_with(s.user_id))
    order by e.starts_at
    limit least(greatest(p_limit, 1), 60)
  ) e
$$;

create or replace function public.event_detail(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.event_json(e) || jsonb_build_object(
    'over', coalesce(e.ends_at, e.starts_at + interval '3 hours') < now(),
    'shares', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'body', s.body, 'photo_paths', s.photo_paths, 'created_at', s.created_at, 'is_mine', s.user_id = auth.uid(),
        'author', jsonb_build_object('name', coalesce(st.name, p.display_name), 'slug', st.slug, 'color', st.color, 'avatar_path', st.avatar_path)
      ) order by s.created_at desc)
      from public.book_event_shares s
      join public.profiles p on p.id = s.user_id
      left join public.bookstores st on st.owner_id = s.user_id and st.status = 'active'
      where s.event_id = e.id and not public.is_blocked_with(s.user_id)), '[]'::jsonb))
  from public.book_events e
  where e.id = coalesce((select merged_into from public.book_events where id = p_id), p_id)
$$;

create or replace function public.place_events(p_place_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.event_json(e) order by e.starts_at), '[]'::jsonb)
  from (
    select e.* from public.book_events e
    where e.place_id = p_place_id and e.merged_into is null
      and coalesce(e.ends_at, e.starts_at + interval '3 hours') >= now()
    order by e.starts_at limit 3
  ) e
$$;

-- ---------------------------------------------------------------------------
-- 3. 寫：新增活動（重複檢查）、分享、我會去、回報
-- ---------------------------------------------------------------------------
create or replace function public.create_event(p_title text, p_type text, p_starts_at timestamptz, p_ends_at timestamptz default null,
  p_place_id uuid default null, p_online boolean default false, p_url text default null, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  dup uuid;
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;
  -- 同一個連結＝同一個活動；同一個地點同一天，先問是不是這個
  select id into dup from public.book_events
   where merged_into is null and coalesce(ends_at, starts_at) >= now() - interval '1 day'
     and ((nullif(trim(p_url), '') is not null and url = trim(p_url))
          or (not p_force and p_place_id is not null and place_id = p_place_id
              and (starts_at at time zone 'Asia/Taipei')::date = (p_starts_at at time zone 'Asia/Taipei')::date))
   order by (url = trim(coalesce(p_url, ''))) desc nulls last
   limit 1;
  if dup is not null then
    return jsonb_build_object('duplicate', (select public.event_json(e) from public.book_events e where e.id = dup));
  end if;
  insert into public.book_events (title, event_type, starts_at, ends_at, place_id, online, url)
  values (p_title, coalesce(p_type, 'other'), p_starts_at, p_ends_at, p_place_id, coalesce(p_online, false), nullif(trim(p_url), ''))
  returning id into new_id;
  return jsonb_build_object('id', new_id);
end $$;

create or replace function public.share_event(p_event_id uuid, p_body text default null, p_going boolean default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  sid uuid;
  eid uuid := coalesce((select merged_into from public.book_events where id = p_event_id), p_event_id);
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;
  if not exists (select 1 from public.book_events where id = eid) then raise exception 'event_gone'; end if;
  insert into public.book_event_shares (event_id, user_id, body)
  values (eid, auth.uid(), nullif(trim(coalesce(p_body, '')), ''))
  on conflict (event_id, user_id) do update set body = excluded.body, updated_at = now()
  returning id into sid;
  if p_going is true then insert into public.book_event_going (user_id, event_id) values (auth.uid(), eid) on conflict do nothing; end if;
  if p_going is false then delete from public.book_event_going where user_id = auth.uid() and event_id = eid; end if;
  return jsonb_build_object('id', sid, 'event_id', eid);
end $$;

create or replace function public.event_go(p_event_id uuid, p_on boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;
  if p_on then insert into public.book_event_going (user_id, event_id) values (auth.uid(), p_event_id) on conflict do nothing;
  else delete from public.book_event_going where user_id = auth.uid() and event_id = p_event_id; end if;
  return jsonb_build_object('going', p_on, 'count', (select count(*) from public.book_event_going where event_id = p_event_id));
end $$;

-- 管理員：把重複的活動合併到另一筆（分享、我會去一起搬）
create or replace function public.merge_events(p_from uuid, p_into uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.book_event_shares s set event_id = p_into
   where s.event_id = p_from and not exists (select 1 from public.book_event_shares x where x.event_id = p_into and x.user_id = s.user_id);
  delete from public.book_event_shares where event_id = p_from;
  insert into public.book_event_going (user_id, event_id) select user_id, p_into from public.book_event_going where event_id = p_from on conflict do nothing;
  delete from public.book_event_going where event_id = p_from;
  update public.book_events set merged_into = p_into where id = p_from;
end $$;

-- ---------------------------------------------------------------------------
-- 4. 前一天早上 9 點（台北）提醒「我會去」的人
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_event_reminders()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with due as (
    select g.user_id, e.* from public.book_event_going g join public.book_events e on e.id = g.event_id
    where e.merged_into is null
      and (e.starts_at at time zone 'Asia/Taipei')::date = (now() at time zone 'Asia/Taipei')::date + 1
  ), ins as (
    insert into public.notification_outbox (user_id, kind, title, body, data)
    select d.user_id, 'event',
           case when public.prefers_en(d.user_id) then 'Tomorrow: ' || d.title else '明天：' || d.title end,
           to_char(d.starts_at at time zone 'Asia/Taipei', 'MM/DD HH24:MI'),
           jsonb_build_object('url', '/event/' || d.id)
    from due d join public.notification_prefs np on np.user_id = d.user_id and np.push
    returning 1
  ) select count(*) into n from ins;
  return n;
end $$;

grant execute on function public.find_events(text, uuid, date, text, int), public.explore_events(int), public.event_detail(uuid), public.place_events(uuid) to anon, authenticated;
grant execute on function public.create_event(text, text, timestamptz, timestamptz, uuid, boolean, text, boolean), public.share_event(uuid, text, boolean),
  public.event_go(uuid, boolean), public.merge_events(uuid, uuid) to authenticated;
revoke execute on function public.event_json(public.book_events), public.enqueue_event_reminders(), public.guard_event() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('event-reminders', '0 1 * * *', 'select public.enqueue_event_reminders()');
  end if;
end $$;
