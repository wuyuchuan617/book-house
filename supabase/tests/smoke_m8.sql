-- v1.1：想讀清單、開始讀、探索排序／追蹤中／已逛過／月份
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
  ('00000000-0000-0000-0000-000000000051', 'o8@example.com', '{"full_name":"店主八"}'),
  ('00000000-0000-0000-0000-000000000052', 'p8@example.com', '{"full_name":"店主九"}'),
  ('00000000-0000-0000-0000-000000000053', 'r8@example.com', '{"full_name":"讀者八"}');

-- 兩間書店各發布一檔（科普／小說）
select pg_temp.as_user('00000000-0000-0000-0000-000000000051');
select id from public.create_bookstore('sci shop', '店主八', 'mist');
insert into public.books (source, title, authors, created_by) values ('manual', '宇宙的形狀', array['甲'], auth.uid()), ('manual', '想讀之書', array['乙'], auth.uid());
create temp table t_a as select * from public.create_curation(public.current_period(), '宇宙入門');
reset role; grant select on t_a to anon, authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000051');
select public.add_curation_item((select id from t_a), (select id from public.books where title = '宇宙的形狀'));
select public.set_curation_tags((select id from t_a), array[(select id from public.tags where slug = 'science')]);
update public.curation_items set note = '推薦理由' where curation_id = (select id from t_a) and (note is null or trim(note) = '');
select public.publish_curation((select id from t_a));

select pg_temp.as_user('00000000-0000-0000-0000-000000000052');
select id from public.create_bookstore('novel shop', '店主九', 'olive');
create temp table t_b as select * from public.create_curation(public.current_period(), '小說之夜');
reset role; grant select on t_b to anon, authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000052');
select public.add_curation_item((select id from t_b), (select id from public.books where title = '宇宙的形狀'));
select public.set_curation_tags((select id from t_b), array[(select id from public.tags where slug = 'fiction')]);
update public.curation_items set note = '推薦理由' where curation_id = (select id from t_b) and (note is null or trim(note) = '');
select public.publish_curation((select id from t_b));

-- 讀者：逛過 A、收藏 A 的書 → 推薦時 B（沒逛過）排前面；追蹤中只看追蹤的
select pg_temp.as_user('00000000-0000-0000-0000-000000000053');
select public.record_visit((select id from t_a), null);
insert into public.follows (follower_id, bookstore_id) select auth.uid(), id from public.bookstores where name = 'sci shop';
do $$ begin
  assert (select curation_id from public.explore_list(public.current_period(), 'recommend') where curation_id in ((select id from t_a), (select id from t_b)) order by score desc limit 1) = (select id from t_b), 'unvisited first';
  assert (select visited from public.explore_list(public.current_period()) where curation_id = (select id from t_a)), 'visited flag';
  assert (select count(*) from public.explore_list(public.current_period(), 'recommend', null, true)) = 1, 'following only';
  assert (select count(*) from public.explore_list(public.current_period(), 'recommend', null, false, null, true) where curation_id = (select id from t_a)) = 0, 'unvisited only';
  assert (select count(*) from public.explore_list(null, 'popular', 'fiction')) >= 1, 'tag + popular';
  assert (select count(*) from public.explore_months()) >= 1;
end $$;

-- 訪客：用裝置代號判斷已逛過
select pg_temp.as_user(null);
select public.record_visit((select id from t_b), 'device-xyz-123');
do $$ begin
  assert (select visited from public.explore_list(public.current_period(), 'latest', null, false, 'device-xyz-123') where curation_id = (select id from t_b));
end $$;

-- 想讀：加理由與來源；內容過濾；開始讀 → 進店主閱讀、理由變心得、從想讀移除
select pg_temp.as_user('00000000-0000-0000-0000-000000000051');
insert into public.book_saves (user_id, book_id, note, source_text)
  select auth.uid(), id, '朋友說很好看', '讀書會' from public.books where title = '想讀之書';
select pg_temp.expect_error($q$update public.book_saves set note = '加LINE私訊賺錢' where user_id = auth.uid()$q$, 'filtered save note');
create temp table t_r as select * from public.start_reading_from_save((select id from public.books where title = '想讀之書'));
do $$ begin
  assert (select count(*) from public.book_saves where user_id = auth.uid()) = 0, 'moved out of to-read';
  assert (select body from public.reading_notes where reading_id = (select id from t_r)) = '朋友說很好看', 'note became first reading note';
end $$;
select pg_temp.expect_error($q$select public.start_reading_from_save(gen_random_uuid())$q$, 'not in list');

reset role;
\echo 'ALL V1.1 SMOKE TESTS PASSED'
