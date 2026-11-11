-- v1.5 ②：＋快速新增、日記貼文（打卡併進日記）、店主手記
-- PRD 6.18；畫布 F1–F6、G2、G4

-- ---------------------------------------------------------------------------
-- 1. 日記貼文：沒有地點的日記也能公開；有 Google 地點就是打卡（公開時要是公開場所）
--    自己輸入的地點不能公開。正在讀的紀錄可以記「讀到第幾頁」
-- ---------------------------------------------------------------------------
alter table public.diary_entries
  drop constraint if exists diary_public_checkin,
  add column if not exists page_ref text check (char_length(page_ref) between 1 and 20);
alter table public.diary_entries
  add constraint diary_public_post check (not is_public or place_label is null);

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
    if new.place_id is not null and not exists (select 1 from public.places p where p.id = new.place_id and p.public_ok) then
      raise exception 'this place cannot be public' using errcode = '23514';
    end if;
    if public.content_violation(new.body) then
      raise exception 'content not allowed' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

-- 公開貼文（探索 › 貼文、書店頁「店主手記」、地點頁共用）：作者顯示書店名
create or replace view public.public_posts as
  select e.id, e.user_id, e.entry_date, e.created_at, e.kind, e.body, e.photo_paths, e.page_ref,
         e.book_id, b.title as book_title, b.cover_url as book_cover_url,
         e.place_id, pl.name as place_name, public.place_category(pl.id) as place_category,
         coalesce(s.name, p.display_name) as author_name, s.id as author_store_id,
         s.slug as author_store_slug, s.color as author_store_color, s.avatar_path as author_avatar_path
  from public.diary_entries e
  join public.profiles p on p.id = e.user_id and p.delete_requested_at is null
  left join public.bookstores s on s.owner_id = e.user_id and s.status = 'active'
  left join public.books b on b.id = e.book_id
  left join public.places pl on pl.id = e.place_id
  where e.is_public and not public.is_blocked_with(e.user_id);
grant select on public.public_posts to anon, authenticated;

-- 照片：公開貼文的照片大家都能讀（原本只有公開打卡）
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    execute 'drop policy if exists diary_images_read on storage.objects';
    execute $p$
      create policy diary_images_read on storage.objects for select to anon, authenticated
      using (bucket_id = 'diary' and (
        (storage.foldername(name))[1] = auth.uid()::text
        or exists (select 1 from public.public_posts c where c.id::text = (storage.foldername(name))[2])))
    $p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. 想讀、想去：連結（只有自己看得到）＋這一則要不要出現在書店頁
-- ---------------------------------------------------------------------------
alter table public.book_saves
  add column if not exists link text check (char_length(link) <= 500 and link ~* '^https?://'),
  add column if not exists is_public boolean not null default false;
alter table public.place_saves
  add column if not exists link text check (char_length(link) <= 500 and link ~* '^https?://'),
  add column if not exists is_public boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3. 店主手記：想讀、想去、日記貼文混在一起依時間排
--    店主自己看全部（標出每一則讀者看不看得到）；別人只看「那一類開著＋那一則公開」
-- ---------------------------------------------------------------------------
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
      ) all_items
      order by at desc
      limit greatest(1, least(p_limit, 200))
    ) x), '[]'::jsonb);
end $$;
grant execute on function public.store_journal(uuid, int) to anon, authenticated;

-- 4. 日記時間軸多帶「讀到第幾頁」
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

