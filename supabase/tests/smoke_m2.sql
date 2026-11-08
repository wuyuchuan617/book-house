-- M2 煙霧測試：策展建立、預約發布、加書、標籤、複製、刪除影響、API 書目寫入
\set QUIET on
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
  if p is null then execute 'set role anon'; else execute 'set role authenticated'; end if;
end $$;
create or replace function pg_temp.expect_error(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok (expected error) %: %', p_label, sqlerrm;
    return;
  end;
  raise exception 'FAIL: expected an error for %', p_label;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com', '{"full_name":"小C"}'),
  ('00000000-0000-0000-0000-00000000000d', 'd@example.com', '{"full_name":"小D"}');

-- book-search Edge Function（service role）寫入 API 書；重複寫入不會多出一筆
set role service_role;
select count(*) from public.upsert_api_books('[
  {"source":"google_books","external_id":"g1","isbn13":"9789860000001","title":"抬頭看星空之後","authors":["林伯安"],"published_year":"2021"},
  {"source":"google_books","external_id":"g2","title":"星空的故事","authors":["黃寶琳"],"cover_url":"https://books.google.com/x.jpg"}
]'::jsonb);
select count(*) from public.upsert_api_books('[{"source":"google_books","external_id":"g1","title":"抬頭看星空之後","authors":["林伯安"]}]'::jsonb);
do $$ begin
  assert (select count(*) from public.books where source = 'google_books') = 2, 'api upsert dedupes';
end $$;
reset role;

-- 一般使用者不能直接呼叫 upsert_api_books
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error($q$select public.upsert_api_books('[]'::jsonb)$q$, 'upsert_api_books is service-only');
select pg_temp.expect_error($q$select public.create_curation(public.current_period())$q$, 'create curation without store');

-- C 開店 → O3 第一檔策展（本月草稿）
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select id from public.create_bookstore('my cosmos', '小C', 'mist');
create temp table t_cur as select * from public.create_curation(public.current_period(), '冬天的星空指南');
reset role;
grant select on t_cur to anon, authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
do $$ begin
  assert (select id from public.create_curation(public.current_period())) = (select id from t_cur), 'same-month draft reused';
end $$;
select pg_temp.expect_error($q$select public.create_curation((public.current_period() + interval '4 months')::date)$q$, 'period too far');
select pg_temp.expect_error($q$select public.create_curation((public.current_period() - interval '1 month')::date)$q$, 'past period');

-- O4／C3：加書（不重複、依序排在最後）
select public.add_curation_item((select id from t_cur), (select id from public.books where external_id = 'g1'));
select public.add_curation_item((select id from t_cur), (select id from public.books where external_id = 'g2'), '  ');
select public.add_curation_item((select id from t_cur), (select id from public.books where external_id = 'g1'));
do $$ begin
  assert (select count(*) from public.curation_items where curation_id = (select id from t_cur)) = 2, 'no duplicate item';
  assert (select array_agg(position order by position) from public.curation_items where curation_id = (select id from t_cur)) = array[0, 1], 'append order';
  assert (select count(*) from public.curation_items where curation_id = (select id from t_cur) and note is null) = 2, 'blank note → null';
  assert (select count(*) from public.search_local_books('星空')) = 2, 'local search';
end $$;

-- 標籤：系統＋自訂，最多 3 個
create temp table t_tag as select * from public.create_custom_tag('#觀星新手');
do $$ begin
  assert (select kind from t_tag) = 'custom';
  assert (select id from public.create_custom_tag('觀星新手')) = (select id from t_tag), 'custom tag reused';
  assert (select id from public.create_custom_tag('科普')) = (select id from public.tags where slug = 'science'), 'system tag reused';
end $$;
select public.set_curation_tags((select id from t_cur),
  array[(select id from t_tag), (select id from public.tags where slug = 'science')]);
select pg_temp.expect_error($q$select public.set_curation_tags((select id from t_cur), (select array_agg(id) from public.tags))$q$, 'more than 3 tags');
select pg_temp.expect_error($q$select public.create_custom_tag('這是一個超過十二個字的標籤名稱')$q$, 'tag too long');

-- 發布本月 → published；不能刪到 0 本
select public.publish_curation((select id from t_cur));
do $$ begin
  assert (select status from public.curations where id = (select id from t_cur)) = 'published';
end $$;
delete from public.curation_items where curation_id = (select id from t_cur) and position = 1;
select pg_temp.expect_error($q$delete from public.curation_items where curation_id = (select id from t_cur)$q$, 'live curation keeps 1 book');

-- C7 複製為下個月草稿，再預約發布
create temp table t_next as select * from public.duplicate_curation((select id from t_cur));
do $$ begin
  assert (select period from t_next) = public.next_period();
  assert (select count(*) from public.curation_items where curation_id = (select id from t_next)) = 1, 'items copied';
  assert (select count(*) from public.curation_tags where curation_id = (select id from t_next)) = 2, 'tags copied';
end $$;
select public.publish_curation((select id from t_next));
do $$ begin
  assert (select status from public.curations where id = (select id from t_next)) = 'scheduled', 'next month → scheduled';
  assert (select scheduled_for from public.curations where id = (select id from t_next)) is not null;
end $$;

-- 讀者看不到預約中的策展
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
do $$ begin
  assert (select count(*) from public.curations where id = (select id from t_next)) = 0, 'scheduled hidden';
  assert (select count(*) from public.explore_feed where curation_id = (select id from t_cur)) = 1;
end $$;
insert into public.book_saves (user_id, book_id, from_curation_id)
  select auth.uid(), b.id, (select id from t_cur) from public.books b where external_id = 'g1';
select pg_temp.expect_error($q$select public.duplicate_curation((select id from t_cur))$q$, 'duplicate others curation');
do $$ begin
  assert (select count(*) from public.curation_delete_impact((select id from t_cur))) = 0, 'impact hidden from others';
end $$;

-- C8 刪除影響範圍、M1 列表
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
do $$ begin
  assert (select save_count from public.curation_delete_impact((select id from t_cur))) = 1;
  assert (select book_count from public.curation_delete_impact((select id from t_cur))) = 1;
  assert (select count(*) from public.my_curations()) = 2;
end $$;

-- 排程：把「下個月」那檔假裝到期 → 上架
reset role;
set session_replication_role = replica;  -- 測試用：略過 trigger 直接改期別
update public.curations set status = 'draft', published_at = null where id = (select id from t_cur);
update public.curations set period = public.current_period(), scheduled_for = now() - interval '1 minute' where id = (select id from t_next);
set session_replication_role = origin;
set role service_role;
do $$ begin
  assert public.promote_scheduled_curations() = 1, 'promoted 1';
end $$;
reset role;
do $$ begin
  assert (select status from public.curations where id = (select id from t_next)) = 'published';
end $$;

-- 刪除策展（含書架）：級聯刪除不會被「至少 1 本」擋下
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
delete from public.curations where id = (select id from t_next);
delete from public.curations where id = (select id from t_cur);
do $$ begin
  assert (select count(*) from public.curations) = 0, 'deleted';
end $$;

reset role;
\echo 'ALL M2 SMOKE TESTS PASSED'
