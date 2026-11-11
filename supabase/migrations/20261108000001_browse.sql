-- M3 逛店與互動：A2 探索搜尋、自動封面需要的書名、讀者看得到的店主閱讀

-- A2 探索卡片：沒有封面圖時要用書名產生封面 → 多帶前 3 本書名
-- （create or replace view 只能在最後加欄位）
create or replace view public.explore_feed with (security_invoker = true) as
  select c.id as curation_id, c.title, c.description, c.period, c.published_at,
         s.id as bookstore_id, s.slug, s.name as store_name, s.owner_name, s.color, s.avatar_path,
         s.follower_count,
         (select count(*) from public.curation_items i where i.curation_id = c.id) as book_count,
         array(select b.cover_url from public.curation_items i join public.books b on b.id = i.book_id
               where i.curation_id = c.id order by i.position limit 3) as cover_urls,
         array(select t.slug::text from public.curation_tags ct join public.tags t on t.id = ct.tag_id
               where ct.curation_id = c.id order by t.sort) as tag_slugs,
         array(select b.title from public.curation_items i join public.books b on b.id = i.book_id
               where i.curation_id = c.id order by i.position limit 3) as cover_titles
  from public.curations c
  join public.public_bookstores s on s.id = c.bookstore_id
  where c.status = 'published' and c.period = public.current_period();

-- A2 搜尋：策展標題／說明、書店名／店主名、書架上的書名／作者（S3：找不到時顯示空狀態）
create or replace function public.search_explore(p_query text)
returns setof public.explore_feed
language sql stable security invoker set search_path = '' as $$
  with q as (select '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat)
  select f.* from public.explore_feed f, q
  where char_length(trim(p_query)) >= 1
    and (f.title ilike q.pat or f.description ilike q.pat
         or f.store_name ilike q.pat or f.owner_name ilike q.pat
         or exists (select 1 from public.curation_items i join public.books b on b.id = i.book_id
                    where i.curation_id = f.curation_id
                      and (b.title ilike q.pat or array_to_string(b.authors, ' ') ilike q.pat)))
  order by f.published_at desc
  limit 50
$$;

grant execute on function public.search_explore(text) to anon, authenticated;
