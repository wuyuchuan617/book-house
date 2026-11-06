-- Row Level Security 與讀者用檢視表
-- 「店主」= bookstores.owner_id = auth.uid()；訪客使用 anon key，只讀公開內容。

alter table public.profiles           enable row level security;
alter table public.bookstores         enable row level security;
alter table public.curations          enable row level security;
alter table public.tags               enable row level security;
alter table public.curation_tags      enable row level security;
alter table public.books              enable row level security;
alter table public.curation_items     enable row level security;
alter table public.readings           enable row level security;
alter table public.reading_notes      enable row level security;
alter table public.follows            enable row level security;
alter table public.book_saves         enable row level security;
alter table public.curation_visits    enable row level security;
alter table public.reports            enable row level security;
alter table public.blocks             enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.push_tokens        enable row level security;
alter table public.feedback           enable row level security;

-- profiles：公開名字與頭像（欄位層級權限），本人可改自己的
create policy profiles_read on public.profiles for select using (true);
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
revoke select on public.profiles from anon, authenticated;
grant select (id, display_name, avatar_url) on public.profiles to anon, authenticated;
grant update (display_name, avatar_url, locale) on public.profiles to authenticated;

-- bookstores
create policy stores_read on public.bookstores for select
  using (owner_id = auth.uid() or public.is_store_visible(id));
create policy stores_update_owner on public.bookstores for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy stores_delete_owner on public.bookstores for delete
  using (owner_id = auth.uid());
-- insert 只經 create_bookstore()
revoke insert on public.bookstores from anon, authenticated;

-- curations
create policy curations_read on public.curations for select
  using (public.is_store_owner(bookstore_id)
         or (status = 'published' and public.is_store_visible(bookstore_id)));
create policy curations_insert_owner on public.curations for insert
  with check (public.is_store_owner(bookstore_id));
create policy curations_update_owner on public.curations for update
  using (public.is_store_owner(bookstore_id)) with check (public.is_store_owner(bookstore_id));
create policy curations_delete_owner on public.curations for delete
  using (public.is_store_owner(bookstore_id));

-- curation_items、curation_tags：跟隨所屬策展
create policy items_read on public.curation_items for select
  using (exists (select 1 from public.curations c where c.id = curation_id));  -- 由 curations 的 policy 過濾
create policy items_write_owner on public.curation_items for all
  using (public.is_curation_owner(curation_id)) with check (public.is_curation_owner(curation_id));

create policy ctags_read on public.curation_tags for select
  using (exists (select 1 from public.curations c where c.id = curation_id));
create policy ctags_write_owner on public.curation_tags for all
  using (public.is_curation_owner(curation_id)) with check (public.is_curation_owner(curation_id));

-- tags：所有人讀；V1 只由 service role 維護
create policy tags_read on public.tags for select using (true);

-- books：所有人讀；登入者可手動新增；API 書由 book-search edge function（service role）寫入
create policy books_read on public.books for select using (true);
create policy books_insert_manual on public.books for insert
  with check (auth.uid() is not null and source = 'manual' and created_by = auth.uid());

-- readings、reading_notes
create policy readings_read on public.readings for select
  using (public.is_store_owner(bookstore_id)
         or (is_public and public.is_store_visible(bookstore_id)));
create policy readings_write_owner on public.readings for all
  using (public.is_store_owner(bookstore_id)) with check (public.is_store_owner(bookstore_id));

create policy notes_read on public.reading_notes for select
  using (exists (select 1 from public.readings r where r.id = reading_id));
create policy notes_write_owner on public.reading_notes for all
  using (public.is_reading_owner(reading_id)) with check (public.is_reading_owner(reading_id));

-- follows、book_saves：只看、只改自己的
create policy follows_self on public.follows for all
  using (follower_id = auth.uid()) with check (follower_id = auth.uid());
create policy saves_self on public.book_saves for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- curation_visits：沒有任何 policy → 只能經 record_visit()、my_store_stats()

-- reports：登入者可送出、看自己送過的
create policy reports_insert on public.reports for insert
  with check (reporter_id = auth.uid()
              and not exists (select 1 from public.reports r
                              where r.reporter_id = auth.uid() and r.target_type = reports.target_type
                                and r.target_id = reports.target_id
                                and r.created_at > now() - interval '24 hours'));
create policy reports_read_self on public.reports for select using (reporter_id = auth.uid());
revoke update, delete on public.reports from anon, authenticated;

-- blocks、notification_prefs、push_tokens
create policy blocks_self on public.blocks for all
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create policy prefs_self on public.notification_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tokens_self on public.push_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- feedback：只能新增
create policy feedback_insert on public.feedback for insert
  with check (user_id is null or user_id = auth.uid());
revoke select, update, delete on public.feedback from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 檢視表（security_invoker：沿用呼叫者的 RLS；計數用 security definer 函式）
-- ---------------------------------------------------------------------------
create or replace function public.follower_count(p_bookstore_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select count(*) from public.follows where bookstore_id = p_bookstore_id
$$;
grant execute on function public.follower_count(uuid) to anon, authenticated;

-- 本人完整 profile（locale、刪除申請狀態不對外公開，所以用函式而不是欄位權限）
create or replace function public.my_profile()
returns table (id uuid, display_name text, avatar_url text, locale text,
               delete_requested_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select id, display_name, avatar_url, locale, delete_requested_at, created_at
  from public.profiles where id = auth.uid()
$$;
grant execute on function public.my_profile() to authenticated;

-- A2、A3、P4：讀者看得到的書店
create or replace view public.public_bookstores with (security_invoker = true) as
  select s.id, s.slug, s.name, s.owner_name, s.tagline, s.color, s.avatar_path, s.banner_path,
         s.created_at, public.follower_count(s.id) as follower_count
  from public.bookstores s
  where public.is_store_visible(s.id);

-- A2：當月探索牆
create or replace view public.explore_feed with (security_invoker = true) as
  select c.id as curation_id, c.title, c.description, c.period, c.published_at,
         s.id as bookstore_id, s.slug, s.name as store_name, s.owner_name, s.color, s.avatar_path,
         s.follower_count,
         (select count(*) from public.curation_items i where i.curation_id = c.id) as book_count,
         array(select b.cover_url from public.curation_items i join public.books b on b.id = i.book_id
               where i.curation_id = c.id order by i.position limit 3) as cover_urls,
         array(select t.slug::text from public.curation_tags ct join public.tags t on t.id = ct.tag_id
               where ct.curation_id = c.id order by t.sort) as tag_slugs
  from public.curations c
  join public.public_bookstores s on s.id = c.bookstore_id
  where c.status = 'published' and c.period = public.current_period();

-- 書籍視角頁：一本書被哪些書店策展、各自的推薦理由
create or replace view public.book_appearances with (security_invoker = true) as
  select i.book_id, 'curation'::text as kind, c.id as curation_id, c.title as curation_title, c.period,
         s.id as bookstore_id, s.slug, s.name as store_name, s.owner_name, s.color, i.note,
         c.published_at as at
  from public.curation_items i
  join public.curations c on c.id = i.curation_id and c.status = 'published'
  join public.public_bookstores s on s.id = c.bookstore_id
  union all
  select r.book_id, 'reading', null, null, null,
         s.id, s.slug, s.name, s.owner_name, s.color, null, r.updated_at
  from public.readings r
  join public.public_bookstores s on s.id = r.bookstore_id
  where r.is_public;

grant select on public.public_bookstores, public.explore_feed, public.book_appearances
  to anon, authenticated;
