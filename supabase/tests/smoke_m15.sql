-- v1.5 ① 煙霧測試：每個人都有書店、認領、公開設定
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
  ('00000000-0000-0000-0000-0000000000f1', 'auto1@example.com', '{"full_name":"自動一號讀者的名字很長很長很長很長"}'),
  ('00000000-0000-0000-0000-0000000000f2', 'auto2@example.com', '{"full_name":"Auto Two"}');

-- 登入就有書店；名字太長會截斷；不打開每月提醒
do $$
declare s public.bookstores;
begin
  select * into s from public.bookstores where owner_id = '00000000-0000-0000-0000-0000000000f1';
  assert found, 'auto store created on sign up';
  assert s.auto_created and not s.setup_done;
  assert char_length(s.name) <= 20 and s.name like '%的書店';
  assert s.slug::text ~ '^store-[a-z0-9]{6}$', 'chinese name → store- slug';
  assert (select slug::text from public.bookstores where owner_id = '00000000-0000-0000-0000-0000000000f2') = 'auto-two';
  assert not (select monthly_reminder from public.notification_prefs where user_id = s.owner_id), 'no monthly reminder for auto store';
  assert s.show_reading and s.show_post and s.show_rx and not s.show_want and not s.show_place, 'default show settings';
end $$;

-- ensure_my_bookstore：已經有就回傳同一間
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
do $$
begin
  assert (public.ensure_my_bookstore()).owner_id = auth.uid();
  assert (select count(*) from public.bookstores where owner_id = auth.uid()) = 1;
end $$;

-- G0：看過設定卡、改名字顏色
update public.bookstores set setup_done = true, name = '星空小店', color = 'clay' where owner_id = auth.uid();
do $$ begin assert (select setup_done and name = '星空小店' from public.bookstores where owner_id = auth.uid()); end $$;
select pg_temp.expect_error($q$update public.bookstores set auto_created = false where owner_id = auth.uid()$q$, 'auto_created not editable');

-- 公開設定：正在讀這類關掉 → 別人看不到公開的店主閱讀
insert into public.books (source, title, authors, created_by) values ('manual', '公開設定測試書', array['某人'], auth.uid());
select 1 from public.add_reading((select id from public.books where title = '公開設定測試書'), 'reading', true, null);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
do $$ begin
  assert (select count(*) from public.readings r join public.books b on b.id = r.book_id where b.title = '公開設定測試書') = 1, 'visible while show_reading on';
  assert (select show_reading from public.public_bookstores where name = '星空小店');
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
update public.bookstores set show_reading = false where owner_id = auth.uid();
do $$ begin
  assert (select count(*) from public.readings r join public.books b on b.id = r.book_id where b.title = '公開設定測試書') = 1, 'owner still sees own';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
do $$ begin
  assert (select count(*) from public.readings r join public.books b on b.id = r.book_id where b.title = '公開設定測試書') = 0, 'hidden when show_reading off';
  assert not public.store_shows((select id from public.public_bookstores where name = '星空小店'), 'reading');
end $$;

-- 走原本的開店流程 → 認領自動開的書店（不會多一間），打開每月提醒
select id from public.create_bookstore('Two Books', 'Two', 'mist');
do $$
declare s public.bookstores;
begin
  select * into s from public.bookstores where owner_id = auth.uid();
  assert (select count(*) from public.bookstores where owner_id = auth.uid()) = 1, 'claimed, not duplicated';
  assert s.name = 'Two Books' and s.slug::text = 'two-books' and not s.auto_created and s.setup_done;
  assert (select monthly_reminder from public.notification_prefs where user_id = auth.uid()), 'reminder on after claim';
end $$;
select pg_temp.expect_error($q$select public.create_bookstore('Again', 'x')$q$, 'claimed store cannot be created again');

-- 重設書店：刪掉後再進我的書店 → 自動再開一間
delete from public.bookstores where owner_id = auth.uid();
do $$ begin
  assert (public.ensure_my_bookstore()).auto_created, 'recreated after reset';
  assert (select count(*) from public.bookstores where owner_id = auth.uid()) = 1;
end $$;

-- 自動開的書店第一次發布策展 → 變成正式開店
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
create temp table t_c15 as select * from public.create_curation(public.current_period(), '第一檔');
insert into public.curation_items (curation_id, book_id, position)
  select (select id from t_c15), id, 0 from public.books where title = '公開設定測試書';
select 1 from public.publish_curation((select id from t_c15));
do $$ begin
  assert not (select auto_created from public.bookstores where owner_id = auth.uid()), 'first publish claims store';
  assert (select monthly_reminder from public.notification_prefs where user_id = auth.uid());
end $$;

reset role;
\echo 'V1.5 STORE FOR EVERYONE SMOKE TEST PASSED'
