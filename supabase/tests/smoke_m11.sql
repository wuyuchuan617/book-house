-- M11 煙霧測試：心得類型、標題、頁碼、圖片欄位
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
  ('00000000-0000-0000-0000-0000000000b1', 'o11@example.com', '{"full_name":"店主十一"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'r11@example.com', '{"full_name":"讀者十一"}');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select id from public.create_bookstore('notes shop', '店主十一', 'clay');
insert into public.books (source, title, authors, created_by) values ('manual', '心得之書', array['某人'], auth.uid());
select public.add_reading((select id from public.books where title = '心得之書'), 'reading', true, '舊的心得');
insert into public.reading_notes (reading_id, kind, title, body, page_ref, photo_paths, from_scan)
select id, 'quote', '金句', '星星的光要走幾百年才到這裡。', 'p.128', array['x/y/0.jpg'], true from public.readings where bookstore_id = public.my_bookstore_id();
insert into public.reading_notes (reading_id, kind, body) select id, 'thought', '想放進下個月策展' from public.readings where bookstore_id = public.my_bookstore_id();
select pg_temp.expect_error($q$insert into public.reading_notes (reading_id, kind, body, page_ref) select id, 'thought', 'x', 'p.1' from public.readings where bookstore_id = public.my_bookstore_id()$q$, 'page_ref only for quote');
select pg_temp.expect_error($q$insert into public.reading_notes (reading_id, kind, body) select id, 'question', 'x' from public.readings where bookstore_id = public.my_bookstore_id()$q$, 'unknown kind');
select pg_temp.expect_error($q$insert into public.reading_notes (reading_id, body, title) select id, 'x', '幹你娘' from public.readings where bookstore_id = public.my_bookstore_id()$q$, 'title filtered');
select pg_temp.expect_error($q$insert into public.reading_notes (reading_id, body, photo_paths) select id, 'x', array['a','b','c','d'] from public.readings where bookstore_id = public.my_bookstore_id()$q$, 'max 3 photos');

-- 舊心得自動是「心得」；讀者看得到新欄位
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
do $$ begin
  assert (select kind from public.reading_notes where body = '舊的心得') = 'reflection', 'default kind';
  assert (select page_ref from public.reading_notes where kind = 'quote') = 'p.128', 'reader sees quote';
  assert (select count(*) from public.reading_notes n join public.readings r on r.id = n.reading_id where r.bookstore_id = (select id from public.bookstores where name = 'notes shop')) = 3;
end $$;
-- 改成不公開 → 讀者看不到
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
update public.readings set is_public = false where bookstore_id = (select id from public.bookstores where name = 'notes shop');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
do $$ begin
  assert (select count(*) from public.reading_notes where body = '想放進下個月策展') = 0, 'private hidden';
end $$;
reset role;
select 'M11 NOTES SMOKE TEST PASSED';
