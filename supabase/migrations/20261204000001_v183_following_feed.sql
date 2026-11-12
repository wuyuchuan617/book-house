-- v1.8.3 AK21：探索 › 追蹤動態
-- 不加動態表：從現有的表即時組出來。同一間書店、同一天（台北時間）合成一組。
-- profiles.feed_seen_at：上次看到哪（畫「上次看到這裡」與分頁小紅點）。

alter table public.profiles add column if not exists feed_seen_at timestamptz;

-- 追蹤中書店的所有動作（只算書店公開設定有開的類別；排除封鎖、停權、刪除中的書店）
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
           'place', (select p.name from public.places p where p.id = e.place_id and p.public_ok))
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

-- 動態：依書店＋台北日期分組，每組最多 4 行；p_before 分頁（傳上一頁最後一組的 latest_at）
create or replace function public.following_feed(p_before timestamptz default null, p_limit int default 20)
returns jsonb language sql stable security definer set search_path = '' as $$
  with a as (
    select x.*, (x.at at time zone 'Asia/Taipei')::date as day
    from public.feed_acts(auth.uid()) x
    where x.at is not null and x.at <= now()
  ),
  g as (
    select a.store_id, a.day, max(a.at) as latest_at, count(*) as n,
           (jsonb_agg(jsonb_build_object('kind', a.kind, 'at', a.at, 'ref', a.ref, 'data', a.data) order by a.at desc)) as items
    from a group by a.store_id, a.day
  ),
  page as (
    select * from g
    where p_before is null or g.latest_at < p_before
    order by g.latest_at desc
    limit least(greatest(p_limit, 1), 50)
  )
  select jsonb_build_object(
    'seen_at', (select p.feed_seen_at from public.profiles p where p.id = auth.uid()),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'store', (select jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.name, 'color', s.color, 'avatar_path', s.avatar_path)
                    from public.bookstores s where s.id = page.store_id),
        'day', page.day,
        'latest_at', page.latest_at,
        'items', (select coalesce(jsonb_agg(e), '[]'::jsonb) from (select e from jsonb_array_elements(page.items) with ordinality t(e, i) where i <= 4) z),
        'more', greatest(page.n - 4, 0)
      ) order by page.latest_at desc)
      from page), '[]'::jsonb)
  )
$$;

-- 分頁小紅點：有沒有比上次看到更新的
create or replace function public.feed_unread()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.feed_acts(auth.uid()) x
    where x.at <= now()
      and x.at > coalesce((select p.feed_seen_at from public.profiles p where p.id = auth.uid()), '-infinity'::timestamptz)
  )
$$;

create or replace function public.mark_feed_seen()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set feed_seen_at = now() where id = auth.uid()
$$;

-- 還沒追蹤時推薦：本月有上架策展、最近 14 天有公開手記，再看追蹤數
create or replace function public.suggest_stores(p_limit int default 5)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(z.j order by z.score desc, z.followers desc), '[]'::jsonb) from (
    select jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.name, 'color', s.color, 'avatar_path', s.avatar_path,
             'follower_count', public.follower_count(s.id), 'reason', case when cur then 'curation' when post then 'post' else null end) as j,
           (case when cur then 2 else 0 end + case when post then 1 else 0 end) as score,
           public.follower_count(s.id) as followers
    from public.bookstores s
    cross join lateral (select
      exists (select 1 from public.curations c where c.bookstore_id = s.id and c.status = 'published' and c.period = public.current_period()) as cur,
      exists (select 1 from public.diary_entries e where e.user_id = s.owner_id and e.is_public and s.show_post and e.created_at > now() - interval '14 days') as post) q
    where public.is_store_visible(s.id)
      and s.owner_id is distinct from auth.uid()
      and not exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.bookstore_id = s.id)
      and (cur or post)
    order by 2 desc, 3 desc
    limit least(greatest(p_limit, 1), 10)
  ) z
$$;

grant execute on function public.following_feed(timestamptz, int), public.feed_unread(), public.mark_feed_seen(), public.suggest_stores(int) to authenticated;
