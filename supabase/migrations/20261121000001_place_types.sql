-- v1.4：地點類型改由使用者選（不再自動分類）、獨立書店併入類型；想去整合進寫日記頁

-- ---------------------------------------------------------------------------
-- 地點類型：使用者打卡或存想去時選填；地點顯示選最多的那個（管理員可以覆寫），沒人選就不分類
-- places.category 留著當 Google 的參考，不再拿來顯示
-- ---------------------------------------------------------------------------
create table if not exists public.place_type_votes (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  place_id   uuid not null references public.places (id) on delete cascade,
  category   text not null check (category in ('bookstore', 'indie', 'library', 'cafe', 'park', 'museum', 'other')),
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);
alter table public.place_type_votes enable row level security;
create policy place_type_votes_self on public.place_type_votes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.places add column if not exists category_override text
  check (category_override in ('bookstore', 'indie', 'library', 'cafe', 'park', 'museum', 'other'));

-- 舊的獨立書店標記搬過來
insert into public.place_type_votes (user_id, place_id, category, created_at)
select user_id, place_id, 'indie', created_at from public.place_indie_votes
on conflict do nothing;
update public.places set category_override = case when indie_override then 'indie' else null end
where indie_override is not null and category_override is null;

-- 顯示的類型：覆寫 > 票數最多（同票取最早選的）> null
create or replace function public.place_category(p_place_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select category_override from public.places where id = p_place_id),
    (select v.category from public.place_type_votes v where v.place_id = p_place_id
     group by v.category order by count(*) desc, min(v.created_at) limit 1))
$$;

create or replace function public.place_is_indie(p_place_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.place_category(p_place_id) = 'indie', false)
$$;

-- 自己選或改類型；null = 取消
create or replace function public.set_place_type(p_place_id uuid, p_category text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if p_category is null then
    delete from public.place_type_votes where user_id = auth.uid() and place_id = p_place_id;
  else
    insert into public.place_type_votes (user_id, place_id, category) values (auth.uid(), p_place_id, p_category)
    on conflict (user_id, place_id) do update set category = excluded.category, created_at = now();
  end if;
  return public.place_category(p_place_id);
end $$;

-- 舊版 App 還會叫：標獨立書店 = 選「獨立書店」
create or replace function public.set_indie_vote(p_place_id uuid, p_vote boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public.set_place_type(p_place_id, case when p_vote then 'indie' else null end);
  return public.place_is_indie(p_place_id);
end $$;

create or replace function public.admin_set_place_category(p_place_id uuid, p_category text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  update public.places set category_override = p_category where id = p_place_id;
end $$;

create or replace function public.admin_set_place_indie(p_place_id uuid, p_value boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_set_place_category(p_place_id, case when p_value then 'indie' when p_value = false then 'bookstore' else null end);
end $$;

-- ---------------------------------------------------------------------------
-- 讀取函式改用使用者選的類型；日記當天多「存了想去的地方」
-- ---------------------------------------------------------------------------
create or replace function public.my_recent_places()
returns table (place_id uuid, place_label text, name text, category text, public_ok boolean, google_place_id text)
language sql stable security definer set search_path = '' as $$
  select place_id, place_label, name, category, public_ok, google_place_id from (
    select distinct on (coalesce(e.place_id::text, e.place_label))
           e.place_id, e.place_label, pl.name, public.place_category(pl.id) as category, pl.public_ok, pl.google_place_id, e.created_at
    from public.diary_entries e
    left join public.places pl on pl.id = e.place_id
    where e.user_id = auth.uid() and e.kind = 'checkin'
    order by coalesce(e.place_id::text, e.place_label), e.created_at desc
  ) x order by created_at desc limit 5
$$;

create or replace function public.place_detail(p_place_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'place', (to_jsonb(pl) - 'lat' - 'lng' - 'types' - 'indie_override' - 'category_override') || jsonb_build_object('category', public.place_category(pl.id)),
    'is_indie', public.place_category(pl.id) = 'indie',
    'category_override', pl.category_override,
    'type_votes', coalesce((select jsonb_object_agg(v.category, v.n) from (select category, count(*) as n from public.place_type_votes where place_id = pl.id group by category) v), '{}'::jsonb),
    'my_type', (select v.category from public.place_type_votes v where v.place_id = pl.id and v.user_id = auth.uid()),
    'checkin_count', (select count(*) from public.public_checkins c where c.place_id = pl.id),
    'save_count', (select count(*) from public.place_saves s where s.place_id = pl.id),
    'saved', exists (select 1 from public.place_saves s where s.place_id = pl.id and s.user_id = auth.uid()),
    'my_note', (select s.note from public.place_saves s where s.place_id = pl.id and s.user_id = auth.uid()),
    'my_checkins', (select count(*) from public.diary_entries e where e.place_id = pl.id and e.user_id = auth.uid()),
    'books', coalesce((select jsonb_agg(x) from (
        select distinct on (c.book_id) jsonb_build_object('id', c.book_id, 'title', c.book_title, 'cover_url', c.book_cover_url) as x
        from public.public_checkins c where c.place_id = pl.id and c.book_id is not null
        order by c.book_id, c.entry_date desc limit 12) b), '[]'::jsonb),
    'checkins', coalesce((select jsonb_agg(to_jsonb(c) - 'place_id' order by c.entry_date desc)
        from (select * from public.public_checkins c where c.place_id = pl.id order by c.entry_date desc limit 30) c), '[]'::jsonb))
  from public.places pl where pl.id = p_place_id
$$;

drop function if exists public.explore_places(text, text, double precision, double precision, int);
create function public.explore_places(p_sort text default 'latest', p_category text default null,
                                      p_lat double precision default null, p_lng double precision default null,
                                      p_limit int default 30)
returns table (id uuid, name text, address text, category text, checkin_count int, save_count int,
               last_checkin date, distance_m int, photo_paths text[], saved boolean, is_indie boolean)
language sql stable security definer set search_path = '' as $$
  with agg as (
    select c.place_id, count(*)::int as n, max(c.entry_date) as last
    from public.public_checkins c group by c.place_id
  )
  select pl.id, pl.name, pl.address, public.place_category(pl.id), a.n,
         (select count(*)::int from public.place_saves s where s.place_id = pl.id),
         a.last,
         case when p_lat is null or pl.lat is null then null
              else (6371000 * 2 * asin(sqrt(power(sin(radians(pl.lat - p_lat) / 2), 2)
                    + cos(radians(p_lat)) * cos(radians(pl.lat)) * power(sin(radians(pl.lng - p_lng) / 2), 2))))::int end,
         coalesce((select c.photo_paths from public.public_checkins c
                   where c.place_id = pl.id and cardinality(c.photo_paths) > 0 order by c.entry_date desc limit 1), '{}'),
         exists (select 1 from public.place_saves s where s.place_id = pl.id and s.user_id = auth.uid()),
         public.place_category(pl.id) = 'indie'
  from agg a join public.places pl on pl.id = a.place_id
  where p_category is null
     or public.place_category(pl.id) = p_category
     or (p_category = 'bookstore' and public.place_category(pl.id) = 'indie')
  order by
    case when p_sort = 'near' and p_lat is not null and pl.lat is not null then
      (power(pl.lat - p_lat, 2) + power((pl.lng - p_lng) * cos(radians(p_lat)), 2)) end asc nulls last,
    case when p_sort = 'saves' then (select count(*) from public.place_saves s where s.place_id = pl.id) end desc nulls last,
    a.last desc, a.n desc
  limit least(greatest(p_limit, 1), 100)
$$;


create or replace function public.my_places(p_kind text default 'want')
returns table (id uuid, name text, address text, category text, is_indie boolean, saved boolean, note text,
               saved_at timestamptz, my_checkins int, last_visit date, checkin_count int, photo_paths text[])
language sql stable security definer set search_path = '' as $$
  with mine as (
    select e.place_id, count(*)::int as n, max(e.entry_date) as last
    from public.diary_entries e where e.user_id = auth.uid() and e.place_id is not null group by e.place_id
  ),
  picked as (
    select s.place_id from public.place_saves s
    where p_kind = 'want' and s.user_id = auth.uid() and not exists (select 1 from mine m where m.place_id = s.place_id)
    union
    select m.place_id from mine m where p_kind = 'visited'
  )
  select pl.id, pl.name, pl.address, public.place_category(pl.id), public.place_category(pl.id) = 'indie',
         s.user_id is not null, s.note, s.created_at,
         coalesce(m.n, 0), m.last,
         (select count(*)::int from public.public_checkins c where c.place_id = pl.id),
         coalesce((select e.photo_paths from public.diary_entries e
                   where e.place_id = pl.id and e.user_id = auth.uid() and cardinality(e.photo_paths) > 0
                   order by e.created_at desc limit 1),
                  (select c.photo_paths from public.public_checkins c
                   where c.place_id = pl.id and cardinality(c.photo_paths) > 0 order by c.entry_date desc limit 1), '{}')
  from picked p
  join public.places pl on pl.id = p.place_id
  left join public.place_saves s on s.place_id = pl.id and s.user_id = auth.uid()
  left join mine m on m.place_id = pl.id
  order by coalesce(m.last::timestamptz, s.created_at) desc nulls last
$$;

create or replace function public.my_diary_day(p_date date default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with d as (select coalesce(p_date, public.taipei_today()) as day),
  store as (select public.my_bookstore_id() as id),
  items as (
    select e.created_at as at, jsonb_build_object(
      'type', e.kind, 'id', e.id, 'at', e.created_at, 'body', e.body, 'photo_paths', e.photo_paths,
      'is_public', e.is_public, 'place_id', e.place_id, 'place_label', e.place_label,
      'place_name', pl.name, 'place_address', pl.address, 'place_public_ok', pl.public_ok,
      'google_place_id', pl.google_place_id, 'place_category', public.place_category(pl.id),
      'reading_note_id', e.reading_note_id,
      'reading_id', (select n.reading_id from public.reading_notes n where n.id = e.reading_note_id),
      'note_public', (select r.is_public from public.reading_notes n join public.readings r on r.id = n.reading_id where n.id = e.reading_note_id),
      'book', case when b.id is null then null else jsonb_build_object('id', b.id, 'title', b.title, 'cover_url', b.cover_url) end
    ) as item
    from public.diary_entries e
    left join public.places pl on pl.id = e.place_id
    left join public.books b on b.id = e.book_id
    where e.user_id = auth.uid() and e.entry_date = (select day from d)
    union all
    select n.created_at, jsonb_build_object(
      'type', 'reading_note', 'id', n.id, 'at', n.created_at, 'reading_id', r.id, 'kind', n.kind, 'is_public', r.is_public,
      'title', n.title, 'body', n.body,
      'book', jsonb_build_object('id', b.id, 'title', b.title, 'cover_url', b.cover_url))
    from public.reading_notes n
    join public.readings r on r.id = n.reading_id and r.bookstore_id = (select id from store)
    join public.books b on b.id = r.book_id
    where (n.created_at at time zone 'Asia/Taipei')::date = (select day from d)
      and not exists (select 1 from public.diary_entries e where e.reading_note_id = n.id)
    union all
    select ps.created_at, jsonb_build_object(
      'type', 'want_place', 'id', ps.place_id, 'at', ps.created_at, 'note', ps.note,
      'place_name', pl.name, 'place_category', public.place_category(pl.id))
    from public.place_saves ps join public.places pl on pl.id = ps.place_id
    where ps.user_id = auth.uid() and (ps.created_at at time zone 'Asia/Taipei')::date = (select day from d)
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
      'type', 'started', 'id', r.id, 'at', null, 'reading_id', r.id, 'is_public', r.is_public,
      'book', jsonb_build_object('id', b.id, 'title', b.title, 'cover_url', b.cover_url))
    from public.readings r join public.books b on b.id = r.book_id
    where r.bookstore_id = (select id from store) and r.started_at = (select day from d)
    union all
    select (r.finished_at::timestamp at time zone 'Asia/Taipei') + interval '1 second', jsonb_build_object(
      'type', 'finished', 'id', r.id, 'at', null, 'reading_id', r.id, 'is_public', r.is_public,
      'book', jsonb_build_object('id', b.id, 'title', b.title, 'cover_url', b.cover_url))
    from public.readings r join public.books b on b.id = r.book_id
    where r.bookstore_id = (select id from store) and r.finished_at = (select day from d)
  )
  select jsonb_build_object(
    'date', (select day from d),
    'is_today', (select day from d) = public.taipei_today(),
    'items', coalesce((select jsonb_agg(item order by at desc) from items), '[]'::jsonb))
$$;


revoke execute on function public.set_place_type(uuid, text), public.admin_set_place_category(uuid, text) from public, anon;
grant execute on function public.set_place_type(uuid, text), public.admin_set_place_category(uuid, text) to authenticated;
grant execute on function public.place_category(uuid), public.place_is_indie(uuid), public.place_detail(uuid),
  public.explore_places(text, text, double precision, double precision, int) to anon, authenticated;
