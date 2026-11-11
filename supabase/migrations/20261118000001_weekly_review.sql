-- M12 本週回顧（PRD 6.17、資料庫設計 13）
-- 回顧內容不另存，每次打開時即時計算；只存自己寫的一句話、下週想讀、第一次打開的時間。

-- 台北的週一
create or replace function public.week_start_of(p_day date)
returns date language sql immutable set search_path = '' as $$
  select p_day - (extract(isodow from p_day)::int - 1)
$$;

-- ---------------------------------------------------------------------------
-- weekly_reflections
-- ---------------------------------------------------------------------------
create table public.weekly_reflections (
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  week_start    date not null check (extract(isodow from week_start) = 1),
  body          text check (char_length(body) between 1 and 200),
  next_book_ids uuid[] not null default '{}' check (cardinality(next_book_ids) <= 3),
  opened_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, week_start)
);
alter table public.weekly_reflections enable row level security;
create policy weekly_reflections_self on public.weekly_reflections for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 一句話與下週想讀：只能在該週開始後、下一週結束前寫（week_start ≤ 今天 < week_start + 14）
create or replace function public.guard_weekly_reflection()
returns trigger language plpgsql set search_path = '' as $$
declare
  today date := public.taipei_today();
  changed boolean := tg_op = 'INSERT' and (new.body is not null or cardinality(new.next_book_ids) > 0)
    or tg_op = 'UPDATE' and (new.body is distinct from old.body or new.next_book_ids <> old.next_book_ids);
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.week_start <> old.week_start then
    raise exception 'cannot change the week' using errcode = '23514';
  end if;
  if new.week_start > today then
    raise exception 'week has not started' using errcode = '23514';
  end if;
  if changed and today >= new.week_start + 14 then
    raise exception 'reflection can no longer be edited' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger weekly_reflections_guard before insert or update on public.weekly_reflections
  for each row execute function public.guard_weekly_reflection();

-- 第一次打開回顧（日記的「上週回顧」卡片看過就縮小）
create or replace function public.mark_week_opened(p_week_start date)
returns void language sql security definer set search_path = '' as $$
  insert into public.weekly_reflections (user_id, week_start, opened_at)
  values (auth.uid(), public.week_start_of(p_week_start), now())
  on conflict (user_id, week_start) do update set opened_at = coalesce(public.weekly_reflections.opened_at, now())
$$;

-- ---------------------------------------------------------------------------
-- 某個使用者某段期間有記錄的日子（推播排程用；my_active_days 只看自己）
-- ---------------------------------------------------------------------------
create or replace function public.active_day_count(p_user uuid, p_from date, p_to date)
returns int language sql stable security definer set search_path = '' as $$
  select count(distinct d)::int from (
    select e.entry_date as d from public.diary_entries e
    where e.user_id = p_user and e.entry_date between p_from and p_to
    union
    select (n.created_at at time zone 'Asia/Taipei')::date from public.reading_notes n
    join public.readings r on r.id = n.reading_id
    join public.bookstores s on s.id = r.bookstore_id and s.owner_id = p_user
    where (n.created_at at time zone 'Asia/Taipei')::date between p_from and p_to
  ) x
$$;

-- ---------------------------------------------------------------------------
-- 一週的回顧（預設上週）
-- ---------------------------------------------------------------------------
create or replace function public.my_week_review(p_week_start date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  today date := public.taipei_today();
  ws date := public.week_start_of(coalesce(p_week_start, public.taipei_today() - 7));
  we date := ws + 6;
  sid uuid := public.my_bookstore_id();
  refl public.weekly_reflections;
  prev public.weekly_reflections;
  result jsonb;
begin
  if uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select * into refl from public.weekly_reflections where user_id = uid and week_start = ws;
  select * into prev from public.weekly_reflections where user_id = uid and week_start = ws - 7;

  with active as (
    select a.day, a.entries, a.notes from public.my_active_days(ws, we) a
  ),
  entries as (
    select e.* from public.diary_entries e where e.user_id = uid and e.entry_date between ws and we
  ),
  notes as (
    select n.*, r.book_id from public.reading_notes n
    join public.readings r on r.id = n.reading_id and r.bookstore_id = sid
    where (n.created_at at time zone 'Asia/Taipei')::date between ws and we
  ),
  rd as (
    select r.book_id, r.started_at between ws and we as started, coalesce(r.finished_at between ws and we, false) as finished
    from public.readings r where r.bookstore_id = sid
      and (r.started_at between ws and we or r.finished_at between ws and we)
  ),
  saves as (
    select sv.* from public.book_saves sv
    where sv.user_id = uid and (sv.created_at at time zone 'Asia/Taipei')::date between ws and we
  ),
  activity as (
    select book_id, 1 as n, false as started, false as finished from entries where book_id is not null
    union all select book_id, 1, false, false from notes
    union all select book_id, 0, started, finished from rd
  ),
  books as (
    select a.book_id, sum(a.n)::int as n, bool_or(a.started) as started, bool_or(a.finished) as finished
    from activity a group by a.book_id
  )
  select jsonb_build_object(
    'week_start', ws,
    'week_end', we,
    'is_current', today between ws and we,
    'days', (select jsonb_agg(jsonb_build_object('day', d::date, 'active', exists (select 1 from active where active.day = d::date)) order by d)
             from generate_series(ws, we, interval '1 day') d),
    'counts', jsonb_build_object(
      'active_days', (select count(*) from active),
      'notes', (select count(*) from entries where kind = 'note'),
      'checkins', (select count(*) from entries where kind = 'checkin'),
      'reading_notes', (select count(*) from notes),
      'saved', (select count(*) from saves),
      'started', (select count(*) from rd where started),
      'finished', (select count(*) from rd where finished)),
    'books', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'cover_url', b.cover_url,
                                 'count', x.n, 'started', x.started, 'finished', x.finished) order by x.finished desc, x.n desc, b.title)
             from (select * from books order by finished desc, n desc limit 8) x join public.books b on b.id = x.book_id), '[]'::jsonb),
    'quotes', coalesce((select jsonb_agg(q order by q->>'at' desc) from (
        select jsonb_build_object('id', n.id, 'reading_id', n.reading_id, 'kind', n.kind, 'body', n.body, 'page_ref', n.page_ref,
                                  'book_title', b.title, 'at', n.created_at) as q
        from notes n join public.books b on b.id = n.book_id
        where n.kind = 'quote' or not exists (select 1 from notes x where x.kind = 'quote')
        order by (n.kind = 'quote') desc, n.created_at desc
        limit case when exists (select 1 from notes x where x.kind = 'quote') then 3 else 1 end) q0), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('bucket', p.bucket, 'path', p.path) order by p.at desc) from (
        select * from (
          select 'diary' as bucket, unnest(e.photo_paths) as path, e.created_at as at from entries e
          union all
          select 'note-images', unnest(n.photo_paths), n.created_at from notes n
        ) y order by at desc limit 6) p), '[]'::jsonb),
    'places', coalesce((select jsonb_agg(jsonb_build_object('place_id', pl.place_id, 'name', pl.name, 'count', pl.n) order by pl.n desc, pl.name) from (
        select e.place_id, coalesce(p.name, e.place_label) as name, count(*)::int as n
        from entries e left join public.places p on p.id = e.place_id
        where e.kind = 'checkin' group by e.place_id, coalesce(p.name, e.place_label)) pl), '[]'::jsonb),
    'store', case when sid is null then null else jsonb_build_object(
      'visits', (select count(*) from public.curation_visits v join public.curations c on c.id = v.curation_id
                 where c.bookstore_id = sid and v.visit_date between ws and we),
      'new_followers', (select count(*) from public.follows f where f.bookstore_id = sid
                        and (f.created_at at time zone 'Asia/Taipei')::date between ws and we),
      'saves', (select count(*) from public.book_saves sv where sv.from_bookstore_id = sid
                and (sv.created_at at time zone 'Asia/Taipei')::date between ws and we),
      'top_curation', (select jsonb_build_object('id', c.id, 'title', c.title, 'visits', count(*))
                       from public.curation_visits v join public.curations c on c.id = v.curation_id
                       where c.bookstore_id = sid and v.visit_date between ws and we
                       group by c.id, c.title order by count(*) desc limit 1)) end,
    'reflection', jsonb_build_object(
      'body', refl.body,
      'next_books', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'cover_url', b.cover_url) order by array_position(refl.next_book_ids, b.id))
                              from public.books b where b.id = any(refl.next_book_ids)), '[]'::jsonb),
      'opened_at', refl.opened_at,
      'editable', today >= ws and today < ws + 14),
    'last_week_next', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'cover_url', b.cover_url,
                                  'read', exists (select 1 from books x where x.book_id = b.id)) order by array_position(prev.next_book_ids, b.id))
                                from public.books b where b.id = any(prev.next_book_ids)), '[]'::jsonb),
    'suggestion', (select jsonb_build_object('id', b.id, 'title', b.title, 'cover_url', b.cover_url)
                   from public.book_saves sv join public.books b on b.id = sv.book_id
                   where sv.user_id = uid order by sv.created_at desc limit 1)
  ) into result;
  return result;
end $$;

-- 過去每一週的摘要（W5）：從開始使用的那週到這週，最多 p_limit 週
create or replace function public.my_week_list(p_limit int default 12)
returns table (week_start date, active_days int, reading_notes int, has_reflection boolean)
language sql stable security definer set search_path = '' as $$
  with bounds as (
    select public.week_start_of(public.taipei_today()) as this_week,
           greatest(public.week_start_of((p.created_at at time zone 'Asia/Taipei')::date),
                    public.week_start_of(public.taipei_today()) - 7 * (least(greatest(p_limit, 1), 52) - 1)) as first_week
    from public.profiles p where p.id = auth.uid()
  ),
  weeks as (
    select w::date as ws from bounds, generate_series(bounds.first_week, bounds.this_week, interval '7 days') w
  ),
  act as (
    select public.week_start_of(a.day) as ws, count(*)::int as days, sum(a.notes)::int as notes
    from bounds, public.my_active_days(bounds.first_week, bounds.this_week + 6) a group by 1
  )
  select w.ws, coalesce(a.days, 0), coalesce(a.notes, 0),
         exists (select 1 from public.weekly_reflections r where r.user_id = auth.uid() and r.week_start = w.ws
                 and (r.body is not null or cardinality(r.next_book_ids) > 0))
  from weeks w left join act a on a.ws = w.ws
  order by w.ws desc
$$;

-- ---------------------------------------------------------------------------
-- 推播：週一 08:30（台北）「上週回顧好了」；上週沒有紀錄就不推；只含天數
-- ---------------------------------------------------------------------------
alter table public.notification_prefs add column if not exists weekly_review boolean not null default true;

alter table public.notification_outbox drop constraint if exists notification_outbox_kind_check;
alter table public.notification_outbox add constraint notification_outbox_kind_check
  check (kind in ('new_curation', 'new_follower', 'monthly_reminder', 'moderation', 'feedback', 'onboarding', 'weekly_review'));

create or replace function public.enqueue_weekly_reviews()
returns int language plpgsql security definer set search_path = '' as $$
declare
  ws date := public.week_start_of(public.taipei_today() - 7);
  n int;
begin
  with candidates as (
    -- 沒有設定列的人用預設值（推播開、每週回顧開）；只看有推播 token 的人
    select p.id as user_id, public.active_day_count(p.id, ws, ws + 6) as days
    from public.profiles p
    left join public.notification_prefs np on np.user_id = p.id
    where p.delete_requested_at is null
      and coalesce(np.push, true) and coalesce(np.weekly_review, true)
      and exists (select 1 from public.push_tokens t where t.user_id = p.id)
  ),
  ins as (
    insert into public.notification_outbox (user_id, kind, title, body, data)
    select c.user_id, 'weekly_review',
           case when public.prefers_en(c.user_id) then 'Your week in reading' else '上週回顧好了' end,
           case when public.prefers_en(c.user_id)
                then format('You read on %s %s last week. Take a look back and pick what to read next.', c.days, case when c.days = 1 then 'day' else 'days' end)
                else format('上週你讀了 %s 天，來看看這一週，順便挑下週想讀的書。', c.days) end,
           jsonb_build_object('url', '/diary/week/' || ws::text, 'week', ws::text)
    from candidates c
    where c.days > 0
      and not exists (select 1 from public.notification_outbox o
                      where o.user_id = c.user_id and o.kind = 'weekly_review' and o.data->>'week' = ws::text)
    returning 1
  ) select count(*) into n from ins;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 權限、排程
-- ---------------------------------------------------------------------------
revoke execute on function public.guard_weekly_reflection(), public.enqueue_weekly_reviews(),
  public.active_day_count(uuid, date, date) from public, anon, authenticated;
revoke execute on function public.my_week_review(date), public.my_week_list(int), public.mark_week_opened(date) from public, anon;
grant execute on function public.my_week_review(date), public.my_week_list(int), public.mark_week_opened(date) to authenticated;
grant execute on function public.week_start_of(date) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.enqueue_weekly_reviews() to service_role;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- 台北週一 08:30 = UTC 週一 00:30
    perform cron.schedule('weekly-reviews', '30 0 * * 1', 'select public.enqueue_weekly_reviews()');
  end if;
end $$;
