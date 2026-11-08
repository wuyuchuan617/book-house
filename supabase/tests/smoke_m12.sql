-- M10 煙霧測試：閱讀日記、打卡、公開打卡、書的地方、連續天數
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
  ('00000000-0000-0000-0000-0000000000c1', 'd1@example.com', '{"full_name":"日記一"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'd2@example.com', '{"full_name":"日記二"}');
-- 地點（正式環境由 Edge Function 用 service role 寫入）
insert into public.places (google_place_id, name, address, lat, lng, category, public_ok, types) values
  ('gp-eslite', '青鳥書店 · 華山', '台北市中正區八德路一段 1 號', 25.044, 121.529, 'bookstore', true, array['book_store', 'establishment']),
  ('gp-home', '某某路 3 號', '台北市某某路 3 號', 25.05, 121.53, 'other', false, array['street_address']);

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select id from public.create_bookstore('diary shop', '日記一', 'moss');
insert into public.books (source, title, authors, created_by) values ('manual', '日記之書', array['某人'], auth.uid());
-- 筆記、私人打卡（自己打的名稱）、公開打卡
insert into public.diary_entries (kind, body, book_id) values ('note', '讀了 20 頁', (select id from public.books where title = '日記之書'));
insert into public.diary_entries (kind, place_label, body) values ('checkin', '家裡沙發', '睡前讀');
insert into public.diary_entries (kind, place_id, body, photo_paths, is_public, book_id)
values ('checkin', (select id from public.places where google_place_id = 'gp-eslite'), '窗邊位子', array['x/y/0.jpg'], true, (select id from public.books where title = '日記之書'));
select pg_temp.expect_error($q$insert into public.diary_entries (kind, body, entry_date) values ('note', '補記', public.taipei_today() - 1)$q$, 'only today');
select pg_temp.expect_error($q$insert into public.diary_entries (kind, place_id, is_public) values ('checkin', (select id from public.places where google_place_id = 'gp-home'), true)$q$, 'residential cannot be public');
select pg_temp.expect_error($q$insert into public.diary_entries (kind, place_label, is_public) values ('checkin', '家裡', true)$q$, 'typed label cannot be public');
select pg_temp.expect_error($q$insert into public.diary_entries (kind) values ('note')$q$, 'note needs content');
select pg_temp.expect_error($q$insert into public.diary_entries (kind, place_id, is_public, body) values ('checkin', (select id from public.places where google_place_id = 'gp-eslite'), true, '幹你娘')$q$, 'public filtered');
-- 心得也算當天
select public.add_reading((select id from public.books where title = '日記之書'), 'reading', true, '今天的心得');

do $$
declare j jsonb := public.my_diary_day();
begin
  assert (j->>'is_today')::boolean;
  assert jsonb_array_length(j->'items') >= 5, 'note+2 checkins+reading_note+started: ' || jsonb_array_length(j->'items');
  assert (select current_streak from public.my_diary_streak()) = 1, 'streak 1';
  assert (select today_done from public.my_diary_streak());
  assert (select count(*) from public.my_recent_places()) = 2;
end $$;

-- 過去的日子：直接插入（模擬昨天、前天）→ 連續 3 天；過去的不能改、只能關掉公開與刪除
reset role;
alter table public.diary_entries disable trigger diary_entries_guard;
insert into public.diary_entries (user_id, kind, body, entry_date) values
  ('00000000-0000-0000-0000-0000000000c1', 'note', '昨天', public.taipei_today() - 1),
  ('00000000-0000-0000-0000-0000000000c1', 'note', '前天', public.taipei_today() - 2),
  ('00000000-0000-0000-0000-0000000000c1', 'note', '五天前', public.taipei_today() - 5);
insert into public.diary_entries (user_id, kind, place_id, is_public, entry_date) values
  ('00000000-0000-0000-0000-0000000000c1', 'checkin', (select id from public.places where google_place_id = 'gp-eslite'), true, public.taipei_today() - 1);
alter table public.diary_entries enable trigger diary_entries_guard;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
do $$ begin
  assert (select current_streak from public.my_diary_streak()) = 3, 'streak 3';
  assert (select longest_streak from public.my_diary_streak()) = 3;
end $$;
select pg_temp.expect_error($q$update public.diary_entries set body = '改過去' where body = '昨天'$q$, 'past is read-only');
update public.diary_entries set is_public = false where entry_date = public.taipei_today() - 1 and kind = 'checkin';
delete from public.diary_entries where body = '五天前';

-- 別人：看不到私人日記，看得到公開打卡（沒有時間）；可以收藏地方
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2');
do $$
declare pid uuid := (select id from public.places where google_place_id = 'gp-eslite');
begin
  assert (select count(*) from public.diary_entries) = 0, 'diary private';
  assert (select count(*) from public.public_checkins) = 1, 'one public checkin (other was unpublished)';
  assert (select author_name from public.public_checkins limit 1) = 'diary shop';
  assert (select (public.place_detail(pid)->>'checkin_count')::int) = 1;
  assert (select count(*) from public.explore_places('near', null, 25.04, 121.52)) = 1;
  assert (select distance_m from public.explore_places('near', null, 25.044, 121.529)) < 5;
end $$;
insert into public.place_saves (place_id) select id from public.places where google_place_id = 'gp-eslite';
do $$ begin
  assert (select count(*) from public.my_saved_places()) = 1;
  assert (select saved from public.explore_places() limit 1);
end $$;
select public.report_checkin((select id from public.public_checkins limit 1), 'spam');
-- 封鎖後互相看不到公開打卡
select public.block_bookstore((select id from public.bookstores where name = 'diary shop'));
do $$ begin
  assert (select count(*) from public.public_checkins) = 0, 'blocked hidden';
end $$;
-- 訪客看得到地方頁
select pg_temp.as_user(null);
do $$ begin
  assert (select count(*) from public.explore_places()) = 1;
end $$;
reset role;
select 'M10 DIARY SMOKE TEST PASSED';
