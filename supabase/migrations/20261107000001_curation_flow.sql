-- M2 開店與策展：O3–O9、C1–C8、S1 選書元件
-- 1. 策展可以「預約發布」下個月（C1「預約發布（12/1）」），到月初由排程上架
-- 2. 建立／複製策展、加書、設定標籤、自訂標籤、刪除影響範圍 的 RPC
-- 3. book-search Edge Function（service role）寫入 API 書目用的 upsert_api_books

-- ---------------------------------------------------------------------------
-- 期別小工具
-- ---------------------------------------------------------------------------
create or replace function public.next_period()
returns date language sql stable as $$
  select (public.current_period() + interval '1 month')::date
$$;

-- ---------------------------------------------------------------------------
-- C1：建立草稿（只能是本月或下個月）。同月已有草稿就回傳那份，避免重複
-- ---------------------------------------------------------------------------
create or replace function public.create_curation(p_period date, p_title text default null, p_description text default null)
returns public.curations
language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid := public.my_bookstore_id();
  v_period date := date_trunc('month', p_period)::date;
  c public.curations;
begin
  if v_store is null then
    raise exception 'open a bookstore first' using errcode = 'P0002';
  end if;
  if v_period not in (public.current_period(), public.next_period()) then
    raise exception 'only this month or next month' using errcode = '23514';
  end if;
  select * into c from public.curations
   where bookstore_id = v_store and period = v_period and status = 'draft'
   order by updated_at desc limit 1;
  if found then
    return c;
  end if;
  insert into public.curations (bookstore_id, period, title, description)
  values (v_store, v_period, nullif(trim(p_title), ''), nullif(trim(p_description), ''))
  returning * into c;
  return c;
end $$;

-- ---------------------------------------------------------------------------
-- 發布：本月 → published；下個月 → scheduled（月初由 promote_scheduled_curations 上架）
-- ---------------------------------------------------------------------------
create or replace function public.publish_curation(p_curation_id uuid)
returns public.curations
language plpgsql security definer set search_path = '' as $$
declare
  c public.curations;
begin
  select * into c from public.curations where id = p_curation_id for update;
  if not found or not public.is_curation_owner(p_curation_id) then
    raise exception 'curation not found' using errcode = 'P0002';
  end if;
  if c.status in ('published', 'scheduled') then
    return c;
  end if;
  if c.title is null or char_length(trim(c.title)) = 0 then
    raise exception 'title is required to publish' using errcode = '23514';
  end if;
  if not exists (select 1 from public.curation_items where curation_id = c.id) then
    raise exception 'add at least 1 book to publish' using errcode = '23514';
  end if;
  if c.period not in (public.current_period(), public.next_period()) then
    raise exception 'only this month or next month can be published' using errcode = '23514';
  end if;
  if exists (select 1 from public.curations
             where bookstore_id = c.bookstore_id and period = c.period
               and status in ('published', 'scheduled') and id <> c.id) then
    raise exception 'this month already has a published curation' using errcode = '23505';
  end if;

  perform set_config('app.via_rpc', 'on', true);
  if c.period = public.current_period() then
    update public.curations
       set status = 'published', published_at = now(), scheduled_for = null
     where id = c.id
    returning * into c;
  else
    update public.curations
       set status = 'scheduled', published_at = null,
           scheduled_for = (c.period::timestamp at time zone 'Asia/Taipei')
     where id = c.id
    returning * into c;
  end if;
  perform set_config('app.via_rpc', 'off', true);
  return c;
end $$;

-- 排程用：月初把預約的策展上架；條件已不符合（沒書、沒標題）的改回草稿
create or replace function public.promote_scheduled_curations()
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  perform set_config('app.via_rpc', 'on', true);
  update public.curations c
     set status = 'draft', scheduled_for = null
   where c.status = 'scheduled' and c.period <= public.current_period()
     and (c.title is null or not exists (select 1 from public.curation_items i where i.curation_id = c.id));
  with up as (
    update public.curations
       set status = 'published', published_at = now(), scheduled_for = null
     where status = 'scheduled' and period <= public.current_period()
    returning 1
  ) select count(*) into n from up;
  perform set_config('app.via_rpc', 'off', true);
  return n;
end $$;

-- 已發布／已預約的策展至少要留 1 本書（想清空請先取消發布）
create or replace function public.keep_one_item_when_live()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.curations c
             where c.id = old.curation_id and c.status in ('published', 'scheduled'))
     and not exists (select 1 from public.curation_items i
                     where i.curation_id = old.curation_id and i.id <> old.id) then
    raise exception 'a published curation needs at least 1 book; unpublish it first' using errcode = '23514';
  end if;
  return old;
end $$;

create trigger curation_items_keep_one before delete on public.curation_items
  for each row execute function public.keep_one_item_when_live();

-- 已發布的策展不能把標題清空（published_needs_title 也會擋，這裡給清楚的訊息）
-- → 交給 check constraint，不另外處理

-- ---------------------------------------------------------------------------
-- C3／O4：把書加到書架最後面；已在書架上就回傳原本那筆
-- ---------------------------------------------------------------------------
create or replace function public.add_curation_item(p_curation_id uuid, p_book_id uuid, p_note text default null)
returns public.curation_items
language plpgsql security definer set search_path = '' as $$
declare
  it public.curation_items;
begin
  if not public.is_curation_owner(p_curation_id) then
    raise exception 'curation not found' using errcode = 'P0002';
  end if;
  select * into it from public.curation_items where curation_id = p_curation_id and book_id = p_book_id;
  if found then
    return it;
  end if;
  if (select count(*) from public.curation_items where curation_id = p_curation_id) >= 20 then
    raise exception 'a curation can have at most 20 books' using errcode = '23514';
  end if;
  insert into public.curation_items (curation_id, book_id, note, position)
  values (p_curation_id, p_book_id, nullif(trim(p_note), ''),
          coalesce((select max(position) + 1 from public.curation_items where curation_id = p_curation_id), 0))
  returning * into it;
  return it;
end $$;

-- ---------------------------------------------------------------------------
-- C1 主題標籤：一次覆寫（最多 3 個）
-- ---------------------------------------------------------------------------
create or replace function public.set_curation_tags(p_curation_id uuid, p_tag_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_curation_owner(p_curation_id) then
    raise exception 'curation not found' using errcode = 'P0002';
  end if;
  if coalesce(cardinality(p_tag_ids), 0) > 3 then
    raise exception 'a curation can have at most 3 tags' using errcode = '23514';
  end if;
  delete from public.curation_tags where curation_id = p_curation_id;
  insert into public.curation_tags (curation_id, tag_id)
  select p_curation_id, t from unnest(coalesce(p_tag_ids, '{}')) as t group by t;
end $$;

-- 自訂標籤「＋ 自訂標籤」：同名（不分大小寫、忽略 #）就沿用既有標籤
create or replace function public.create_custom_tag(p_name text)
returns public.tags
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := trim(both from regexp_replace(coalesce(p_name, ''), '^#+', ''));
  t public.tags;
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 12 then
    raise exception 'tag name must be 1-12 characters' using errcode = '23514';
  end if;
  select * into t from public.tags where lower(name) = lower(v_name) order by kind, created_at limit 1;
  if found then
    return t;
  end if;
  if (select count(*) from public.tags where created_by = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too many custom tags today' using errcode = '54000';
  end if;
  insert into public.tags (slug, name, kind, sort, created_by)
  values ('c-' || substr(md5(lower(v_name)), 1, 12), v_name, 'custom', 1000, auth.uid())
  on conflict (slug) do update set name = excluded.name
  returning * into t;
  return t;
end $$;

-- ---------------------------------------------------------------------------
-- C7「複製為下個月草稿・保留書架」
-- ---------------------------------------------------------------------------
create or replace function public.duplicate_curation(p_curation_id uuid, p_period date default null)
returns public.curations
language plpgsql security definer set search_path = '' as $$
declare
  src public.curations;
  v_period date := coalesce(date_trunc('month', p_period)::date, public.next_period());
  c public.curations;
begin
  select * into src from public.curations where id = p_curation_id;
  if not found or not public.is_curation_owner(p_curation_id) then
    raise exception 'curation not found' using errcode = 'P0002';
  end if;
  if v_period not in (public.current_period(), public.next_period()) then
    raise exception 'only this month or next month' using errcode = '23514';
  end if;
  insert into public.curations (bookstore_id, period, title, description)
  values (src.bookstore_id, v_period, src.title, src.description)
  returning * into c;
  insert into public.curation_items (curation_id, book_id, note, position)
  select c.id, book_id, note, position from public.curation_items where curation_id = src.id;
  insert into public.curation_tags (curation_id, tag_id)
  select c.id, tag_id from public.curation_tags where curation_id = src.id;
  return c;
end $$;

-- C8：刪除前顯示影響範圍（讀者收藏只能由伺服器端計算）
create or replace function public.curation_delete_impact(p_curation_id uuid)
returns table (book_count int, save_count int, status public.curation_status)
language sql stable security definer set search_path = '' as $$
  select (select count(*)::int from public.curation_items i where i.curation_id = c.id),
         (select count(*)::int from public.book_saves s where s.from_curation_id = c.id),
         c.status
  from public.curations c
  where c.id = p_curation_id and public.is_curation_owner(p_curation_id)
$$;

-- M1 列表：每檔書數、被收藏次數、說明是否已填
create or replace function public.my_curations()
returns table (id uuid, period date, title text, description text, status public.curation_status,
               published_at timestamptz, updated_at timestamptz, book_count int, save_count int,
               noted_count int)
language sql stable security definer set search_path = '' as $$
  select c.id, c.period, c.title, c.description, c.status, c.published_at, c.updated_at,
         (select count(*)::int from public.curation_items i where i.curation_id = c.id),
         (select count(*)::int from public.book_saves s where s.from_curation_id = c.id),
         (select count(*)::int from public.curation_items i where i.curation_id = c.id and i.note is not null)
  from public.curations c
  where c.bookstore_id = public.my_bookstore_id()
  order by c.period desc, c.updated_at desc
$$;

-- ---------------------------------------------------------------------------
-- S1 選書：book-search Edge Function 用 service role 呼叫
-- p_books: [{source, external_id, isbn13, title, authors[], cover_url, published_year}]
-- ---------------------------------------------------------------------------
create or replace function public.upsert_api_books(p_books jsonb)
returns setof public.books
language plpgsql security definer set search_path = '' as $$
declare
  b jsonb;
  v_isbn text;
  r public.books;
begin
  for b in select * from jsonb_array_elements(coalesce(p_books, '[]'::jsonb)) loop
    v_isbn := nullif(b->>'isbn13', '');
    if v_isbn is not null and v_isbn !~ '^[0-9]{13}$' then
      v_isbn := null;
    end if;
    -- 先以 (source, external_id)，再以 ISBN 找既有的書
    select * into r from public.books
     where source = (b->>'source')::public.book_source and external_id = b->>'external_id';
    if not found and v_isbn is not null then
      select * into r from public.books where isbn13 = v_isbn and merged_into is null;
    end if;
    if found then
      update public.books
         set cover_url = coalesce(public.books.cover_url, nullif(b->>'cover_url', '')),
             published_year = coalesce(public.books.published_year, nullif(b->>'published_year', '')::smallint)
       where id = r.id
      returning * into r;
    else
      insert into public.books (source, external_id, isbn13, title, authors, cover_url, published_year)
      values ((b->>'source')::public.book_source,
              b->>'external_id',
              v_isbn,
              left(b->>'title', 200),
              coalesce((select array_agg(left(a, 100)) from jsonb_array_elements_text(b->'authors') a), array['佚名']),
              nullif(b->>'cover_url', ''),
              nullif(b->>'published_year', '')::smallint)
      returning * into r;
    end if;
    return next r;
  end loop;
end $$;

-- 本機書庫搜尋（已存在的 API 書＋自己手動新增的書）
create or replace function public.search_local_books(p_query text, p_limit int default 20)
returns setof public.books
language sql stable security definer set search_path = '' as $$
  select b.* from public.books b
  where b.merged_into is null
    and (b.source <> 'manual' or b.created_by = auth.uid())
    and (b.title ilike '%' || p_query || '%' or exists (select 1 from unnest(b.authors) a where a ilike '%' || p_query || '%'))
  order by (b.title ilike p_query || '%') desc, char_length(b.title)
  limit least(greatest(p_limit, 1), 40)
$$;

-- ---------------------------------------------------------------------------
-- 權限
-- ---------------------------------------------------------------------------
revoke execute on function
  public.create_curation(date, text, text),
  public.promote_scheduled_curations(),
  public.keep_one_item_when_live(),
  public.add_curation_item(uuid, uuid, text),
  public.set_curation_tags(uuid, uuid[]),
  public.create_custom_tag(text),
  public.duplicate_curation(uuid, date),
  public.curation_delete_impact(uuid),
  public.my_curations(),
  public.upsert_api_books(jsonb),
  public.search_local_books(text, int)
from public, anon, authenticated;

grant execute on function public.next_period() to anon, authenticated;
grant execute on function
  public.create_curation(date, text, text),
  public.add_curation_item(uuid, uuid, text),
  public.set_curation_tags(uuid, uuid[]),
  public.create_custom_tag(text),
  public.duplicate_curation(uuid, date),
  public.curation_delete_impact(uuid),
  public.my_curations(),
  public.search_local_books(text, int)
to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.upsert_api_books(jsonb), public.search_local_books(text, int),
      public.promote_scheduled_curations() to service_role;
  end if;
end $$;

-- 每小時第 5 分檢查一次（Asia/Taipei 月初 00:05 起就會上架）
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('promote-scheduled-curations', '5 * * * *', 'select public.promote_scheduled_curations()');
  end if;
end $$;
