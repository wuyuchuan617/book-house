-- 本機煙霧測試：psql -v ON_ERROR_STOP=1 -f smoke_test.sql
-- 每個 do-block 失敗會中止；預期會失敗的動作包在 expect_error() 裡。
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
grant execute on all functions in schema pg_temp to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'yu@example.com', '{"full_name":"小宇"}'),
  ('00000000-0000-0000-0000-00000000000b', 'abi@example.com', '{"name":"阿比"}');

do $$ begin
  assert (select count(*) from public.profiles) = 2, 'profiles created by trigger';
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = '小宇';
  assert (select count(*) from public.notification_prefs) = 2;
end $$;

-- 店主 A 開店（中文店名 → store-xxxxxx slug）
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
create temp table t_store as select * from public.create_bookstore('小宇的書店', '小宇', 'moss');
reset role;
grant select on t_store to anon, authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin
  assert (select slug::text from t_store) ~ '^store-[a-z0-9]{6}$', 'fallback slug';
end $$;
select pg_temp.expect_error($q$select public.create_bookstore('Second', 'x')$q$, 'one store per user');

-- 草稿、書、標籤
insert into public.curations (bookstore_id, period, title)
  select id, public.current_period(), '冬天的星空指南' from t_store;
select pg_temp.expect_error($q$insert into public.curations (bookstore_id, period, status) select id, public.current_period(), 'published' from t_store$q$, 'insert as published');
insert into public.books (source, title, authors, created_by)
  values ('manual', '星空的故事', array['黃寶琳'], auth.uid());
select pg_temp.expect_error($q$select public.publish_curation((select id from public.curations limit 1))$q$, 'publish needs a book');
insert into public.curation_items (curation_id, book_id, note)
  select c.id, b.id, '第一次知道星星也會死。' from public.curations c, public.books b;
select pg_temp.expect_error($q$update public.curations set status = 'published'$q$, 'direct status update');
reset role;
insert into public.tags (slug, name) values ('a','A'),('b','B'),('c','C'),('d','D');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.curation_tags select c.id, t.id from public.curations c, public.tags t where t.slug in ('a','b','c');
select pg_temp.expect_error($q$insert into public.curation_tags select c.id, t.id from public.curations c, public.tags t where t.slug = 'd'$q$, '4th tag');
select public.publish_curation((select id from public.curations limit 1));
do $$ begin
  assert (select status from public.curations limit 1) = 'published';
end $$;
-- 同月第二檔
insert into public.curations (bookstore_id, period, title) select id, public.current_period(), '第二檔' from t_store;
insert into public.curation_items (curation_id, book_id)
  select c.id, b.id from public.curations c, public.books b where c.title = '第二檔';
select pg_temp.expect_error($q$select public.publish_curation((select id from public.curations where title = '第二檔'))$q$, 'one published per month');
-- 兩個月後的草稿不能發布（只能本月發布、下個月預約）
insert into public.curations (bookstore_id, period, title)
  select id, (public.current_period() + interval '2 months')::date, '兩個月後' from t_store;
insert into public.curation_items (curation_id, book_id)
  select c.id, b.id from public.curations c, public.books b where c.title = '兩個月後';
select pg_temp.expect_error($q$select public.publish_curation((select id from public.curations where title = '兩個月後'))$q$, 'two months ahead');
-- 店主閱讀（私人一筆）
insert into public.readings (bookstore_id, book_id, is_public) select s.id, b.id, false from t_store s, public.books b;
insert into public.reading_notes (reading_id, body) select id, '讀到第 7 章' from public.readings;
select pg_temp.expect_error($q$update public.readings set book_id = gen_random_uuid()$q$, 'reading book immutable');
update public.readings set status = 'finished';
do $$ begin assert (select finished_at from public.readings) = current_date; end $$;
select pg_temp.expect_error($q$insert into public.follows (follower_id, bookstore_id) select auth.uid(), id from t_store$q$, 'self follow');

-- 讀者 B
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin
  assert (select count(*) from public.explore_feed) = 1, 'B sees 1 curation in explore';
  assert (select book_count from public.explore_feed) = 1;
  assert (select count(*) from public.curations) = 1, 'B cannot see drafts';
  assert (select count(*) from public.readings) = 0, 'B cannot see private reading';
  assert (select count(*) from public.book_appearances) = 1, 'book appearances';
end $$;
select pg_temp.expect_error($q$select locale from public.profiles$q$, 'other profiles locale hidden');
do $$ begin
  update public.curations set title = 'hack';
  assert (select title from public.curations limit 1) <> 'hack', 'B cannot edit A curation';
end $$;
insert into public.follows (follower_id, bookstore_id) select auth.uid(), id from public.public_bookstores;
do $$ begin assert (select follower_count from public.public_bookstores) = 1; end $$;
select public.record_visit((select curation_id from public.explore_feed));
select public.record_visit((select curation_id from public.explore_feed)); -- 同一天不重複
select pg_temp.expect_error($q$insert into public.curation_visits values (gen_random_uuid(), 'x', current_date)$q$, 'direct visit insert');
insert into public.book_saves (user_id, book_id, from_curation_id)
  select auth.uid(), i.book_id, i.curation_id from public.curation_items i;
select pg_temp.expect_error($q$select public.create_bookstore('', 'x')$q$, 'empty store name');

-- 訪客
select pg_temp.as_user(null);
do $$ begin
  assert (select count(*) from public.explore_feed) = 1, 'anon sees explore';
end $$;
select public.record_visit((select curation_id from public.explore_feed), 'device-hash-123');
select pg_temp.expect_error($q$insert into public.follows (follower_id, bookstore_id) select gen_random_uuid(), id from public.bookstores$q$, 'anon follow');

-- 店主數據
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin
  assert (select follower_count from public.my_store_stats()) = 1;
  assert (select visits_this_month from public.my_store_stats()) = 2, 'B once + anon once';
  assert (select published_curation_count from public.my_store_stats()) = 1;
end $$;

-- B 封鎖 A：追蹤被移除、探索看不到
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), '00000000-0000-0000-0000-00000000000a');
do $$ begin
  assert (select count(*) from public.follows) = 0, 'follow removed on block';
  assert (select count(*) from public.explore_feed) = 0, 'blocked store hidden';
end $$;
insert into public.reports (reporter_id, target_type, target_id, reason)
  select auth.uid(), 'bookstore', id, 'spam' from (select id from t_store) s;
select pg_temp.expect_error($q$insert into public.reports (reporter_id, target_type, target_id, reason) select auth.uid(), 'bookstore', id, 'spam' from t_store$q$, 'report dedupe 24h');

-- 刪除帳號申請 → 書店對讀者隱藏
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.request_account_deletion('測試');
select pg_temp.as_user(null);
do $$ begin assert (select count(*) from public.public_bookstores) = 0, 'store hidden after delete request'; end $$;

reset role;
\echo 'ALL SMOKE TESTS PASSED'
