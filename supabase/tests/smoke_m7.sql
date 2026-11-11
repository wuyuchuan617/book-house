-- 上架前修正：內容過濾、管理員審核與通知、自動暫停、國圖書目、搜尋所有月份、開店預設提醒
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
  ('00000000-0000-0000-0000-000000000041', 'admin@example.com', '{"full_name":"管理員"}'),
  ('00000000-0000-0000-0000-000000000042', 'bad@example.com', '{"full_name":"店主壞"}'),
  ('00000000-0000-0000-0000-000000000043', 'r1@example.com', '{"full_name":"讀者一"}'),
  ('00000000-0000-0000-0000-000000000044', 'r2@example.com', '{"full_name":"讀者二"}'),
  ('00000000-0000-0000-0000-000000000045', 'r3@example.com', '{"full_name":"讀者三"}');
insert into public.app_admins (user_id) values ('00000000-0000-0000-0000-000000000041');

-- 內容過濾
select pg_temp.as_user('00000000-0000-0000-0000-000000000042');
select pg_temp.expect_error($q$select public.create_bookstore('幹 你 娘書店', '店主', 'moss')$q$, 'filtered store name (spaces)');
select id from public.create_bookstore('ok shop', '店主壞', 'clay');
do $$ begin
  assert (select monthly_reminder from public.notification_prefs where user_id = auth.uid()), 'reminder on by default';
end $$;
select pg_temp.expect_error($q$update public.bookstores set tagline = '加LINE 私訊賺錢' where owner_id = auth.uid()$q$, 'filtered tagline');
create temp table t_c as select * from public.create_curation(public.current_period(), '好書');
reset role;
grant select on t_c to anon, authenticated, service_role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000042');
select pg_temp.expect_error($q$update public.curations set description = 'f.u.c.k' where id = (select id from t_c)$q$, 'filtered description (punct)');
select pg_temp.expect_error($q$select public.create_custom_tag('援交')$q$, 'filtered tag');
update public.curations set description = '一本講賭博歷史的好書' where id = (select id from t_c);  -- 主題字不擋

-- 國圖書目匯入：新書、以 ISBN 合併既有的書
reset role;
set role service_role;
select public.upsert_api_books('[{"source":"google_books","external_id":"gx1","isbn13":"9786260000001","title":"山海之間","authors":["某作者"]}]'::jsonb);
do $$ begin
  assert public.upsert_ncl_books('[
    {"isbn13":"9786260000001","title":"山海之間","authors":["某作者"],"publisher":"遠方出版","published_year":"2025"},
    {"isbn13":"9786260000002","title":"冬日觀星手帖","authors":["林星"],"publisher":"天文社","published_year":"2026"},
    {"isbn13":"bad","title":"x"}]'::jsonb) = 2, 'two valid rows';
  assert (select publisher from public.books where isbn13 = '9786260000001') = '遠方出版', 'merged publisher into api book';
  assert (select source from public.books where isbn13 = '9786260000002') = 'ncl';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000042');
do $$ begin
  assert (select count(*) from public.search_local_books('978-626-000000-2')) = 1, 'isbn search with dashes';
  assert (select count(*) from public.search_local_books('天文社')) = 1, 'publisher search';
end $$;
select public.add_curation_item((select id from t_c), (select id from public.books where isbn13 = '9786260000002'));
update public.curation_items set note = '推薦理由' where curation_id = (select id from t_c) and (note is null or trim(note) = '');
select public.publish_curation((select id from t_c));

-- 搜尋所有月份：把這檔改成上個月仍搜得到
reset role;
set session_replication_role = replica;
update public.curations set period = (public.current_period() - interval '1 month')::date where id = (select id from t_c);
set session_replication_role = origin;
select pg_temp.as_user(null);
do $$ begin
  assert (select count(*) from public.search_explore('冬日觀星')) = 1, 'search finds last month';
  assert (select count(*) from public.explore_feed where curation_id = (select id from t_c)) = 0;
  assert (select count(*) from public.published_feed where curation_id = (select id from t_c)) = 1;
end $$;

-- 檢舉：通知管理員；第 3 位檢舉 → 自動暫停
select pg_temp.as_user('00000000-0000-0000-0000-000000000043');
select public.report_bookstore((select id from public.bookstores where name = 'ok shop'), 'spam');
select pg_temp.as_user('00000000-0000-0000-0000-000000000044');
select public.report_bookstore((select id from public.bookstores where name = 'ok shop'), 'spam');
reset role;
do $$ begin
  assert (select status from public.bookstores where name = 'ok shop') = 'active', 'not yet paused at 2';
  assert (select count(*) from public.notification_outbox where kind = 'moderation') = 2, 'admin notified twice';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000000045');
select public.report_bookstore((select id from public.bookstores where name = 'ok shop'), 'inappropriate');
reset role;
do $$ begin
  assert (select status from public.bookstores where name = 'ok shop') = 'paused', 'auto paused at 3';
end $$;

-- 管理員 App 內審核；一般人不行
select pg_temp.as_user('00000000-0000-0000-0000-000000000043');
select pg_temp.expect_error($q$select * from public.admin_moderation_queue()$q$, 'queue admin-only');
select pg_temp.expect_error($q$select public.admin_moderate((select id from public.bookstores limit 1), 'pause')$q$, 'moderate admin-only');
insert into public.feedback (user_id, kind, body) values (auth.uid(), 'bug', '搜尋很慢');
select pg_temp.as_user('00000000-0000-0000-0000-000000000041');
do $$ begin
  assert public.is_admin();
  assert (select reporter_count from public.admin_moderation_queue() where store_name = 'ok shop') = 3;
  assert (select count(*) from public.admin_paused_stores() where store_name = 'ok shop') = 1;
  assert (select count(*) from public.admin_recent_feedback()) >= 1;
end $$;
select public.admin_moderate((select bookstore_id from public.admin_paused_stores() where store_name = 'ok shop'), 'restore');
reset role;
do $$ begin
  assert (select status from public.bookstores where name = 'ok shop') = 'active', 'restored';
  assert (select count(*) from public.notification_outbox where kind = 'feedback') = 1, 'feedback notified';
end $$;

-- 開店 24 小時未發布 → 提醒一次
update public.bookstores set created_at = now() - interval '30 hours' where name = 'ok shop';
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000046', 'n@example.com', '{"full_name":"新店主"}');
select pg_temp.as_user('00000000-0000-0000-0000-000000000046');
select id from public.create_bookstore('new shop', '新店主', 'mist');
reset role;
update public.bookstores set created_at = now() - interval '30 hours' where name = 'new shop';
do $$ begin
  assert public.enqueue_onboarding_nudges() = 1, 'only the store without a live curation';
  assert public.enqueue_onboarding_nudges() = 0, 'nudge only once';
end $$;

reset role;
\echo 'ALL LAUNCH-FIX SMOKE TESTS PASSED'
