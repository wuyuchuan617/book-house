-- v1.5 ④ 煙霧測試：閱讀處方簽
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

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000001c1', 'rx1@example.com', '{"full_name":"處方一"}'),
  ('00000000-0000-0000-0000-0000000001c2', 'rx2@example.com', '{"full_name":"處方二"}'),
  ('00000000-0000-0000-0000-0000000001c3', 'rx3@example.com', '{"full_name":"處方三"}');

-- 發起：匿名、14 天；同時開放最多 3 張；標籤只能用固定的
select pg_temp.as_user('00000000-0000-0000-0000-0000000001c1');
insert into public.prescriptions (title, body, tags, anonymous) values ('最近工作很累，想讀不累但不空洞的小說', '通勤可以讀完', array['work', 'mood'], true);
insert into public.prescriptions (title, duration_days) values ('第二張', 7);
insert into public.prescriptions (title, duration_days) values ('第三張', 30);
select pg_temp.expect_error($q$insert into public.prescriptions (title) values ('第四張')$q$, 'max 3 open');
select pg_temp.expect_error($q$insert into public.prescriptions (title, tags) values ('x', array['nope'])$q$, 'fixed tags');
do $$ begin
  assert (select closes_at::date - created_at::date from public.prescriptions where title = '第二張') = 7, '7 days';
end $$;
insert into public.books (source, title, authors, created_by) values ('manual', '山茶花文具店', array['小川糸'], auth.uid()), ('manual', '夜晚的潛水艇', array['陳春成'], auth.uid());
create temp table t_rx as select id from public.prescriptions where title like '最近工作很累%';
grant select on t_rx to anon, authenticated;
select pg_temp.expect_error($q$select public.rx_reply((select id from t_rx), (select id from public.books where title = '山茶花文具店'), '自己開給自己的處方')$q$, 'owner cannot reply');

-- 開處方：每人每張一次（再開會變成修改），理由 10 字以上
select pg_temp.as_user('00000000-0000-0000-0000-0000000001c2');
select pg_temp.expect_error($q$select public.rx_reply((select id from t_rx), (select id from public.books where title = '山茶花文具店'), '太短')$q$, 'reason too short');
select public.rx_reply((select id from t_rx), (select id from public.books where title = '夜晚的潛水艇'), '短篇，想像力很飽滿但不累。');
select public.rx_reply((select id from t_rx), (select id from public.books where title = '山茶花文具店'), '每章一封代筆信，讀一章剛好一站捷運。');
do $$ begin
  assert (select count(*) from public.prescription_replies where user_id = auth.uid()) = 1, 'one reply per person (updated)';
  assert (public.rx_detail((select id from t_rx))->'my_reply'->'book'->>'title') = '山茶花文具店';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000001c3');
select public.rx_reply((select id from t_rx), (select id from public.books where title = '山茶花文具店'), '很溫柔，讀完會想寫信給朋友。');

-- 詳情：同一本書合併、依人數；匿名發起看不到是誰；列表數字
select pg_temp.as_user(null);
do $$
declare j jsonb := public.rx_detail((select id from t_rx));
begin
  assert j->'author'->>'name' is null, 'anonymous author hidden';
  assert jsonb_array_length(j->'books') = 1, 'grouped by book';
  assert (j->'books'->0->>'count')::int = 2;
  assert (j->'books'->0->'reasons'->0->'author'->>'name') = '處方二的書店', 'repliers show their store';
  assert (select (x->>'reply_count')::int from jsonb_array_elements(public.rx_list()) x where x->>'title' like '最近工作很累%') = 2;
  assert (select count(*) from jsonb_array_elements(public.rx_list('unanswered')) x where x->>'title' like '最近工作很累%') = 0;
  assert (select count(*) from jsonb_array_elements(public.rx_list('latest', 'work')) x) >= 1;
  assert (select count(*) from public.prescriptions) = 0, 'table not readable directly (anonymity)';
end $$;

-- 通知：發起人收到 1 則（1 小時內合併）
reset role;
do $$ begin
  assert (select count(*) from public.notification_outbox where user_id = '00000000-0000-0000-0000-0000000001c1' and kind = 'prescription' and data->>'event' = 'reply') = 1, 'merged reply notification';
end $$;

-- 發起人把書加入想讀 → 開這本的兩個人都收到通知，詳情標出 owner_wants
select pg_temp.as_user('00000000-0000-0000-0000-0000000001c1');
insert into public.book_saves (user_id, book_id, source_text) values (auth.uid(), (select id from public.books where title = '山茶花文具店'), '閱讀處方簽');
do $$ begin
  assert (public.rx_detail((select id from t_rx))->'books'->0->>'owner_wants')::boolean;
  assert (select (x->>'wanted_count')::int from jsonb_array_elements(public.rx_mine('started')) x where x->>'title' like '最近工作很累%') = 1;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.notification_outbox where kind = 'prescription' and data->>'event' = 'wanted') = 2, 'wanted notifications';
end $$;

-- 延長一次、結案後不能再開
select pg_temp.as_user('00000000-0000-0000-0000-0000000001c1');
select public.rx_extend((select id from t_rx));
select pg_temp.expect_error($q$select public.rx_extend((select id from t_rx))$q$, 'extend only once');
select public.rx_close((select id from t_rx));
select pg_temp.as_user('00000000-0000-0000-0000-0000000001c2');
select pg_temp.expect_error($q$select public.rx_reply((select id from t_rx), (select id from public.books where title = '夜晚的潛水艇'), '結案後還想再改一次理由')$q$, 'closed');
do $$ begin
  assert (select count(*) from jsonb_array_elements(public.rx_mine('replied'))) = 1;
  assert (select (x->>'owner_wants')::boolean from jsonb_array_elements(public.rx_mine('replied')) x);
end $$;

-- 店主手記：處方二開過的處方會出現在他的書店頁
select pg_temp.as_user('00000000-0000-0000-0000-0000000001c3');
do $$ begin
  assert (select count(*) from jsonb_array_elements(public.store_journal((select id from public.bookstores where owner_id = '00000000-0000-0000-0000-0000000001c2'))) x where x->>'type' = 'rx_reply') = 1;
  assert (select count(*) from jsonb_array_elements(public.store_journal((select id from public.bookstores where owner_id = '00000000-0000-0000-0000-0000000001c1'))) x where x->>'type' = 'rx') = 2, 'anonymous rx hidden from store page';
end $$;

-- 檢舉、封鎖
select public.rx_report('prescription', (select id from t_rx), 'spam');
insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), '00000000-0000-0000-0000-0000000001c2');
do $$ begin
  assert (public.rx_detail((select id from t_rx))->>'reply_count')::int = 1, 'blocked replier hidden';
end $$;

-- 快結案提醒：沒人開的處方剩 3 天內 → 提醒一次
reset role;
update public.prescriptions set closes_at = now() + interval '2 days' where title = '第二張';
do $$ begin
  assert public.enqueue_rx_reminders() = 1;
  assert public.enqueue_rx_reminders() = 0, 'only once';
end $$;

\echo 'V1.5 PRESCRIPTIONS SMOKE TEST PASSED'
