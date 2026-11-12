-- v1.5：想去可以記一檔活動（多日選起訖 range、活動連結）；只有自己看得到，跟著 place_saves 走

alter table public.place_saves
  add column if not exists event_starts_on date,
  add column if not exists event_ends_on date,
  add column if not exists event_url text;

alter table public.place_saves drop constraint if exists place_saves_event_range_check;
alter table public.place_saves add constraint place_saves_event_range_check
  check ((event_starts_on is null) = (event_ends_on is null)
         and (event_starts_on is null or event_ends_on >= event_starts_on));

alter table public.place_saves drop constraint if exists place_saves_event_url_check;
alter table public.place_saves add constraint place_saves_event_url_check
  check (event_url is null or (char_length(event_url) <= 2048 and event_url ~ '^https?://'));

-- 書櫃 › 地方：多回傳活動日期與連結，想去卡片才顯示得到
drop function if exists public.my_places(text);
create function public.my_places(p_kind text default 'want')
returns table (id uuid, name text, address text, category text, is_indie boolean, saved boolean, note text,
               event_starts_on date, event_ends_on date, event_url text,
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
         s.user_id is not null, s.note, s.event_starts_on, s.event_ends_on, s.event_url, s.created_at,
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
  order by case when p_kind = 'want' then s.event_starts_on end asc nulls last,
           coalesce(m.last::timestamptz, s.created_at) desc nulls last
$$;

-- 地點頁：編輯想去時要帶回自己存的活動日期與連結
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
    'my_event_starts_on', (select s.event_starts_on from public.place_saves s where s.place_id = pl.id and s.user_id = auth.uid()),
    'my_event_ends_on', (select s.event_ends_on from public.place_saves s where s.place_id = pl.id and s.user_id = auth.uid()),
    'my_event_url', (select s.event_url from public.place_saves s where s.place_id = pl.id and s.user_id = auth.uid()),
    'my_checkins', (select count(*) from public.diary_entries e where e.place_id = pl.id and e.user_id = auth.uid()),
    'books', coalesce((select jsonb_agg(x) from (
        select distinct on (c.book_id) jsonb_build_object('id', c.book_id, 'title', c.book_title, 'cover_url', c.book_cover_url) as x
        from public.public_checkins c where c.place_id = pl.id and c.book_id is not null
        order by c.book_id, c.entry_date desc limit 12) b), '[]'::jsonb),
    'checkins', coalesce((select jsonb_agg(to_jsonb(c) - 'place_id' order by c.entry_date desc)
        from (select * from public.public_checkins c where c.place_id = pl.id order by c.entry_date desc limit 30) c), '[]'::jsonb))
  from public.places pl where pl.id = p_place_id
$$;

grant execute on function public.my_places(text) to authenticated;
grant execute on function public.place_detail(uuid) to anon, authenticated;

-- 日記時間軸的「存了想去的地方」也帶活動日期與連結
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
      'event_starts_on', ps.event_starts_on, 'event_ends_on', ps.event_ends_on, 'event_url', ps.event_url,
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
