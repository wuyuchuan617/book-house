-- v1.7.1：自動開的書店預設公開想讀、想去、積讀
begin;
do $$
declare
  u uuid := gen_random_uuid();
  s record;
begin
  insert into auth.users (id, email, raw_user_meta_data) values (u, 'm21@example.com', '{"name":"M21"}');
  select * into s from public.bookstores where owner_id = u;
  assert s.id is not null, '自動開書店';
  assert s.auto_created, '是自動開的';
  assert s.show_want and s.show_place and s.show_owned, '想讀、想去、積讀預設打開';
  raise notice 'smoke_m21 PASSED';
end $$;
rollback;
