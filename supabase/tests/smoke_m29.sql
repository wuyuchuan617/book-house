-- v1.9.1 煙霧測試：探索分頁數跟分頁裡列得出來的一樣多（已結案的處方箋要算、沒有站的書旅不算）
\set QUIET on
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
  if p is null then execute 'set role anon'; else execute 'set role authenticated'; end if;
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-000000000301');
create temp table t_before as select public.explore_counts() as c;
insert into public.prescriptions (title) values ('會結案的一張');
select public.rx_close((select id from public.prescriptions where title = '會結案的一張'));
insert into public.trips (city, title, status) values ('台北市', '還沒有站的書旅', 'published');
do $$
declare c jsonb := public.explore_counts(); b jsonb := (select t.c from t_before t);
begin
  assert (c->>'rx')::int = (b->>'rx')::int + 1, 'closed rx still counted';
  assert (c->>'trips')::int = (b->>'trips')::int, 'trip without stops not counted';
  assert (c->>'rx')::int = jsonb_array_length(public.rx_list('latest', null, 100)), 'rx count matches rx tab';
  assert (c->>'trips')::int = jsonb_array_length(public.explore_trips(null, 60)), 'trip count matches trips tab';
end $$;

select pg_temp.as_user(null);
do $$ begin
  assert (public.explore_counts()->>'rx')::int = jsonb_array_length(public.rx_list('latest', null, 100)), 'anon rx count matches';
end $$;
reset role;
select 'PASSED smoke_m29';
