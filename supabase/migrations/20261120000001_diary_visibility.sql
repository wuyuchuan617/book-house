-- v1.3.1 日記時間軸標出公開／只有自己：心得、開始讀、讀完帶上那本書的公開設定

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

