-- M4 煙霧測試：店主閱讀 CRUD、編輯書店、刪除書店
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
grant execute on all functions in schema pg_temp to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000011', 'g@example.com', '{"full_name":"小G"}'),
  ('00000000-0000-0000-0000-000000000012', 'h@example.com', '{"full_name":"小H"}');

select pg_temp.as_user('00000000-0000-0000-0000-000000000011');
select pg_temp.expect_error($q$select public.add_reading(gen_random_uuid())$q$, 'add reading without store');
select id from public.create_bookstore('star room', '小G', 'mist');
insert into public.books (source, title, authors, created_by)
  values ('manual', '一個人的星空觀測手冊', array['陳奕安'], auth.uid()),
         ('manual', '大地之歌', array['吉米・哈利'], auth.uid());

-- R2：記錄一本書＋第一則心得；同一本不重複
create temp table t_r as select * from public.add_reading((select id from public.books where title = '一個人的星空觀測手冊'), 'reading', null, '第 7 章的星圖，週末去陽明山試試。');
reset role;
grant select on t_r to anon, authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000000011');
do $$ begin
  assert (select is_public from t_r), 'defaults to store reading_public_default';
  assert (select count(*) from public.reading_notes where reading_id = (select id from t_r)) = 1;
  assert (select id from public.add_reading((select book_id from t_r))) = (select id from t_r), 'no duplicate reading';
end $$;

-- 書店預設改私人 → 新紀錄私人
update public.bookstores set reading_public_default = false;
select public.add_reading((select id from public.books where title = '大地之歌'), 'finished');
do $$ begin
  assert not (select is_public from public.readings where book_id = (select id from public.books where title = '大地之歌'));
  assert (select finished_at from public.readings where book_id = (select id from public.books where title = '大地之歌')) is not null, 'finished_at set';
end $$;

-- R5：標記讀完、改回在讀、心得增改刪
update public.readings set status = 'finished' where id = (select id from t_r);
do $$ begin assert (select finished_at from public.readings where id = (select id from t_r)) is not null; end $$;
update public.readings set status = 'reading' where id = (select id from t_r);
do $$ begin assert (select finished_at from public.readings where id = (select id from t_r)) is null; end $$;
insert into public.reading_notes (reading_id, body) select id, '原來城市光害可以用手機 App 先查。' from t_r;
update public.reading_notes set body = '改過的心得' where body like '原來%';
delete from public.reading_notes where body = '改過的心得';
select pg_temp.expect_error($q$insert into public.reading_notes (reading_id, body) select id, '' from t_r$q$, 'empty note');

-- M2 編輯書店：可改的欄位、不能改的欄位、保留字網址
update public.bookstores set name = '小G的星空', tagline = '喜歡看星星的人', slug = 'g-star-room', color = 'wisteria';
select pg_temp.expect_error($q$update public.bookstores set status = 'paused'$q$, 'owner cannot change status');
select pg_temp.expect_error($q$update public.bookstores set owner_id = '00000000-0000-0000-0000-000000000012'$q$, 'owner cannot transfer store');
select pg_temp.expect_error($q$update public.bookstores set slug = 'admin'$q$, 'reserved slug');

-- 別人不能動我的閱讀、看不到私人紀錄
select pg_temp.as_user('00000000-0000-0000-0000-000000000012');
do $$ begin
  assert (select count(*) from public.readings where bookstore_id = (select id from public.bookstores where slug = 'g-star-room')) = 1, 'other sees public only';
end $$;
update public.readings set is_public = false;  -- RLS：不會改到別人的
insert into public.follows (follower_id, bookstore_id) select auth.uid(), id from public.bookstores where slug = 'g-star-room';
select pg_temp.as_user('00000000-0000-0000-0000-000000000011');
do $$ begin
  assert (select count(*) from public.readings where is_public and bookstore_id = public.my_bookstore_id()) = 1, 'other could not update';
  assert (select curation_count from public.store_delete_impact()) = 0;
  assert (select reading_count from public.store_delete_impact()) = 2;
  assert (select follower_count from public.store_delete_impact()) = 1;
end $$;

-- M9 刪除書店：閱讀、心得、追蹤一起刪；網址釋出
delete from public.bookstores where owner_id = auth.uid();
do $$ begin
  assert (select count(*) from public.readings where book_id in (select id from public.books where created_by = auth.uid())) = 0;
  assert (select count(*) from public.reading_notes where reading_id = (select id from t_r)) = 0;
  assert (select available from public.is_slug_available('g-star-room')), 'slug released';
end $$;

reset role;
\echo 'ALL M4 SMOKE TESTS PASSED'
