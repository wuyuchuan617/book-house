-- v1.8.1：分享活動也記進日記（日記頁時間軸、月曆、連續天數）；書旅卡片的路線預覽

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
      'reading_note_id', e.reading_note_id, 'page_ref', e.page_ref,
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
    select sh.created_at, jsonb_build_object(
      'type', 'event_share', 'id', sh.id, 'at', sh.created_at, 'is_public', true,
      'body', sh.body, 'photo_paths', sh.photo_paths,
      'event', jsonb_build_object('id', ev.id, 'title', ev.title, 'event_type', ev.event_type, 'starts_at', ev.starts_at, 'ends_at', ev.ends_at,
                                  'online', ev.online, 'place', case when pl.id is null then null else jsonb_build_object('id', pl.id, 'name', pl.name) end,
                                  'going_count', (select count(*) from public.book_event_going g where g.event_id = ev.id),
                                  'over', coalesce(ev.ends_at, ev.starts_at + interval '3 hours') < now()))
    from public.book_event_shares sh
    join public.book_events ev on ev.id = sh.event_id and ev.merged_into is null
    left join public.places pl on pl.id = ev.place_id
    where sh.user_id = auth.uid() and (sh.created_at at time zone 'Asia/Taipei')::date = (select day from d)
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

create or replace function public.my_active_days(p_from date, p_to date)
returns table (day date, entries int, notes int)
language sql stable security definer set search_path = '' as $$
  with e as (
    select x.day, count(*)::int as n from (
      select entry_date as day from public.diary_entries
      where user_id = auth.uid() and entry_date between p_from and p_to
      union all
      select (s.created_at at time zone 'Asia/Taipei')::date from public.book_event_shares s
      join public.book_events ev on ev.id = s.event_id and ev.merged_into is null
      where s.user_id = auth.uid() and (s.created_at at time zone 'Asia/Taipei')::date between p_from and p_to
    ) x group by 1
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

create or replace function public.trip_json(t public.trips, p_stops boolean default false)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', t.id, 'city', t.city, 'title', t.title, 'intro', t.intro, 'days', t.days, 'status', t.status, 'updated_at', t.updated_at,
    'is_mine', t.user_id = auth.uid(),
    'author', (select jsonb_build_object('name', coalesce(s.name, p.display_name), 'slug', s.slug, 'color', s.color, 'avatar_path', s.avatar_path)
                 from public.profiles p left join public.bookstores s on s.owner_id = p.id and s.status = 'active' where p.id = t.user_id),
    'stop_count', (select count(*) from public.trip_stops x where x.trip_id = t.id),
    'bookstore_count', (select count(*) from public.trip_stops x join public.places pl on pl.id = x.place_id
                         where x.trip_id = t.id and coalesce(pl.category_override, pl.category) in ('bookstore', 'indie')),
    'save_count', (select count(*) from public.trip_saves v where v.trip_id = t.id),
    'saved', exists (select 1 from public.trip_saves v where v.trip_id = t.id and v.user_id = auth.uid()),
    -- v1.8.1 AJ3：卡片上的路線預覽（前 5 站：名稱＋類型）
    'preview', coalesce((select jsonb_agg(jsonb_build_object('name', y.name, 'category', y.category) order by y.day, y.position) from (
      select pl.name, coalesce(pl.category_override, pl.category) as category, x.day, x.position
      from public.trip_stops x join public.places pl on pl.id = x.place_id where x.trip_id = t.id
      order by x.day, x.position limit 5) y), '[]'::jsonb),
    'stops', case when p_stops then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'day', x.day, 'position', x.position, 'note', x.note, 'slot', x.slot,
        'place', jsonb_build_object('id', pl.id, 'name', pl.name, 'address', pl.address, 'lat', pl.lat, 'lng', pl.lng,
                                    'category', coalesce(pl.category_override, pl.category), 'google_place_id', pl.google_place_id)
      ) order by x.day, x.position)
      from public.trip_stops x join public.places pl on pl.id = x.place_id where x.trip_id = t.id), '[]'::jsonb) end
  )
$$;
revoke execute on function public.trip_json(public.trips, boolean) from public, anon, authenticated;
