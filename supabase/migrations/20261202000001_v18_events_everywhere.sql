-- v1.8 ④：活動出現在探索「全部」、書店頁與我的書店的手記
-- PRD 6.23 活動補強（AI2、AI3）

-- 手記多一種「分享活動」：跟日記貼文一樣看公開設定「手記」（show_post）
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
          'kind', e.kind, 'entry_date', e.entry_date, 'body', e.body, 'photo_paths', e.photo_paths, 'page_ref', e.page_ref,
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

-- 探索 › 貼文：p_following＝只放追蹤的書店分享過的；p_lat／p_lng＝地點在附近（約 15 公里）的
drop function if exists public.explore_events(int);
create or replace function public.explore_events(p_limit int default 30, p_following boolean default false, p_lat double precision default null, p_lng double precision default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.event_json(e) || jsonb_build_object('latest_at', public.event_latest_at(e.id)) order by e.starts_at), '[]'::jsonb)
  from (
    select e.* from public.book_events e
    left join public.places pl on pl.id = e.place_id
    where e.merged_into is null
      and coalesce(e.ends_at, e.starts_at + interval '3 hours') >= now()
      and exists (select 1 from public.book_event_shares s where s.event_id = e.id and not public.is_blocked_with(s.user_id))
      and (not p_following or exists (
        select 1 from public.book_event_shares s join public.bookstores st on st.owner_id = s.user_id
        join public.follows f on f.bookstore_id = st.id and f.follower_id = auth.uid()
        where s.event_id = e.id))
      and (p_lat is null or (pl.lat is not null and abs(pl.lat - p_lat) < 0.14 and abs(pl.lng - p_lng) < 0.15))
    order by e.starts_at
    limit least(greatest(p_limit, 1), 60)
  ) e
$$;
grant execute on function public.explore_events(int, boolean, double precision, double precision) to anon, authenticated;
revoke execute on function public.event_latest_at(uuid) from public, anon, authenticated;
