-- M6 煙霧測試：推播 token、通知佇列、每月提醒、埋點事件
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
  ('00000000-0000-0000-0000-000000000031', 'o6@example.com', '{"full_name":"店主六"}'),
  ('00000000-0000-0000-0000-000000000032', 'r6@example.com', '{"full_name":"讀者六"}'),
  ('00000000-0000-0000-0000-000000000033', 'q6@example.com', '{"full_name":"讀者七"}');

-- token 登記；同一支手機換帳號 → 改掛新帳號
select pg_temp.as_user('00000000-0000-0000-0000-000000000032');
select public.register_push_token('ExponentPushToken[aaa]', 'ios');
select pg_temp.as_user('00000000-0000-0000-0000-000000000033');
select public.register_push_token('ExponentPushToken[aaa]', 'ios');
reset role;
do $$ begin
  assert (select user_id from public.push_tokens where token = 'ExponentPushToken[aaa]') = '00000000-0000-0000-0000-000000000033', 'token moved';
end $$;

-- 店主開店；讀者六、七追蹤（七關掉新策展通知）→ 店主收到 2 則新追蹤
select pg_temp.as_user('00000000-0000-0000-0000-000000000031');
select id from public.create_bookstore('notify shop', '店主六', 'moss');
create temp table t_n as select * from public.create_curation(public.current_period(), '通知測試');
reset role;
grant select on t_n to anon, authenticated, service_role;
update public.notification_prefs set new_curation_from_followed = false where user_id = '00000000-0000-0000-0000-000000000033';
select pg_temp.as_user('00000000-0000-0000-0000-000000000032');
insert into public.follows (follower_id, bookstore_id) select auth.uid(), id from public.bookstores where name = 'notify shop';
select pg_temp.as_user('00000000-0000-0000-0000-000000000033');
insert into public.follows (follower_id, bookstore_id) select auth.uid(), id from public.bookstores where name = 'notify shop';
reset role;
do $$ begin
  assert (select count(*) from public.notification_outbox where kind = 'new_follower' and user_id = '00000000-0000-0000-0000-000000000031') = 2;
end $$;

-- 發布 → 只有讀者六收到（七關掉了）
select pg_temp.as_user('00000000-0000-0000-0000-000000000031');
insert into public.books (source, title, authors, created_by) values ('manual', '通知之書', array['某人'], auth.uid());
select public.add_curation_item((select id from t_n), (select id from public.books where title = '通知之書'));
select public.publish_curation((select id from t_n));
reset role;
do $$ begin
  assert (select count(*) from public.notification_outbox where kind = 'new_curation') = 1, 'only opted-in follower';
  assert (select user_id from public.notification_outbox where kind = 'new_curation') = '00000000-0000-0000-0000-000000000032';
  assert (select data->>'url' from public.notification_outbox where kind = 'new_curation') like '/store/%';
end $$;

-- 使用者看不到佇列
select pg_temp.as_user('00000000-0000-0000-0000-000000000032');
do $$ begin assert (select count(*) from public.notification_outbox) = 0, 'outbox hidden'; end $$;

-- 每月提醒：今天日期剛好是提醒日 → 排進佇列
reset role;
update public.notification_prefs set monthly_reminder = true, reminder_day = 25
  where user_id = '00000000-0000-0000-0000-000000000031';
do $$ begin
  assert public.enqueue_monthly_reminders((date_trunc('month', now()) + interval '24 days')::date) = 1, 'reminder on the 25th';
  assert public.enqueue_monthly_reminders((date_trunc('month', now()) + interval '9 days')::date) = 0, 'no reminder on the 10th';
end $$;

-- 埋點：訪客、登入者都能寫；不能冒用別人、不能讀
select pg_temp.as_user(null);
insert into public.events (anon_id, name, props, platform) values ('v-abc', 'web_store_view', '{"ref":"line"}', 'web');
select pg_temp.expect_error($q$insert into public.events (name) values ('Bad Name!')$q$, 'event name format');
select pg_temp.as_user('00000000-0000-0000-0000-000000000032');
insert into public.events (user_id, name, props, platform) values (auth.uid(), 'book_saved', '{}', 'ios');
select pg_temp.expect_error($q$insert into public.events (user_id, name) values ('00000000-0000-0000-0000-000000000031', 'book_saved')$q$, 'cannot spoof user');
select pg_temp.expect_error($q$select count(*) from public.events$q$, 'events not readable');

reset role;
\echo 'ALL M6 SMOKE TESTS PASSED'
