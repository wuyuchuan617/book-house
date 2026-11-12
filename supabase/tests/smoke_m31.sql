-- v1.9.1 煙霧測試：多天的活動（開始～結束日期）
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
  ('00000000-0000-0000-0000-0000000003e1', 'rg1@example.com', '{"full_name":"區間甲"}'),
  ('00000000-0000-0000-0000-0000000003e2', 'rg2@example.com', '{"full_name":"區間乙"}');
insert into public.places (google_place_id, name, category, public_ok, types) values ('gp-rg', '世貿一館', 'museum', true, array['museum']);

-- 甲：新增三天的書展
select pg_temp.as_user('00000000-0000-0000-0000-0000000003e1');
create temp table t_rg as select (public.create_event('台北國際書展', 'exhibit', now() + interval '5 days', now() + interval '7 days 8 hours',
  (select id from public.places where google_place_id = 'gp-rg')))->>'id' as id;
do $$ begin
  assert (select id from t_rg) is not null, 'multi-day created';
  assert (public.event_detail((select id::uuid from t_rg))->>'ends_at')::timestamptz > now() + interval '7 days';
end $$;
select pg_temp.expect_error($q$select public.create_event('太長', 'exhibit', now() + interval '1 day', now() + interval '120 days', null, true)$q$, 'span over 92 days');
select pg_temp.expect_error($q$select public.create_event('倒過來', 'exhibit', now() + interval '3 days', now() + interval '1 day', null, true)$q$, 'end before start');

-- 乙：同地點、落在區間中間那天 → 問是不是這個；區間外 → 直接新增；找活動用中間那天也找得到
select pg_temp.as_user('00000000-0000-0000-0000-0000000003e2');
do $$
declare
  pl uuid := (select id from public.places where google_place_id = 'gp-rg');
  mid jsonb := public.create_event('書展第二天', 'exhibit', now() + interval '6 days', null, pl);
  over jsonb := public.create_event('另一個展', 'exhibit', now() + interval '3 days', now() + interval '5 days 2 hours', pl);
  later jsonb := public.create_event('之後的講座', 'talk', now() + interval '10 days', null, pl);
begin
  assert mid ? 'duplicate' and mid->'duplicate'->>'title' = '台北國際書展', 'day inside range asks';
  assert over ? 'duplicate', 'overlapping range asks';
  assert later ? 'id', 'outside range creates';
  assert jsonb_array_length(public.find_events(null, pl, ((now() + interval '6 days') at time zone 'Asia/Taipei')::date)) = 1, 'find by a day inside range';
end $$;

reset role;
select 'PASSED smoke_m29';
