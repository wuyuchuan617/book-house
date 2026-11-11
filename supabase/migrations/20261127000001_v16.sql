-- v1.6：新增頁統一、我的書店改版、處方簽獨立、探索搜尋與篩選、通知列表
-- PRD 6.20；畫布 V1–V5、W1–W9

-- ---------------------------------------------------------------------------
-- 1. 想讀、想去不再一則一則選公開：要不要出現在書店頁只看「公開設定」
-- ---------------------------------------------------------------------------
alter table public.book_saves alter column is_public set default true;
alter table public.place_saves alter column is_public set default true;
update public.book_saves set is_public = true where not is_public;
update public.place_saves set is_public = true where not is_public;

-- ---------------------------------------------------------------------------
-- 2. 處方簽標籤可以自己新增（最多 3 個、每個 1–10 字）；篩選列只放常用的
-- ---------------------------------------------------------------------------
alter table public.prescriptions drop constraint if exists prescriptions_tags_check;
create or replace function public.rx_tags_ok(p_tags text[])
returns boolean language sql immutable set search_path = '' as $$
  select cardinality(p_tags) <= 3
     and not exists (select 1 from unnest(p_tags) t where char_length(trim(t)) not between 1 and 10 or t <> trim(t))
$$;
alter table public.prescriptions add constraint prescriptions_tags_check check (public.rx_tags_ok(tags));

-- 書店頁 › 處方簽分頁：這間書店的店主發起的（不含匿名）；店主自己看全部
create or replace function public.store_rx(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'title', p.title, 'tags', p.tags, 'created_at', p.created_at, 'closes_at', p.closes_at, 'closed_at', p.closed_at,
           'is_open', public.rx_is_open(p), 'is_mine', p.user_id = auth.uid(), 'anonymous', p.anonymous,
           'author', public.rx_author(p.user_id, false),
           'reply_count', (select count(*) from public.prescription_replies r where r.prescription_id = p.id and not public.is_blocked_with(r.user_id)),
           'wanted_count', (select count(distinct r.book_id) from public.prescription_replies r
                            join public.book_saves sv on sv.user_id = p.user_id and sv.book_id = r.book_id where r.prescription_id = p.id),
           'covers', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'cover_url', b.cover_url))
                               from (select r.book_id, count(*) n, max(r.created_at) last from public.prescription_replies r
                                     where r.prescription_id = p.id and not public.is_blocked_with(r.user_id)
                                     group by r.book_id order by n desc, last desc limit 4) t
                               join public.books b on b.id = t.book_id), '[]'::jsonb)
         ) order by public.rx_is_open(p) desc, p.created_at desc), '[]'::jsonb)
  from public.bookstores s
  join public.prescriptions p on p.user_id = s.owner_id
  where s.slug = p_slug
    and (s.owner_id = auth.uid()
         or (public.is_store_visible(s.id) and s.show_rx and not p.anonymous and not public.is_blocked_with(s.owner_id)))
$$;
grant execute on function public.store_rx(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. 我的書店：追蹤者／追蹤中名單（只有店主自己看得到名單）、數據頁
-- ---------------------------------------------------------------------------
create or replace function public.my_follow_list(p_kind text default 'followers')
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select s.id from public.bookstores s where s.owner_id = auth.uid())
  select coalesce(jsonb_agg(jsonb_build_object(
           'store_id', o.id, 'slug', o.slug, 'name', coalesce(o.name, pr.display_name), 'color', o.color, 'avatar_path', o.avatar_path,
           'tagline', o.tagline, 'since', x.created_at,
           'latest', (select jsonb_build_object('period', c.period, 'title', c.title,
                                                'book_count', (select count(*) from public.curation_items cb where cb.curation_id = c.id))
                      from public.curations c where c.bookstore_id = o.id and c.status = 'published'
                      order by c.period desc limit 1),
           'i_follow', exists (select 1 from public.follows f2 where f2.follower_id = auth.uid() and f2.bookstore_id = o.id)
         ) order by x.created_at desc), '[]'::jsonb)
  from (
    select f.follower_id as user_id, f.created_at from public.follows f, me where p_kind = 'followers' and f.bookstore_id = me.id
    union all
    select s2.owner_id, f.created_at from public.follows f join public.bookstores s2 on s2.id = f.bookstore_id
     where p_kind = 'following' and f.follower_id = auth.uid()
  ) x
  join public.profiles pr on pr.id = x.user_id and pr.delete_requested_at is null
  join public.bookstores o on o.owner_id = x.user_id and o.status = 'active'
  where not public.is_blocked_with(x.user_id)
$$;
revoke execute on function public.my_follow_list(text) from public, anon;
grant execute on function public.my_follow_list(text) to authenticated;

-- W2 數據：原本在頂部的拜訪、策展數都收到這裡
create or replace function public.my_store_insights()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'followers', (select count(*) from public.follows f where f.bookstore_id = s.id),
    'following', (select count(*) from public.follows f where f.follower_id = s.owner_id),
    'visits_this_month', (select count(*) from public.curation_visits v join public.curations c on c.id = v.curation_id
                          where c.bookstore_id = s.id and v.visit_date >= public.current_period()),
    'visits_last_month', (select count(*) from public.curation_visits v join public.curations c on c.id = v.curation_id
                          where c.bookstore_id = s.id and v.visit_date >= (public.current_period() - interval '1 month')::date
                            and v.visit_date < public.current_period()),
    'visitors_this_month', (select count(distinct v.visitor_key) from public.curation_visits v join public.curations c on c.id = v.curation_id
                            where c.bookstore_id = s.id and v.visit_date >= public.current_period()),
    'saves_from_store', (select count(*) from public.book_saves sv where sv.from_bookstore_id = s.id and sv.user_id <> s.owner_id),
    'published_curations', (select count(*) from public.curations c where c.bookstore_id = s.id and c.status = 'published'),
    'public_posts', (select count(*) from public.diary_entries e where e.user_id = s.owner_id and e.is_public),
    'rx_replies_given', (select count(*) from public.prescription_replies r where r.user_id = s.owner_id),
    'top_curations', coalesce((select jsonb_agg(t order by t.visits desc) from (
        select c.id, c.title, c.period, count(v.*) as visits,
               (select count(*) from public.book_saves sv where sv.from_curation_id = c.id) as saves
        from public.curations c left join public.curation_visits v on v.curation_id = c.id
        where c.bookstore_id = s.id and c.status = 'published'
        group by c.id order by count(v.*) desc limit 3) t), '[]'::jsonb)
  )
  from public.bookstores s where s.owner_id = auth.uid()
$$;
revoke execute on function public.my_store_insights() from public, anon;
grant execute on function public.my_store_insights() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. 通知列表：推播送出的通知也留一份給本人看（點了算已讀）
-- ---------------------------------------------------------------------------
alter table public.notification_outbox add column if not exists read_at timestamptz;
create index if not exists notification_outbox_user_idx on public.notification_outbox (user_id, created_at desc);

create or replace function public.my_notifications(p_limit int default 50)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'unread', (select count(*) from public.notification_outbox n where n.user_id = auth.uid() and n.read_at is null
                 and n.created_at > now() - interval '60 days'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body,
                                                           'data', n.data, 'created_at', n.created_at, 'read', n.read_at is not null)
                                        order by n.created_at desc)
                       from (select * from public.notification_outbox n where n.user_id = auth.uid()
                               and n.created_at > now() - interval '60 days'
                             order by n.created_at desc limit greatest(1, least(p_limit, 100))) n), '[]'::jsonb))
$$;

create or replace function public.mark_notifications_read(p_id uuid default null)
returns void language sql security definer set search_path = '' as $$
  update public.notification_outbox set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_id is null or id = p_id)
$$;
revoke execute on function public.my_notifications(int), public.mark_notifications_read(uuid) from public, anon;
grant execute on function public.my_notifications(int), public.mark_notifications_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. 探索 › 貼文：書公開的心得也算貼文（標「心得」）；沒有被日記貼文帶出來過的才列
-- ---------------------------------------------------------------------------
create or replace view public.public_notes as
  select n.id, s.owner_id as user_id, n.created_at, n.kind as note_kind, n.title, n.body, n.photo_paths, n.page_ref,
         r.id as reading_id, r.book_id, b.title as book_title, b.cover_url as book_cover_url,
         coalesce(s.name, p.display_name) as author_name, s.id as author_store_id,
         s.slug as author_store_slug, s.color as author_store_color, s.avatar_path as author_avatar_path
  from public.reading_notes n
  join public.readings r on r.id = n.reading_id and r.is_public
  join public.bookstores s on s.id = r.bookstore_id and s.status = 'active' and s.show_reading
  join public.profiles p on p.id = s.owner_id and p.delete_requested_at is null
  join public.books b on b.id = r.book_id
  where not public.is_blocked_with(s.owner_id)
    and not exists (select 1 from public.diary_entries e where e.reading_note_id = n.id and e.is_public);
grant select on public.public_notes to anon, authenticated;

drop function if exists public.explore_posts(text, double precision, double precision, timestamptz, int);
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
grant execute on function public.explore_posts(text, double precision, double precision, timestamptz, int, text) to anon, authenticated;

-- 處方簽也能搜（標題、說明、標籤）
create or replace function public.rx_search(p_query text, p_limit int default 20)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'title', p.title, 'tags', p.tags, 'created_at', p.created_at, 'closes_at', p.closes_at,
           'is_open', public.rx_is_open(p), 'is_mine', p.user_id = auth.uid(),
           'author', public.rx_author(p.user_id, p.anonymous),
           'reply_count', (select count(*) from public.prescription_replies r where r.prescription_id = p.id and not public.is_blocked_with(r.user_id)),
           'my_replied', exists (select 1 from public.prescription_replies r where r.prescription_id = p.id and r.user_id = auth.uid()),
           'covers', '[]'::jsonb
         ) order by public.rx_is_open(p) desc, p.created_at desc), '[]'::jsonb)
  from (select * from public.prescriptions p
        where nullif(trim(p_query), '') is not null
          and (p.title ilike '%' || trim(p_query) || '%' or p.body ilike '%' || trim(p_query) || '%' or trim(p_query) = any (p.tags))
          and not public.is_blocked_with(p.user_id)
          and exists (select 1 from public.profiles pr where pr.id = p.user_id and pr.delete_requested_at is null)
        order by p.created_at desc limit greatest(1, least(p_limit, 50))) p
$$;
grant execute on function public.rx_search(text, int) to anon, authenticated;
