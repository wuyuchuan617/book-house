-- v1.5 ③ 煙霧測試：探索 › 貼文（全部／追蹤中／附近）、檢舉貼文
\set QUIET on
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
  if p is null then execute 'set role anon'; else execute 'set role authenticated'; end if;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000001b1', 'ex1@example.com', '{"full_name":"探索一"}'),
  ('00000000-0000-0000-0000-0000000001b2', 'ex2@example.com', '{"full_name":"探索二"}'),
  ('00000000-0000-0000-0000-0000000001b3', 'ex3@example.com', '{"full_name":"探索三"}');
insert into public.places (google_place_id, name, category, public_ok, types, lat, lng) values
  ('gp-ex-near', '附近書店', 'bookstore', true, array['book_store'], 25.05, 121.52),
  ('gp-ex-far', '遠方書店', 'bookstore', true, array['book_store'], 22.6, 120.3);

select pg_temp.as_user('00000000-0000-0000-0000-0000000001b1');
insert into public.diary_entries (kind, body, is_public) values ('note', '探索一的日記', true);
insert into public.diary_entries (kind, body, place_id, is_public) values ('checkin', '探索一在遠方', (select id from public.places where google_place_id = 'gp-ex-far'), true);
insert into public.diary_entries (kind, body) values ('note', '探索一的私人日記');
select pg_temp.as_user('00000000-0000-0000-0000-0000000001b2');
insert into public.diary_entries (kind, body, place_id, is_public) values ('checkin', '探索二在附近', (select id from public.places where google_place_id = 'gp-ex-near'), true);

-- 訪客也看得到公開貼文；私人的不會出現
select pg_temp.as_user(null);
do $$
declare j jsonb := public.explore_posts();
begin
  assert (select count(*) from jsonb_array_elements(j) x where x->>'body' like '探索%') = 3, 'anon sees 3 public posts';
  assert (select count(*) from jsonb_array_elements(j) x where x->>'body' = '探索一的私人日記') = 0;
end $$;

-- 追蹤中：探索三追蹤探索一的書店 → 只看到探索一的 2 則
select pg_temp.as_user('00000000-0000-0000-0000-0000000001b3');
insert into public.follows (follower_id, bookstore_id)
  select auth.uid(), id from public.bookstores where owner_id = '00000000-0000-0000-0000-0000000001b1';
do $$
declare j jsonb := public.explore_posts('following');
begin
  assert jsonb_array_length(j) = 2, 'following shows 2, got ' || jsonb_array_length(j);
  assert (select bool_and(x->>'author_name' = '探索一的書店') from jsonb_array_elements(j) x);
end $$;

-- 附近：只有有地點的，離台北近的排前面
do $$
declare j jsonb := public.explore_posts('near', 25.04, 121.51);
begin
  assert (select count(*) from jsonb_array_elements(j) x where x->>'body' like '探索%') = 2, 'near: only posts with place';
  assert j->0->>'body' = '探索二在附近', 'nearest first';
  assert (j->0->>'distance_m')::int < 2000;
end $$;

-- 檢舉沒有地點的公開貼文
select public.report_checkin((select (x->>'id')::uuid from jsonb_array_elements(public.explore_posts()) x where x->>'body' = '探索一的日記'), 'spam');
do $$ begin assert (select count(*) from public.reports where reporter_id = auth.uid() and target_type::text = 'checkin') = 1; end $$;

-- 封鎖探索一 → 看不到他的貼文
insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), '00000000-0000-0000-0000-0000000001b1');
do $$ begin
  assert (select count(*) from jsonb_array_elements(public.explore_posts()) x where x->>'author_name' = '探索一的書店') = 0, 'blocked hidden';
end $$;

reset role;
\echo 'V1.5 EXPLORE POSTS SMOKE TEST PASSED'
