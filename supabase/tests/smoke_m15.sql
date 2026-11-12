-- v1.5 煙霧測試：想去的活動日期 range 與連結
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
  ('00000000-0000-0000-0000-0000000000f1', 'w1@example.com', '{"full_name":"想去一"}'),
  ('00000000-0000-0000-0000-0000000000f2', 'w2@example.com', '{"full_name":"想去二"}');
insert into public.places (google_place_id, name, category, public_ok, types) values
  ('gp-event', '辦活動的書店', 'bookstore', true, array['book_store']);

select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
-- 多日活動：起訖不同天、連結
insert into public.place_saves (place_id, note, event_starts_on, event_ends_on, event_url)
values ((select id from public.places where google_place_id = 'gp-event'), '書展', '2026-12-12', '2026-12-14', 'https://example.com/event');
do $$
declare pid uuid := (select id from public.places where google_place_id = 'gp-event');
begin
  assert (select event_starts_on from public.my_places('want') where id = pid) = '2026-12-12'::date, 'range start in my_places';
  assert (select event_ends_on from public.my_places('want') where id = pid) = '2026-12-14'::date, 'range end in my_places';
  assert (select event_url from public.my_places('want') where id = pid) = 'https://example.com/event', 'url in my_places';
  assert (public.place_detail(pid)->>'my_event_ends_on') = '2026-12-14', 'range end in place_detail';
  assert (public.place_detail(pid)->>'my_event_url') = 'https://example.com/event', 'url in place_detail';
  assert (select x->>'event_url' from jsonb_array_elements(public.my_diary_day()->'items') x where x->>'type' = 'want_place') = 'https://example.com/event', 'url in diary day';
  assert (select x->>'event_ends_on' from jsonb_array_elements(public.my_diary_day()->'items') x where x->>'type' = 'want_place') = '2026-12-14', 'range end in diary day';
end $$;

-- 別的使用者看不到我的活動連結（只有人數）
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
do $$
declare pid uuid := (select id from public.places where google_place_id = 'gp-event');
begin
  assert (public.place_detail(pid)->>'save_count')::int = 1, 'save count visible';
  assert public.place_detail(pid)->>'my_event_url' is null, 'other user has no event url';
  assert (select count(*) from public.my_places('want')) = 0, 'other user want list empty';
end $$;

-- 結束早於開始、非 http 連結、只給一邊日期都要擋
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect_error($q$update public.place_saves set event_ends_on = '2026-12-01' where place_id = (select id from public.places where google_place_id = 'gp-event')$q$, 'end before start');
select pg_temp.expect_error($q$update public.place_saves set event_url = 'javascript:alert(1)' where place_id = (select id from public.places where google_place_id = 'gp-event')$q$, 'non-http url');
select pg_temp.expect_error($q$update public.place_saves set event_ends_on = null where place_id = (select id from public.places where google_place_id = 'gp-event')$q$, 'only one side of range');

select 'V1.5 WANT EVENT SMOKE TEST PASSED';
