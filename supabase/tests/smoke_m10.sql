-- v1.2 煙霧測試：自選上架日期、4 個月內、新增策展的預設月份、每檔策展的拜訪數
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
  ('00000000-0000-0000-0000-0000000000a1', 'o10@example.com', '{"full_name":"店主十"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'r10@example.com', '{"full_name":"讀者十"}');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select id from public.create_bookstore('schedule shop', '店主十', 'olive');
insert into public.books (source, title, authors, created_by) values ('manual', '排程之書', array['某人'], auth.uid());

do $$
declare
  p0 date := public.current_period();
  b uuid := (select id from public.books where title = '排程之書');
  c1 public.curations; c2 public.curations; c3 public.curations;
begin
  -- 沒有任何策展 → 本月
  assert public.suggest_new_period() = p0, 'suggest this month';
  c1 := public.create_curation(p0, '本月');
  perform public.add_curation_item(c1.id, b);
  -- 有本月 → 下個月；再建一個 → 再下個月（草稿也算）
  assert public.suggest_new_period() = (p0 + interval '1 month')::date, 'suggest next';
  c2 := public.create_curation((p0 + interval '1 month')::date, '下個月');
  assert public.suggest_new_period() = (p0 + interval '2 months')::date, 'suggest after draft';
  c3 := public.create_curation((p0 + interval '3 months')::date, '三個月後');
  perform public.add_curation_item(c2.id, b);
  perform public.add_curation_item(c3.id, b);
  assert public.suggest_new_period() = (p0 + interval '4 months')::date, 'suggest beyond window (app blocks)';

  -- 上架日期：要在策展月份內
  begin
    perform public.publish_curation(c2.id, p0 + 5);
    raise exception 'FAIL: wrong month';
  exception when check_violation then null;
  end;
  -- 下個月 15 號 9 點（台北）
  c2 := public.publish_curation(c2.id, (p0 + interval '1 month')::date + 14);
  assert c2.status = 'scheduled';
  assert c2.scheduled_for = (((p0 + interval '1 month')::date + 14 + time '09:00')::timestamp at time zone 'Asia/Taipei'), 'scheduled 9am';
  -- 改日期：已預約的可以重新預約
  c2 := public.publish_curation(c2.id, (p0 + interval '1 month')::date + 2);
  assert c2.scheduled_for = (((p0 + interval '1 month')::date + 2 + time '09:00')::timestamp at time zone 'Asia/Taipei'), 'rescheduled';
  -- 3 個月後也可以預約
  c3 := public.publish_curation(c3.id);
  assert c3.status = 'scheduled' and c3.scheduled_for = ((((p0 + interval '3 months')::date) + time '09:00')::timestamp at time zone 'Asia/Taipei'), 'default 1st';
  -- 本月、今天 → 立刻上架
  c1 := public.publish_curation(c1.id, (now() at time zone 'Asia/Taipei')::date);
  assert c1.status = 'published', 'today publishes now';
end $$;
select pg_temp.expect_error($q$select public.create_curation((public.current_period() + interval '4 months')::date)$q$, 'beyond window');

-- 讀者拜訪本月策展 2 天 → 店主看到 2 次拜訪、1 位讀者
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select public.record_visit((select id from public.curations where title = '本月'));
reset role;
insert into public.curation_visits (curation_id, visitor_key, visit_date)
values ((select id from public.curations where title = '本月'), '00000000-0000-0000-0000-0000000000a2', current_date - 1);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  assert (select visit_count from public.my_curations() where title = '本月') = 2, 'visit count';
  assert (select visitor_count from public.curation_stats((select id from public.curations where title = '本月'))) = 1, 'visitor count';
  assert (select scheduled_for from public.my_curations() where title = '下個月') is not null;
end $$;
-- 別人看不到數據
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
do $$ begin
  assert (select count(*) from public.curation_stats((select id from public.curations where title = '本月' limit 1))) = 0, 'stats owner only';
end $$;

-- 到期上架
reset role;
update public.curations set scheduled_for = now() - interval '1 minute' where title = '下個月';
set role service_role;
do $$ begin
  assert public.promote_scheduled_curations() >= 1;
end $$;
reset role;
do $$ begin
  assert (select status from public.curations where title = '下個月') = 'published';
  assert (select status from public.curations where title = '三個月後') = 'scheduled';
end $$;
select 'V1.2 SCHEDULE SMOKE TEST PASSED';
