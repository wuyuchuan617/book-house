-- M5 煙霧測試：檢舉、封鎖、解除封鎖、審核
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
  ('00000000-0000-0000-0000-000000000021', 'owner@example.com', '{"full_name":"店主J"}'),
  ('00000000-0000-0000-0000-000000000022', 'reader@example.com', '{"full_name":"讀者K"}'),
  ('00000000-0000-0000-0000-000000000023', 'reader2@example.com', '{"full_name":"讀者L"}');

select pg_temp.as_user('00000000-0000-0000-0000-000000000021');
create temp table t_s as select * from public.create_bookstore('spam shop', '店主J', 'clay');
reset role;
grant select on t_s to anon, authenticated, service_role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000021');
select pg_temp.expect_error($q$select public.block_bookstore((select id from t_s))$q$, 'cannot block yourself');

-- 訪客不能檢舉／封鎖
select pg_temp.as_user(null);
select pg_temp.expect_error($q$select public.report_bookstore((select id from t_s), 'spam')$q$, 'anon report');
select pg_temp.expect_error($q$select public.block_bookstore((select id from t_s))$q$, 'anon block');

-- 讀者 K：追蹤 → 檢舉（不封鎖）→ 24 小時內重複檢舉被擋
select pg_temp.as_user('00000000-0000-0000-0000-000000000022');
insert into public.follows (follower_id, bookstore_id) select auth.uid(), id from t_s;
select public.report_bookstore((select id from t_s), 'spam', '一直貼廣告連結');
select pg_temp.expect_error($q$select public.report_bookstore((select id from t_s), 'other')$q$, 'report dedupe');
do $$ begin
  assert (select count(*) from public.public_bookstores where id = (select id from t_s)) = 1, 'still visible after report only';
end $$;

-- 讀者 L：檢舉並封鎖 → 看不到、追蹤被移除、已封鎖清單看得到店名
select pg_temp.as_user('00000000-0000-0000-0000-000000000023');
insert into public.follows (follower_id, bookstore_id) select auth.uid(), id from t_s;
select public.report_bookstore((select id from t_s), 'inappropriate', null, true);
do $$ begin
  assert (select count(*) from public.public_bookstores where id = (select id from t_s)) = 0, 'hidden after block';
  assert (select count(*) from public.follows) = 0, 'follow removed';
  assert (select store_name from public.my_blocked_accounts()) = 'spam shop', 'blocked list shows store';
end $$;
-- 解除封鎖 → 又看得到
delete from public.blocks where blocked_id = '00000000-0000-0000-0000-000000000021';
do $$ begin
  assert (select count(*) from public.public_bookstores where id = (select id from t_s)) = 1, 'visible after unblock';
end $$;

-- 一般使用者不能看審核佇列、不能審核
select pg_temp.expect_error($q$select * from public.moderation_queue$q$, 'queue is staff-only');
select pg_temp.expect_error($q$select public.moderate_bookstore((select id from t_s), 'pause')$q$, 'moderate is staff-only');

-- 審核：暫停 → 讀者看不到 → 恢復
reset role;
set role service_role;
do $$ begin
  assert (select reporter_count from public.moderation_queue where bookstore_id = (select id from t_s)) = 2;
end $$;
select public.moderate_bookstore((select id from t_s), 'pause');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000022');
do $$ begin
  assert (select count(*) from public.public_bookstores where id = (select id from t_s)) = 0, 'paused store hidden';
end $$;
reset role;
set role service_role;
select public.moderate_bookstore((select id from t_s), 'restore');
do $$ begin
  assert (select count(*) from public.moderation_queue where bookstore_id = (select id from t_s)) = 0, 'reports actioned';
end $$;

reset role;
\echo 'ALL M5 SMOKE TESTS PASSED'
