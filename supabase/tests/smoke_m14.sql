-- v1.3 煙霧測試：筆記一起存成心得、想去／去過、獨立書店
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
  ('00000000-0000-0000-0000-0000000000e1', 'p1@example.com', '{"full_name":"地方一"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'p2@example.com', '{"full_name":"地方二"}');
insert into public.places (google_place_id, name, category, public_ok, types) values
  ('gp-indie', '小小書房', 'bookstore', true, array['book_store']),
  ('gp-cafe2', '想去咖啡', 'cafe', true, array['cafe']);

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select 1 from public.create_bookstore('place shop', '地方一', 'moss');
insert into public.books (source, title, authors, created_by) values ('manual', '地方測試書', array['某人'], auth.uid());
select 1 from public.add_reading((select id from public.books where title = '地方測試書'), 'reading', false, null);

-- 筆記同時存成心得：當天時間軸只列一次
insert into public.reading_notes (reading_id, kind, body)
select r.id, 'thought', '一起存' from public.readings r join public.books b on b.id = r.book_id where b.title = '地方測試書';
insert into public.diary_entries (kind, body, book_id, reading_note_id)
values ('note', '一起存', (select id from public.books where title = '地方測試書'), (select id from public.reading_notes where body = '一起存'));
do $$
declare j jsonb := public.my_diary_day();
begin
  assert (select count(*) from jsonb_array_elements(j->'items') x where x->>'type' = 'reading_note') = 0, 'linked note hidden';
  assert (select count(*) from jsonb_array_elements(j->'items') x where x->>'type' = 'note' and x->>'reading_note_id' is not null) = 1;
  assert (select (x->>'note_public')::boolean = false from jsonb_array_elements(j->'items') x where x->>'type' = 'note');
  assert (select (x->>'is_public') is not null from jsonb_array_elements(j->'items') x where x->>'type' = 'started');
end $$;

-- 想去：存了還沒去 → want；打卡後 → visited
insert into public.place_saves (place_id, note) values ((select id from public.places where google_place_id = 'gp-cafe2'), '朋友說二樓很安靜');
insert into public.place_saves (place_id) values ((select id from public.places where google_place_id = 'gp-indie'));
do $$
begin
  assert (select count(*) from public.my_places('want')) = 2, 'two wants';
  assert (select note from public.my_places('want') where name = '想去咖啡') = '朋友說二樓很安靜';
  assert (select count(*) from public.my_places('visited')) = 0;
end $$;
insert into public.diary_entries (kind, place_id) values ('checkin', (select id from public.places where google_place_id = 'gp-cafe2'));
do $$
begin
  assert (select count(*) from public.my_places('want')) = 1, 'one want left';
  assert (select count(*) from public.my_places('visited')) = 1;
  assert (select saved from public.my_places('visited'));
  assert (public.place_detail((select id from public.places where google_place_id = 'gp-cafe2'))->>'my_note') = '朋友說二樓很安靜';
end $$;
select pg_temp.expect_error($q$insert into public.place_saves (place_id, note) values ((select id from public.places where google_place_id = 'gp-indie'), repeat('長', 101)) on conflict (user_id, place_id) do update set note = excluded.note$q$, 'note too long');

-- 獨立書店：1 票不算、2 票算；咖啡店不能標；管理員可以覆寫
select pg_temp.expect_error($q$select public.set_indie_vote((select id from public.places where google_place_id = 'gp-cafe2'), true)$q$, 'cafe cannot be indie');
do $$ begin assert not public.set_indie_vote((select id from public.places where google_place_id = 'gp-indie'), true), 'one vote'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
do $$
declare pid uuid := (select id from public.places where google_place_id = 'gp-indie');
begin
  assert public.set_indie_vote(pid, true), 'two votes';
  assert (public.place_detail(pid)->>'is_indie')::boolean;
  assert (public.place_detail(pid)->>'my_indie_vote')::boolean;
  assert (select count(*) from public.place_indie_votes) = 1, 'only my vote visible';
end $$;
select pg_temp.expect_error($q$select public.admin_set_place_indie((select id from public.places where google_place_id = 'gp-indie'), false)$q$, 'not admin');
reset role;
insert into public.app_admins (user_id) values ('00000000-0000-0000-0000-0000000000e2');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select public.admin_set_place_indie((select id from public.places where google_place_id = 'gp-indie'), false);
do $$ begin assert not public.place_is_indie((select id from public.places where google_place_id = 'gp-indie')), 'override'; end $$;
select public.admin_set_place_indie((select id from public.places where google_place_id = 'gp-indie'), null);

-- 探索可以篩獨立書店（要有公開打卡才會出現在探索）
insert into public.diary_entries (kind, place_id, is_public) values ('checkin', (select id from public.places where google_place_id = 'gp-indie'), true);
do $$
begin
  assert (select count(*) from public.explore_places('latest', 'indie')) = 1, 'indie filter';
  assert (select is_indie from public.explore_places('latest', 'bookstore') where name = '小小書房');
end $$;

select 'V1.3 PLACES SMOKE TEST PASSED';
