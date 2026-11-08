-- M10 閱讀日記與書的地方
-- • diary_entries：筆記、打卡；只有本人看得到；只能新增／修改「今天」（台北）
-- • places：Google 地點快取（place_id 永久保存；經緯度 30 天沒更新就清掉）
-- • 公開打卡 → public_checkins；收藏的地方 → place_saves
-- • 照片：diary bucket（非公開）；公開打卡的照片別人也讀得到（看 public_checkins）

create or replace function public.taipei_today()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Taipei')::date
$$;

-- 店主閱讀的開始／讀完日期改用台北日期（原本用伺服器的 UTC 日期，凌晨會差一天）
alter table public.readings alter column started_at set default public.taipei_today();
create or replace function public.guard_reading()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.book_id <> old.book_id then
    raise exception 'book cannot be changed; remove and add again' using errcode = '42501';
  end if;
  if new.status = 'finished' and new.finished_at is null then
    new.finished_at := public.taipei_today();
  elsif new.status = 'reading' then
    new.finished_at := null;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- places
-- ---------------------------------------------------------------------------
create table public.places (
  id              uuid primary key default gen_random_uuid(),
  google_place_id text not null unique check (char_length(google_place_id) <= 300),
  name            text not null check (char_length(name) between 1 and 120),
  address         text check (char_length(address) <= 300),
  lat             double precision,
  lng             double precision,
  category        text not null default 'other' check (category in ('bookstore', 'library', 'cafe', 'park', 'museum', 'other')),
  public_ok       boolean not null default false,
  types           text[] not null default '{}',
  refreshed_at    timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
alter table public.places enable row level security;
create policy places_read on public.places for select using (true);
-- 只有 Edge Function（service role）寫入

-- ---------------------------------------------------------------------------
-- diary_entries
-- ---------------------------------------------------------------------------
create table public.diary_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  entry_date  date not null default public.taipei_today(),
  kind        text not null check (kind in ('note', 'checkin')),
  book_id     uuid references public.books (id) on delete set null,
  body        text check (char_length(body) between 1 and 500),
  place_id    uuid references public.places (id) on delete set null,
  place_label text check (char_length(place_label) between 1 and 60),
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 3),
  is_public   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint diary_has_content check (body is not null or cardinality(photo_paths) > 0 or kind = 'checkin'),
  constraint diary_checkin_place check (kind = 'note' or place_id is not null or place_label is not null),
  constraint diary_note_no_place check (kind = 'checkin' or (place_id is null and place_label is null)),
  constraint diary_public_checkin check (not is_public or (kind = 'checkin' and place_id is not null))
);
create index diary_entries_user_date_idx on public.diary_entries (user_id, entry_date desc, created_at desc);
create index diary_entries_public_place_idx on public.diary_entries (place_id, created_at desc) where is_public;
alter table public.diary_entries enable row level security;
create policy diary_self on public.diary_entries for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 只能記今天；公開只能在今天打開，但隨時可以關掉；公開的地點必須是公開場所
create or replace function public.guard_diary()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  only_unpublish boolean := tg_op = 'UPDATE'
    and old.is_public and not new.is_public
    and new.body is not distinct from old.body and new.photo_paths = old.photo_paths
    and new.place_id is not distinct from old.place_id and new.place_label is not distinct from old.place_label
    and new.book_id is not distinct from old.book_id and new.kind = old.kind and new.entry_date = old.entry_date;
begin
  new.updated_at := now();
  if only_unpublish then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.entry_date <> old.entry_date then
    raise exception 'cannot change the date' using errcode = '23514';
  end if;
  if new.entry_date <> public.taipei_today() then
    raise exception 'diary can only be written for today' using errcode = '23514';
  end if;
  if new.is_public then
    if not exists (select 1 from public.places p where p.id = new.place_id and p.public_ok) then
      raise exception 'this place cannot be public' using errcode = '23514';
    end if;
    if public.content_violation(new.body) then
      raise exception 'content not allowed' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger diary_entries_guard before insert or update on public.diary_entries
  for each row execute function public.guard_diary();

-- ---------------------------------------------------------------------------
-- place_saves
-- ---------------------------------------------------------------------------
create table public.place_saves (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  place_id   uuid not null references public.places (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);
alter table public.place_saves enable row level security;
create policy place_saves_self on public.place_saves for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 公開打卡：只有日期、沒有時間；作者顯示書店名（沒開店就顯示名稱）；封鎖雙向隱藏
-- ---------------------------------------------------------------------------
create or replace view public.public_checkins as
  select e.id, e.place_id, e.entry_date, e.body, e.photo_paths, e.book_id,
         b.title as book_title, b.cover_url as book_cover_url,
         coalesce(s.name, p.display_name) as author_name,
         s.slug as author_store_slug, s.color as author_store_color, s.avatar_path as author_avatar_path
  from public.diary_entries e
  join public.profiles p on p.id = e.user_id and p.delete_requested_at is null
  left join public.bookstores s on s.owner_id = e.user_id and s.status = 'active'
  left join public.books b on b.id = e.book_id
  where e.is_public and e.kind = 'checkin' and e.place_id is not null
    and not public.is_blocked_with(e.user_id);
grant select on public.public_checkins to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 日記 RPC
-- ---------------------------------------------------------------------------
-- 一天的時間軸：筆記、打卡＋當天的心得、加入想讀、開始讀、讀完（依時間新到舊）
create or replace function public.my_diary_day(p_date date default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with d as (select coalesce(p_date, public.taipei_today()) as day),
  store as (select public.my_bookstore_id() as id),
  items as (
    select e.created_at as at, jsonb_build_object(
      'type', e.kind, 'id', e.id, 'at', e.created_at, 'body', e.body, 'photo_paths', e.photo_paths,
      'is_public', e.is_public, 'place_id', e.place_id, 'place_label', e.place_label,
      'place_name', pl.name, 'place_address', pl.address, 'place_public_ok', pl.public_ok,
      'google_place_id', pl.google_place_id,
      'book', case when b.id is null then null else jsonb_build_object('id', b.id, 'title', b.title, 'cover_url', b.cover_url) end
    ) as item
    from public.diary_entries e
    left join public.places pl on pl.id = e.place_id
    left join public.books b on b.id = e.book_id
    where e.user_id = auth.uid() and e.entry_date = (select day from d)
    union all
    select n.created_at, jsonb_build_object(
      'type', 'reading_note', 'id', n.id, 'at', n.created_at, 'reading_id', r.id, 'kind', n.kind,
      'title', n.title, 'body', n.body,
      'book', jsonb_build_object('id', b.id, 'title', b.title, 'cover_url', b.cover_url))
    from public.reading_notes n
    join public.readings r on r.id = n.reading_id and r.bookstore_id = (select id from store)
    join public.books b on b.id = r.book_id
    where (n.created_at at time zone 'Asia/Taipei')::date = (select day from d)
    union all
    select sv.created_at, jsonb_build_object(
      'type', 'saved', 'id', sv.book_id, 'at', sv.created_at, 'source', coalesce(bs.name, sv.source_text),
      'book', jsonb_build_object('id', b.id, 'title', b.title, 'cover_url', b.cover_url))
    from public.book_saves sv
    join public.books b on b.id = sv.book_id
    left join public.bookstores bs on bs.id = sv.from_bookstore_id
    where sv.user_id = auth.uid() and (sv.created_at at time zone 'Asia/Taipei')::date = (select day from d)
    union all
    select (r.started_at::timestamp at time zone 'Asia/Taipei'), jsonb_build_object(
      'type', 'started', 'id', r.id, 'at', null, 'reading_id', r.id,
      'book', jsonb_build_object('id', b.id, 'title', b.title, 'cover_url', b.cover_url))
    from public.readings r join public.books b on b.id = r.book_id
    where r.bookstore_id = (select id from store) and r.started_at = (select day from d)
    union all
    select (r.finished_at::timestamp at time zone 'Asia/Taipei') + interval '1 second', jsonb_build_object(
      'type', 'finished', 'id', r.id, 'at', null, 'reading_id', r.id,
      'book', jsonb_build_object('id', b.id, 'title', b.title, 'cover_url', b.cover_url))
    from public.readings r join public.books b on b.id = r.book_id
    where r.bookstore_id = (select id from store) and r.finished_at = (select day from d)
  )
  select jsonb_build_object(
    'date', (select day from d),
    'is_today', (select day from d) = public.taipei_today(),
    'items', coalesce((select jsonb_agg(item order by at desc) from items), '[]'::jsonb))
$$;

-- 「有讀」的日子：有筆記、打卡或心得
create or replace function public.my_active_days(p_from date, p_to date)
returns table (day date, entries int, notes int)
language sql stable security definer set search_path = '' as $$
  with e as (
    select entry_date as day, count(*)::int as n from public.diary_entries
    where user_id = auth.uid() and entry_date between p_from and p_to group by 1
  ), n as (
    select (rn.created_at at time zone 'Asia/Taipei')::date as day, count(*)::int as n
    from public.reading_notes rn join public.readings r on r.id = rn.reading_id
    where r.bookstore_id = public.my_bookstore_id()
      and (rn.created_at at time zone 'Asia/Taipei')::date between p_from and p_to
    group by 1
  )
  select coalesce(e.day, n.day), coalesce(e.n, 0), coalesce(n.n, 0)
  from e full join n on n.day = e.day
  order by 1
$$;

create or replace function public.my_diary_streak()
returns table (current_streak int, longest_streak int, month_days int, today_done boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := public.taipei_today();
  days date[];
  d date;
  run int := 0;
  best int := 0;
  prev date;
begin
  select array_agg(a.day order by a.day) into days from public.my_active_days(today - 730, today) a;
  days := coalesce(days, '{}');
  foreach d in array days loop
    if prev is not null and d = prev + 1 then run := run + 1; else run := 1; end if;
    best := greatest(best, run);
    prev := d;
  end loop;
  today_done := today = any(days);
  -- 目前連續：今天有記就從今天往回數，沒記就從昨天往回數（今天還有機會）
  current_streak := 0;
  d := case when today_done then today else today - 1 end;
  while d = any(days) loop
    current_streak := current_streak + 1;
    d := d - 1;
  end loop;
  longest_streak := best;
  select count(*)::int into month_days from unnest(days) x where x >= date_trunc('month', today)::date;
  return next;
end $$;

create or replace function public.my_recent_places()
returns table (place_id uuid, place_label text, name text, category text, public_ok boolean, google_place_id text)
language sql stable security definer set search_path = '' as $$
  select place_id, place_label, name, category, public_ok, google_place_id from (
    select distinct on (coalesce(e.place_id::text, e.place_label))
           e.place_id, e.place_label, pl.name, pl.category, pl.public_ok, pl.google_place_id, e.created_at
    from public.diary_entries e
    left join public.places pl on pl.id = e.place_id
    where e.user_id = auth.uid() and e.kind = 'checkin'
    order by coalesce(e.place_id::text, e.place_label), e.created_at desc
  ) x order by created_at desc limit 5
$$;

-- ---------------------------------------------------------------------------
-- 書的地方 RPC
-- ---------------------------------------------------------------------------
create or replace function public.place_detail(p_place_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'place', to_jsonb(pl) - 'lat' - 'lng' - 'types',
    'checkin_count', (select count(*) from public.public_checkins c where c.place_id = pl.id),
    'save_count', (select count(*) from public.place_saves s where s.place_id = pl.id),
    'saved', exists (select 1 from public.place_saves s where s.place_id = pl.id and s.user_id = auth.uid()),
    'my_checkins', (select count(*) from public.diary_entries e where e.place_id = pl.id and e.user_id = auth.uid()),
    'books', coalesce((select jsonb_agg(x) from (
        select distinct on (c.book_id) jsonb_build_object('id', c.book_id, 'title', c.book_title, 'cover_url', c.book_cover_url) as x
        from public.public_checkins c where c.place_id = pl.id and c.book_id is not null
        order by c.book_id, c.entry_date desc limit 12) b), '[]'::jsonb),
    'checkins', coalesce((select jsonb_agg(to_jsonb(c) - 'place_id' order by c.entry_date desc)
        from (select * from public.public_checkins c where c.place_id = pl.id order by c.entry_date desc limit 30) c), '[]'::jsonb))
  from public.places pl where pl.id = p_place_id
$$;

-- p_sort：near（需要 p_lat/p_lng，只用來排序、不儲存）／latest／saves
create or replace function public.explore_places(p_sort text default 'latest', p_category text default null,
                                                 p_lat double precision default null, p_lng double precision default null,
                                                 p_limit int default 30)
returns table (id uuid, name text, address text, category text, checkin_count int, save_count int,
               last_checkin date, distance_m int, photo_paths text[], saved boolean)
language sql stable security definer set search_path = '' as $$
  with agg as (
    select c.place_id, count(*)::int as n, max(c.entry_date) as last
    from public.public_checkins c group by c.place_id
  )
  select pl.id, pl.name, pl.address, pl.category, a.n,
         (select count(*)::int from public.place_saves s where s.place_id = pl.id),
         a.last,
         case when p_lat is null or pl.lat is null then null
              else (6371000 * 2 * asin(sqrt(power(sin(radians(pl.lat - p_lat) / 2), 2)
                    + cos(radians(p_lat)) * cos(radians(pl.lat)) * power(sin(radians(pl.lng - p_lng) / 2), 2))))::int end,
         coalesce((select c.photo_paths from public.public_checkins c
                   where c.place_id = pl.id and cardinality(c.photo_paths) > 0 order by c.entry_date desc limit 1), '{}'),
         exists (select 1 from public.place_saves s where s.place_id = pl.id and s.user_id = auth.uid())
  from agg a join public.places pl on pl.id = a.place_id
  where p_category is null or pl.category = p_category
  order by
    case when p_sort = 'near' and p_lat is not null and pl.lat is not null then
      (power(pl.lat - p_lat, 2) + power((pl.lng - p_lng) * cos(radians(p_lat)), 2)) end asc nulls last,
    case when p_sort = 'saves' then (select count(*) from public.place_saves s where s.place_id = pl.id) end desc nulls last,
    a.last desc, a.n desc
  limit least(greatest(p_limit, 1), 100)
$$;

create or replace function public.my_saved_places()
returns table (id uuid, name text, address text, category text, saved_at timestamptz, my_checkins int, checkin_count int, photo_paths text[])
language sql stable security definer set search_path = '' as $$
  select pl.id, pl.name, pl.address, pl.category, s.created_at,
         (select count(*)::int from public.diary_entries e where e.place_id = pl.id and e.user_id = auth.uid()),
         (select count(*)::int from public.public_checkins c where c.place_id = pl.id),
         coalesce((select c.photo_paths from public.public_checkins c where c.place_id = pl.id and cardinality(c.photo_paths) > 0 order by c.entry_date desc limit 1), '{}')
  from public.place_saves s join public.places pl on pl.id = s.place_id
  where s.user_id = auth.uid()
  order by s.created_at desc
$$;

-- 檢舉公開打卡（24 小時內同一人同一筆只算一次）
alter type public.report_target add value if not exists 'checkin';
create or replace function public.report_checkin(p_entry_id uuid, p_reason public.report_reason, p_detail text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.public_checkins c where c.id = p_entry_id) then
    raise exception 'checkin not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.reports where reporter_id = auth.uid() and target_type::text = 'checkin'
             and target_id = p_entry_id and created_at > now() - interval '24 hours') then
    raise exception 'already reported recently' using errcode = '23505';
  end if;
  insert into public.reports (reporter_id, target_type, target_id, reason, detail)
  values (auth.uid(), 'checkin'::text::public.report_target, p_entry_id, p_reason, nullif(left(trim(p_detail), 500), ''));
end $$;

-- Google 條款：經緯度最多快取 30 天
create or replace function public.expire_place_coordinates()
returns int language sql security definer set search_path = '' as $$
  with up as (
    update public.places set lat = null, lng = null
    where lat is not null and refreshed_at < now() - interval '30 days'
    returning 1
  ) select count(*)::int from up
$$;

-- Edge Function place-search 的使用量（每人每天、全站每天）
create table public.place_search_usage (
  day     date not null default public.taipei_today(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  count   int not null default 0,
  primary key (day, user_id)
);
alter table public.place_search_usage enable row level security;

-- ---------------------------------------------------------------------------
-- 權限、儲存、排程
-- ---------------------------------------------------------------------------
revoke execute on function public.guard_diary(), public.expire_place_coordinates() from public, anon, authenticated;
revoke execute on function public.my_diary_day(date), public.my_active_days(date, date), public.my_diary_streak(),
  public.my_recent_places(), public.my_saved_places(), public.report_checkin(uuid, public.report_reason, text)
  from public, anon;
grant execute on function public.my_diary_day(date), public.my_active_days(date, date), public.my_diary_streak(),
  public.my_recent_places(), public.my_saved_places(), public.report_checkin(uuid, public.report_reason, text)
  to authenticated;
grant execute on function public.place_detail(uuid), public.explore_places(text, text, double precision, double precision, int),
  public.taipei_today() to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update on public.places to service_role;
    grant select, insert, update on public.place_search_usage to service_role;
    grant execute on function public.expire_place_coordinates() to service_role;
  end if;
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('diary', 'diary', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
    -- 路徑 {user_id}/{entry_id}/{n}.jpg：本人可讀寫；公開打卡的照片大家都能讀
    execute $p$
      create policy diary_images_read on storage.objects for select to anon, authenticated
      using (bucket_id = 'diary' and (
        (storage.foldername(name))[1] = auth.uid()::text
        or exists (select 1 from public.public_checkins c where c.id::text = (storage.foldername(name))[2])))
    $p$;
    execute $p$
      create policy diary_images_write on storage.objects for insert to authenticated
      with check (bucket_id = 'diary' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
    execute $p$
      create policy diary_images_delete on storage.objects for delete to authenticated
      using (bucket_id = 'diary' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('expire-place-coordinates', '20 3 * * *', 'select public.expire_place_coordinates()');
  end if;
end $$;
