-- v1.3：日記筆記可同時存成心得、地方分「想去／去過」、獨立書店標記

-- ---------------------------------------------------------------------------
-- 日記筆記 ↔ 心得：一次寫完兩邊都有；當天時間軸不重複列出那則心得
-- ---------------------------------------------------------------------------
alter table public.diary_entries
  add column if not exists reading_note_id uuid references public.reading_notes (id) on delete set null;

create or replace function public.my_diary_day(p_date date default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with d as (select coalesce(p_date, public.taipei_today()) as day),
  store as (select public.my_bookstore_id() as id),
  items as (
    select e.created_at as at, jsonb_build_object(
      'type', e.kind, 'id', e.id, 'at', e.created_at, 'body', e.body, 'photo_paths', e.photo_paths,
      'is_public', e.is_public, 'place_id', e.place_id, 'place_label', e.place_label,
      'place_name', pl.name, 'place_address', pl.address, 'place_public_ok', pl.public_ok,
      'google_place_id', pl.google_place_id, 'place_category', pl.category,
      'reading_note_id', e.reading_note_id,
      'reading_id', (select n.reading_id from public.reading_notes n where n.id = e.reading_note_id),
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
      and not exists (select 1 from public.diary_entries e where e.reading_note_id = n.id)
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

-- ---------------------------------------------------------------------------
-- 獨立書店：Google 分不出連鎖或獨立 → 使用者標記，2 人以上就算；管理員可以覆寫
-- ---------------------------------------------------------------------------
alter table public.places add column if not exists indie_override boolean;

create table if not exists public.place_indie_votes (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  place_id   uuid not null references public.places (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);
alter table public.place_indie_votes enable row level security;
create policy place_indie_votes_self on public.place_indie_votes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.place_is_indie(p_place_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select indie_override from public.places where id = p_place_id),
    (select count(*) >= 2 from public.place_indie_votes v where v.place_id = p_place_id))
$$;

-- 自己標記／取消標記（只有書店類的地方可以標）
create or replace function public.set_indie_vote(p_place_id uuid, p_vote boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if p_vote then
    if not exists (select 1 from public.places where id = p_place_id and category = 'bookstore') then
      raise exception 'only bookstores can be marked independent' using errcode = '23514';
    end if;
    insert into public.place_indie_votes (user_id, place_id) values (auth.uid(), p_place_id) on conflict do nothing;
  else
    delete from public.place_indie_votes where user_id = auth.uid() and place_id = p_place_id;
  end if;
  return public.place_is_indie(p_place_id);
end $$;

-- 管理員修正（null = 交回給使用者標記）
create or replace function public.admin_set_place_indie(p_place_id uuid, p_value boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  update public.places set indie_override = p_value where id = p_place_id;
end $$;

-- ---------------------------------------------------------------------------
-- 想去：收藏地點時可以寫一句為什麼想去；在那裡打卡後就算「去過」
-- ---------------------------------------------------------------------------
alter table public.place_saves add column if not exists note text check (char_length(note) between 1 and 100);

create or replace function public.place_detail(p_place_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'place', to_jsonb(pl) - 'lat' - 'lng' - 'types' - 'indie_override',
    'is_indie', public.place_is_indie(pl.id),
    'indie_override', pl.indie_override,
    'indie_votes', (select count(*) from public.place_indie_votes v where v.place_id = pl.id),
    'my_indie_vote', exists (select 1 from public.place_indie_votes v where v.place_id = pl.id and v.user_id = auth.uid()),
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

-- p_category 多一個 'indie'（獨立書店）；回傳 is_indie
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
  select pl.id, pl.name, pl.address, pl.category, a.n,
         (select count(*)::int from public.place_saves s where s.place_id = pl.id),
         a.last,
         case when p_lat is null or pl.lat is null then null
              else (6371000 * 2 * asin(sqrt(power(sin(radians(pl.lat - p_lat) / 2), 2)
                    + cos(radians(p_lat)) * cos(radians(pl.lat)) * power(sin(radians(pl.lng - p_lng) / 2), 2))))::int end,
         coalesce((select c.photo_paths from public.public_checkins c
                   where c.place_id = pl.id and cardinality(c.photo_paths) > 0 order by c.entry_date desc limit 1), '{}'),
         exists (select 1 from public.place_saves s where s.place_id = pl.id and s.user_id = auth.uid()),
         public.place_is_indie(pl.id)
  from agg a join public.places pl on pl.id = a.place_id
  where p_category is null
     or (p_category = 'indie' and pl.category = 'bookstore' and public.place_is_indie(pl.id))
     or pl.category = p_category
  order by
    case when p_sort = 'near' and p_lat is not null and pl.lat is not null then
      (power(pl.lat - p_lat, 2) + power((pl.lng - p_lng) * cos(radians(p_lat)), 2)) end asc nulls last,
    case when p_sort = 'saves' then (select count(*) from public.place_saves s where s.place_id = pl.id) end desc nulls last,
    a.last desc, a.n desc
  limit least(greatest(p_limit, 1), 100)
$$;

-- 書櫃 › 地方：want = 存了還沒去（沒打過卡）；visited = 自己打過卡的 Google 地點（不論有沒有存）
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
  select pl.id, pl.name, pl.address, pl.category, public.place_is_indie(pl.id),
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

revoke execute on function public.set_indie_vote(uuid, boolean), public.admin_set_place_indie(uuid, boolean),
  public.my_places(text) from public, anon;
grant execute on function public.set_indie_vote(uuid, boolean), public.admin_set_place_indie(uuid, boolean),
  public.my_places(text) to authenticated;
grant execute on function public.place_is_indie(uuid), public.place_detail(uuid),
  public.explore_places(text, text, double precision, double precision, int) to anon, authenticated;
