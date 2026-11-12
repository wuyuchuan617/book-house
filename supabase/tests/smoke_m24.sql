-- v1.8 煙霧測試 ③：書旅
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
  ('00000000-0000-0000-0000-0000000002c1', 'trip1@example.com', '{"full_name":"書旅甲"}'),
  ('00000000-0000-0000-0000-0000000002c2', 'trip2@example.com', '{"full_name":"書旅乙"}');
insert into public.places (google_place_id, name, address, category, public_ok, types) values
  ('gp-t1', '草祭二手書店', '700台南市中西區南門路71號', 'bookstore', true, array['book_store']),
  ('gp-t2', '鹿早茶室', '臺南市中西區', 'cafe', true, array['cafe']),
  ('gp-t3', '某人的家', '台南市東區', 'other', false, array['street_address']);
do $$ begin
  assert (select city from public.places where google_place_id = 'gp-t1') = '台南市', 'city from address';
  assert (select city from public.places where google_place_id = 'gp-t2') = '台南市', '臺 → 台';
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000002c1');
select pg_temp.expect_error($q$select public.save_trip(null, '台南市', '空的', null, 1, 'published', '[]')$q$, 'publish needs stops');
select pg_temp.expect_error($q$select public.save_trip(null, '台南市', '私人', null, 1, 'draft', jsonb_build_array(jsonb_build_object('place_id', (select id from public.places where google_place_id = 'gp-t3'))))$q$, 'private place');
create temp table t_trip as select (public.save_trip(null, '臺南市', '老屋書店', '兩天一夜', 2, 'draft', jsonb_build_array(
  jsonb_build_object('place_id', (select id from public.places where google_place_id = 'gp-t1'), 'day', 1, 'note', '地下室有絕版', 'slot', 'morning'),
  jsonb_build_object('place_id', (select id from public.places where google_place_id = 'gp-t2'), 'day', 1, 'note', '午餐')))->>'id')::uuid as id;
do $$ begin assert (select city from public.trips where id = (select id from t_trip)) = '台南市'; end $$;

-- 草稿別人看不到
select pg_temp.as_user('00000000-0000-0000-0000-0000000002c2');
do $$ begin
  assert public.trip_detail((select id from t_trip)) is null, 'draft hidden';
  assert jsonb_array_length(public.explore_trips('台南市')) = 0;
end $$;

-- 公開
select pg_temp.as_user('00000000-0000-0000-0000-0000000002c1');
select public.save_trip((select id from t_trip), '台南市', '老屋書店', '兩天一夜', 2, 'published', jsonb_build_array(
  jsonb_build_object('place_id', (select id from public.places where google_place_id = 'gp-t2'), 'day', 1),
  jsonb_build_object('place_id', (select id from public.places where google_place_id = 'gp-t1'), 'day', 2)));
select pg_temp.as_user('00000000-0000-0000-0000-0000000002c2');
do $$
declare d jsonb := public.trip_detail((select id from t_trip));
begin
  assert d is not null and jsonb_array_length(d->'stops') = 2;
  assert d->'stops'->0->'place'->>'name' = '鹿早茶室', 'order kept';
  assert (d->>'bookstore_count')::int = 1;
  assert (public.trip_cities()->0->>'city') = '台南市';
  assert jsonb_array_length(public.explore_trips('台南市')) = 1;
  assert public.place_trip_count((select id from public.places where google_place_id = 'gp-t1')) = 1;
end $$;
select public.trip_save((select id from t_trip), true);
do $$ begin
  assert public.save_trip_places((select id from t_trip)) = 2, 'two places saved';
  assert public.save_trip_places((select id from t_trip)) = 0, 'no duplicates';
  assert jsonb_array_length(public.my_trips()->'saved') = 1;
end $$;
select pg_temp.expect_error($q$select public.save_trip((select id from t_trip), '台南市', '改別人的', null, 1, 'draft', '[]')$q$, 'not owner');

-- 書店公開設定關掉書旅 → 別人看不到
select pg_temp.as_user('00000000-0000-0000-0000-0000000002c1');
update public.bookstores set show_trip = false where owner_id = auth.uid();
select pg_temp.as_user('00000000-0000-0000-0000-0000000002c2');
do $$ begin assert public.trip_detail((select id from t_trip)) is null, 'hidden by show_trip'; end $$;

reset role;
select 'PASSED smoke_m24';
