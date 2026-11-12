-- v1.8.1 煙霧測試：分享活動也記進日記
\set QUIET on
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
  if p is null then execute 'set role anon'; else execute 'set role authenticated'; end if;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000002d1', 'dev1@example.com', '{"full_name":"日記活動甲"}'),
  ('00000000-0000-0000-0000-0000000002d2', 'dev2@example.com', '{"full_name":"日記活動乙"}');
insert into public.places (google_place_id, name, category, public_ok, types) values ('gp-dev', '松菸', 'museum', true, array['museum']);

select pg_temp.as_user('00000000-0000-0000-0000-0000000002d1');
create temp table t_dev as select (public.create_event('日記裡的市集', 'market', now() + interval '2 days', null,
  (select id from public.places where google_place_id = 'gp-dev')))->>'id' as id;
select public.share_event((select id::uuid from t_dev), '要去逛', true);
do $$
declare d jsonb := public.my_diary_day(null); it jsonb;
begin
  select x into it from jsonb_array_elements(d->'items') x where x->>'type' = 'event_share';
  assert it is not null, 'event share in diary day';
  assert it->'event'->>'title' = '日記裡的市集' and it->>'body' = '要去逛', 'event share content';
  assert it->'event'->'place'->>'name' = '松菸', 'event place';
  assert (select entries from public.my_active_days(public.taipei_today(), public.taipei_today())) >= 1, 'active day counted';
  assert (select today_done from public.my_diary_streak()), 'streak today done';
end $$;

-- 別人的日記看不到
select pg_temp.as_user('00000000-0000-0000-0000-0000000002d2');
do $$
begin
  assert not exists (select 1 from jsonb_array_elements(public.my_diary_day(null)->'items') x where x->>'type' = 'event_share'), 'not in other diary';
end $$;
reset role;
select 'PASSED smoke_m25';
