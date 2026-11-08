-- v1.1：想讀清單（合併「收藏的書」與店主待讀）、探索頁推薦／最新／熱門、追蹤中、月份切換、已逛過

-- ---------------------------------------------------------------------------
-- 想讀：book_saves 多「為什麼想讀」與「在哪看到」
-- ---------------------------------------------------------------------------
alter table public.book_saves
  add column if not exists note        text check (char_length(note) <= 200),
  add column if not exists source_text text check (char_length(source_text) <= 60),
  add column if not exists updated_at  timestamptz not null default now();

create trigger book_saves_content before insert or update of note, source_text on public.book_saves
  for each row execute function public.guard_content('note', 'source_text');
create trigger book_saves_updated_at before update on public.book_saves
  for each row execute function public.set_updated_at();

-- 想讀 → 開始讀：寫進店主閱讀（「為什麼想讀」變成第一則心得），並從想讀移除
create or replace function public.start_reading_from_save(p_book_id uuid, p_is_public boolean default null)
returns public.readings
language plpgsql security definer set search_path = '' as $$
declare
  s public.book_saves;
  r public.readings;
begin
  select * into s from public.book_saves where user_id = auth.uid() and book_id = p_book_id;
  if not found then
    raise exception 'not in your to-read list' using errcode = 'P0002';
  end if;
  r := public.add_reading(p_book_id, 'reading', p_is_public, s.note);
  delete from public.book_saves where user_id = auth.uid() and book_id = p_book_id;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- 探索
-- ---------------------------------------------------------------------------
-- 有策展的月份（月份切換只列這些）
create or replace function public.explore_months()
returns table (period date, curation_count int)
language sql stable security invoker set search_path = '' as $$
  select f.period, count(*)::int from public.published_feed f group by f.period order by f.period desc limit 24
$$;

-- p_sort：recommend（沒逛過優先、依口味、新的優先）、latest、popular（近 7 天拜訪＋收藏＋新追蹤）
-- p_following：只看追蹤中的書店；p_period：null = 所有月份
create or replace function public.explore_list(
  p_period date default null,
  p_sort text default 'recommend',
  p_tag text default null,
  p_following boolean default false,
  p_visitor_key text default null,
  p_unvisited_only boolean default false
)
returns table (
  curation_id uuid, title text, description text, period date, published_at timestamptz,
  bookstore_id uuid, slug text, store_name text, owner_name text, color public.store_color, avatar_path text,
  follower_count bigint, book_count bigint, cover_urls text[], tag_slugs text[], cover_titles text[],
  visited boolean, is_following boolean, score numeric
)
language sql stable security definer set search_path = '' as $$
  with me as (select auth.uid() as uid),
  my_keys as (
    select k from (select (select uid from me)::text as k union all select p_visitor_key) x where k is not null
  ),
  my_tags as (  -- 口味：逛過、收藏過、追蹤的書店的策展標籤
    select ct.tag_id, count(*) as w from public.curation_tags ct
    where ct.curation_id in (
      select v.curation_id from public.curation_visits v where v.visitor_key in (select k from my_keys)
      union all select s.from_curation_id from public.book_saves s where s.user_id = (select uid from me) and s.from_curation_id is not null
      union all select c.id from public.curations c join public.follows f on f.bookstore_id = c.bookstore_id
                where f.follower_id = (select uid from me) and c.status = 'published'
    )
    group by ct.tag_id
  ),
  base as (
    select f.*,
           exists (select 1 from public.curation_visits v where v.curation_id = f.curation_id and v.visitor_key in (select k from my_keys)) as visited,
           exists (select 1 from public.follows fo where fo.bookstore_id = f.bookstore_id and fo.follower_id = (select uid from me)) as is_following
    from public.published_feed f
    where (p_period is null or f.period = p_period)
      and (p_tag is null or p_tag = any (f.tag_slugs))
  )
  select b.curation_id, b.title, b.description, b.period, b.published_at,
         b.bookstore_id, b.slug::text, b.store_name, b.owner_name, b.color, b.avatar_path,
         b.follower_count, b.book_count, b.cover_urls, b.tag_slugs, b.cover_titles,
         b.visited, b.is_following,
         case p_sort
           when 'popular' then
             (select count(*) from public.curation_visits v where v.curation_id = b.curation_id and v.visit_date > current_date - 7)
             + 3 * (select count(*) from public.book_saves s where s.from_curation_id = b.curation_id and s.created_at > now() - interval '7 days')
             + 5 * (select count(*) from public.follows fo where fo.bookstore_id = b.bookstore_id and fo.created_at > now() - interval '7 days')
           when 'latest' then extract(epoch from b.published_at)::numeric / 86400
           else
             (case when b.visited then 0 else 1000 end)
             + 20 * coalesce((select sum(t.w) from my_tags t join public.tags tg on tg.id = t.tag_id where tg.slug::text = any (b.tag_slugs)), 0)
             + (case when b.book_count >= 3 and coalesce(b.description, '') <> '' then 50 else 0 end)
             - extract(epoch from now() - b.published_at)::numeric / 86400  -- 每舊一天扣 1 分
         end as score
  from base b
  where (not p_following or b.is_following)
    and (not p_unvisited_only or not b.visited)
  order by score desc, b.published_at desc
  limit 60
$$;

revoke execute on function public.start_reading_from_save(uuid, boolean), public.explore_list(date, text, text, boolean, text, boolean)
  from public, anon, authenticated;
grant execute on function public.start_reading_from_save(uuid, boolean) to authenticated;
grant execute on function public.explore_list(date, text, text, boolean, text, boolean), public.explore_months() to anon, authenticated;
