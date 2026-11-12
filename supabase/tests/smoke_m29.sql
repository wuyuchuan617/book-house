-- v1.9.1 煙霧測試：想去卡片的連結（my_places 回傳自己存的 link，別人看不到）
\set QUIET on
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
  if p is null then execute 'set role anon'; else execute 'set role authenticated'; end if;
end $$;
create or replace function pg_temp.expect_error(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then raise notice 'ok (expected error) %: %', p_label, sqlerrm; return; end;
  raise exception 'FAIL: expected an error for %', p_label;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000311', 'v191a@example.com', '{"full_name":"連結甲"}'),
  ('00000000-0000-0000-0000-000000000312', 'v191b@example.com', '{"full_name":"連結乙"}');
insert into public.places (google_place_id, name, category, public_ok, types) values
  ('gp-v191-link', '有連結的書店', 'bookstore', true, array['book_store']),
  ('gp-v191-nolink', '沒連結的書店', 'bookstore', true, array['book_store']);

select pg_temp.as_user('00000000-0000-0000-0000-000000000311');
insert into public.place_saves (place_id, note, link) values
  ((select id from public.places where google_place_id = 'gp-v191-link'), '朋友推薦', 'https://www.instagram.com/p/abc123/');
insert into public.place_saves (place_id) values ((select id from public.places where google_place_id = 'gp-v191-nolink'));
do $$
begin
  assert (select link from public.my_places('want') where name = '有連結的書店') = 'https://www.instagram.com/p/abc123/', 'want returns link';
  assert (select link is null from public.my_places('want') where name = '沒連結的書店'), 'no link → null';
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-000000000312');
insert into public.place_saves (place_id) values ((select id from public.places where google_place_id = 'gp-v191-link'));
do $$
begin
  assert (select link is null from public.my_places('want') where name = '有連結的書店'), 'other user does not see link';
end $$;

select pg_temp.as_user(null);
select pg_temp.expect_error($q$select * from public.my_places('want')$q$, 'anon cannot call my_places');
reset role;
select 'PASSED smoke_m29';
