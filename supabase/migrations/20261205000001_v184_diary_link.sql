-- v1.8.4 AK22：日記加連結（YouTube、Podcast、文章…）
alter table public.diary_entries add column if not exists link text;
alter table public.diary_entries add column if not exists link_title text;
alter table public.diary_entries drop constraint if exists diary_link_ok;
alter table public.diary_entries add constraint diary_link_ok check (
  (link is null or (link ~* '^https?://[^ ]+$' and char_length(link) <= 500))
  and (link_title is null or char_length(link_title) <= 200)
  and (link is not null or link_title is null));


-- 日記頁帶出連結
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
      'reading_note_id', e.reading_note_id, 'page_ref', e.page_ref, 'link', e.link, 'link_title', e.link_title,
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

-- 手記帶出連結
create or replace function public.store_journal(p_bookstore_id uuid, p_limit int default 60)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s public.bookstores;
  mine boolean;
begin
  select * into s from public.bookstores where id = p_bookstore_id;
  if not found then
    return '[]'::jsonb;
  end if;
  mine := s.owner_id = auth.uid();
  if not mine and not public.is_store_visible(s.id) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(item order by at desc) from (
      select * from (
        select sv.created_at as at, jsonb_build_object(
          'type', 'want', 'id', sv.book_id, 'at', sv.created_at, 'is_public', sv.is_public,
          'shown', s.show_want and sv.is_public,
          'note', sv.note, 'source_text', sv.source_text,
          'book', jsonb_build_object('id', b.id, 'title', b.title, 'authors', b.authors, 'cover_url', b.cover_url)) as item
        from public.book_saves sv join public.books b on b.id = sv.book_id
        where sv.user_id = s.owner_id and (mine or (s.show_want and sv.is_public))
        union all
        select ps.created_at, jsonb_build_object(
          'type', 'place', 'id', ps.place_id, 'at', ps.created_at, 'is_public', ps.is_public and pl.public_ok,
          'shown', s.show_place and ps.is_public and pl.public_ok,
          'note', ps.note, 'public_ok', pl.public_ok,
          'place', jsonb_build_object('id', pl.id, 'name', pl.name, 'category', public.place_category(pl.id)))
        from public.place_saves ps join public.places pl on pl.id = ps.place_id
        where ps.user_id = s.owner_id and (mine or (s.show_place and ps.is_public and pl.public_ok))
        union all
        select e.created_at, jsonb_build_object(
          'type', 'post', 'id', e.id, 'at', e.created_at, 'is_public', e.is_public,
          'shown', s.show_post and e.is_public,
          'kind', e.kind, 'entry_date', e.entry_date, 'body', e.body, 'photo_paths', e.photo_paths, 'page_ref', e.page_ref, 'link', e.link, 'link_title', e.link_title,
          'place', case when pl.id is null then null else jsonb_build_object('id', pl.id, 'name', pl.name) end,
          'place_label', case when mine then e.place_label end,
          'book', case when b.id is null then null else jsonb_build_object('id', b.id, 'title', b.title, 'cover_url', b.cover_url) end)
        from public.diary_entries e
        left join public.places pl on pl.id = e.place_id
        left join public.books b on b.id = e.book_id
        where e.user_id = s.owner_id and (mine or (s.show_post and e.is_public))
        union all
        select r.created_at, jsonb_build_object(
          'type', 'rx_reply', 'id', r.id, 'at', r.created_at, 'is_public', true, 'shown', s.show_rx,
          'reason', r.reason, 'prescription', jsonb_build_object('id', p.id, 'title', p.title),
          'book', jsonb_build_object('id', b.id, 'title', b.title, 'cover_url', b.cover_url))
        from public.prescription_replies r
        join public.prescriptions p on p.id = r.prescription_id
        join public.books b on b.id = r.book_id
        where r.user_id = s.owner_id and (mine or (s.show_rx and not public.is_blocked_with(p.user_id)))
        union all
        select p.created_at, jsonb_build_object(
          'type', 'rx', 'id', p.id, 'at', p.created_at, 'is_public', not p.anonymous, 'shown', s.show_rx and not p.anonymous,
          'title', p.title, 'reply_count', (select count(*) from public.prescription_replies r where r.prescription_id = p.id),
          'is_open', p.closed_at is null and p.closes_at > now())
        from public.prescriptions p
        where p.user_id = s.owner_id and (mine or (s.show_rx and not p.anonymous))
        union all
        select sh.created_at, jsonb_build_object(
          'type', 'event_share', 'id', sh.id, 'at', sh.created_at, 'is_public', true, 'shown', s.show_post,
          'body', sh.body, 'photo_paths', sh.photo_paths,
          'event', jsonb_build_object('id', ev.id, 'title', ev.title, 'event_type', ev.event_type, 'starts_at', ev.starts_at, 'ends_at', ev.ends_at,
                                      'online', ev.online, 'place', case when pl.id is null then null else jsonb_build_object('id', pl.id, 'name', pl.name) end,
                                      'going_count', (select count(*) from public.book_event_going g where g.event_id = ev.id),
                                      'over', coalesce(ev.ends_at, ev.starts_at + interval '3 hours') < now()))
        from public.book_event_shares sh
        join public.book_events ev on ev.id = sh.event_id and ev.merged_into is null
        left join public.places pl on pl.id = ev.place_id
        where sh.user_id = s.owner_id and (mine or s.show_post)
      ) all_items
      order by at desc
      limit greatest(1, least(p_limit, 200))
    ) x), '[]'::jsonb);
end $$;

-- 卡片多回「最新一則分享的時間」，探索「全部」用它跟貼文一起排
create or replace function public.event_latest_at(p_event_id uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select max(s.created_at) from public.book_event_shares s where s.event_id = p_event_id and not public.is_blocked_with(s.user_id)
$$;

-- 探索 › 手記帶出連結
create or replace function public.explore_posts(
  p_filter text default 'all',
  p_lat double precision default null,
  p_lng double precision default null,
  p_before timestamptz default null,
  p_limit int default 30,
  p_query text default null
) returns jsonb
language sql stable security definer set search_path = '' as $$
  with q as (select nullif(trim(p_query), '') as t)
  select coalesce(jsonb_agg(to_jsonb(x) - 'sort_key' order by x.sort_key nulls last, x.created_at desc), '[]'::jsonb)
  from (
    select * from (
      select 'diary' as source, p.id, p.created_at, p.entry_date, p.kind, null::text as note_kind, null::text as title,
             p.body, p.photo_paths, p.page_ref,
             p.book_id, p.book_title, p.book_cover_url,
             p.place_id, p.place_name, p.place_category,
             p.author_name, p.author_store_slug, p.author_store_color, p.author_avatar_path,
             (select e.link from public.diary_entries e where e.id = p.id) as link,
             (select e.link_title from public.diary_entries e where e.id = p.id) as link_title,
             p.user_id = auth.uid() as is_mine,
             case when p_lat is null or pl.lat is null then null
                  else (6371000 * 2 * asin(sqrt(power(sin(radians(pl.lat - p_lat) / 2), 2)
                        + cos(radians(p_lat)) * cos(radians(pl.lat)) * power(sin(radians(pl.lng - p_lng) / 2), 2))))::int end as distance_m,
             case when p_filter = 'near' and p_lat is not null and pl.lat is not null
                  then power(pl.lat - p_lat, 2) + power((pl.lng - p_lng) * cos(radians(p_lat)), 2) end as sort_key
      from public.public_posts p
      left join public.places pl on pl.id = p.place_id, q
      where (p_before is null or p.created_at < p_before)
        and (p_filter <> 'following' or exists (
              select 1 from public.follows f where f.follower_id = auth.uid() and f.bookstore_id = p.author_store_id))
        and (p_filter <> 'near' or p.place_id is not null)
        and (q.t is null or p.body ilike '%' || q.t || '%' or p.book_title ilike '%' || q.t || '%' or p.place_name ilike '%' || q.t || '%')
      union all
      select 'note', n.id, n.created_at, (n.created_at at time zone 'Asia/Taipei')::date, 'note', n.note_kind, n.title,
             n.body, n.photo_paths, n.page_ref,
             n.book_id, n.book_title, n.book_cover_url,
             null::uuid, null::text, null::text,
             n.author_name, n.author_store_slug, n.author_store_color, n.author_avatar_path,
             null::text, null::text,
             n.user_id = auth.uid(), null::int, null::double precision
      from public.public_notes n, q
      where p_filter <> 'near'
        and (p_before is null or n.created_at < p_before)
        and (p_filter <> 'following' or exists (
              select 1 from public.follows f where f.follower_id = auth.uid() and f.bookstore_id = n.author_store_id))
        and (q.t is null or n.body ilike '%' || q.t || '%' or n.title ilike '%' || q.t || '%' or n.book_title ilike '%' || q.t || '%')
    ) u
    order by u.sort_key asc nulls last, u.created_at desc
    limit greatest(1, least(p_limit, 100))
  ) x
$$;

-- 追蹤動態帶出連結
create or replace function public.feed_acts(p_user uuid)
returns table (store_id uuid, kind text, at timestamptz, ref uuid, data jsonb)
language sql stable security definer set search_path = '' as $$
  with f as (
    select s.id, s.owner_id, s.show_post, s.show_reading, s.show_trip, s.show_rx
    from public.follows fo
    join public.bookstores s on s.id = fo.bookstore_id
    where fo.follower_id = p_user
      and public.is_store_visible(s.id)
      and not public.is_blocked_with(s.owner_id)
  )
  -- 上架的策展
  select f.id, 'curation', c.published_at, c.id,
         jsonb_build_object('title', c.title, 'period', c.period,
           'book_count', (select count(*) from public.curation_items i where i.curation_id = c.id),
           'covers', coalesce((select jsonb_agg(jsonb_build_object('title', b.title, 'cover_url', b.cover_url) order by i.position)
                                 from (select * from public.curation_items i2 where i2.curation_id = c.id order by i2.position limit 3) i
                                 join public.books b on b.id = i.book_id), '[]'::jsonb))
  from public.curations c join f on f.id = c.bookstore_id
  where c.status = 'published' and c.published_at is not null
  union all
  -- 開了預告
  select f.id, 'teaser', c.updated_at, c.id,
         jsonb_build_object('title', c.title, 'period', c.period)
  from public.curations c join f on f.id = c.bookstore_id
  where c.teaser_on and c.status <> 'published' and c.period > public.current_period()
  union all
  -- 公開的手記（日記、打卡）
  select f.id, 'post', e.created_at, e.id,
         jsonb_build_object('entry_kind', e.kind, 'body', left(coalesce(e.body, ''), 80),
           'place', (select p.name from public.places p where p.id = e.place_id and p.public_ok), 'link', e.link, 'link_title', e.link_title)
  from public.diary_entries e join f on f.owner_id = e.user_id
  where e.is_public and f.show_post
  union all
  -- 開始讀
  select f.id, 'reading_started', r.created_at, r.id,
         jsonb_build_object('book', (select jsonb_build_object('id', b.id, 'title', b.title) from public.books b where b.id = r.book_id))
  from public.readings r join f on f.id = r.bookstore_id
  where r.is_public and f.show_reading
  union all
  -- 讀完
  select f.id, 'reading_finished', r.updated_at, r.id,
         jsonb_build_object('book', (select jsonb_build_object('id', b.id, 'title', b.title) from public.books b where b.id = r.book_id))
  from public.readings r join f on f.id = r.bookstore_id
  where r.is_public and f.show_reading and r.status = 'finished' and r.updated_at > r.created_at + interval '1 minute'
  union all
  -- 整理的書旅
  select f.id, 'trip', t.updated_at, t.id, jsonb_build_object('title', t.title, 'city', t.city)
  from public.trips t join f on f.owner_id = t.user_id
  where t.status = 'published' and f.show_trip
  union all
  -- 用書店身分發起的處方箋
  select f.id, 'rx', p.created_at, p.id, jsonb_build_object('title', p.title)
  from public.prescriptions p join f on f.owner_id = p.user_id
  where not p.anonymous and f.show_rx
  union all
  -- 開的處方
  select f.id, 'rx_reply', x.created_at, x.prescription_id,
         jsonb_build_object('title', (select p.title from public.prescriptions p where p.id = x.prescription_id),
                            'book', (select jsonb_build_object('id', b.id, 'title', b.title) from public.books b where b.id = x.book_id))
  from public.prescription_replies x join f on f.owner_id = x.user_id
  where f.show_rx
  union all
  -- 分享的活動
  select f.id, 'event_share', s.created_at, s.event_id,
         jsonb_build_object('title', ev.title, 'starts_at', ev.starts_at)
  from public.book_event_shares s
  join public.book_events ev on ev.id = s.event_id and ev.merged_into is null
  join f on f.owner_id = s.user_id
  where f.show_post
$$;
revoke execute on function public.feed_acts(uuid) from public, anon, authenticated;
