-- M3 煙霧測試：探索搜尋、收藏的書、讀者看得到的店主閱讀
\set QUIET on
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
  if p is null then execute 'set role anon'; else execute 'set role authenticated'; end if;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000e', 'e@example.com', '{"full_name":"阿比"}'),
  ('00000000-0000-0000-0000-00000000000f', 'f@example.com', '{"full_name":"讀者F"}');

-- 店主 E：一檔已發布策展＋一本公開、一本私人的店主閱讀
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select id from public.create_bookstore('阿比動物園', '阿比', 'olive');
insert into public.books (source, title, authors, created_by)
  values ('manual', '我的家人與其他動物', array['傑洛德・杜瑞爾'], auth.uid()),
         ('manual', '野性的呼喚', array['傑克・倫敦'], auth.uid()),
         ('manual', '私房書', array['某人'], auth.uid());
create temp table t_e as select * from public.create_curation(public.current_period(), '影響我最多的動物文字書');
reset role;
grant select on t_e to anon, authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select public.add_curation_item((select id from t_e), (select id from public.books where title = '我的家人與其他動物'), '是我愛動物的起點。');
update public.curation_items set note = '推薦理由' where curation_id = (select id from t_e) and (note is null or trim(note) = '');
select public.publish_curation((select id from t_e));
insert into public.readings (bookstore_id, book_id) select public.my_bookstore_id(), id from public.books where title = '野性的呼喚';
insert into public.readings (bookstore_id, book_id, is_public) select public.my_bookstore_id(), id, false from public.books where title = '私房書';
insert into public.reading_notes (reading_id, body) select id, '巴克第一次聽見狼嚎那段，讀了三遍。' from public.readings;

-- 訪客：搜尋（書名、作者、店名、策展標題）
select pg_temp.as_user(null);
do $$ begin
  assert (select count(*) from public.search_explore('家人')) = 1, 'search by book title';
  assert (select count(*) from public.search_explore('杜瑞爾')) = 1, 'search by author';
  assert (select count(*) from public.search_explore('動物園')) = 1, 'search by store name';
  assert (select count(*) from public.search_explore('量子力學入門')) = 0, 'no result';
  assert (select count(*) from public.search_explore('%')) = 0, 'wildcard escaped';
  assert (select cover_titles[1] from public.explore_feed where curation_id = (select id from t_e)) = '我的家人與其他動物';
  assert (select count(*) from public.readings) = 1, 'anon sees public reading only';
  assert (select count(*) from public.reading_notes) = 1, 'notes of private reading hidden';
end $$;

-- 讀者 F：收藏書（從策展、從店主閱讀）、只看得到自己的
select pg_temp.as_user('00000000-0000-0000-0000-00000000000f');
insert into public.book_saves (user_id, book_id, from_curation_id, from_bookstore_id)
  select auth.uid(), id, (select id from t_e), (select id from public.bookstores where name = '阿比動物園')
  from public.books where title = '我的家人與其他動物';
insert into public.book_saves (user_id, book_id, from_bookstore_id)
  select auth.uid(), id, (select id from public.bookstores where name = '阿比動物園')
  from public.books where title = '野性的呼喚';
insert into public.follows (follower_id, bookstore_id) select auth.uid(), id from public.bookstores where name = '阿比動物園';
do $$ begin
  assert (select count(*) from public.book_saves) = 2;
  assert (select follower_count from public.public_bookstores where name = '阿比動物園') = 1;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
do $$ begin
  assert (select count(*) from public.book_saves) = 0, 'saves are private';
  assert (select count(*) from public.book_appearances where book_id = (select id from public.books where title = '野性的呼喚')) = 1, 'reading appearance';
end $$;

reset role;
\echo 'ALL M3 SMOKE TESTS PASSED'
