-- M9 煙霧測試：推播文字依收件人語言
\set QUIET on
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
  if p is null then execute 'set role anon'; else execute 'set role authenticated'; end if;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000091', 'o9@example.com', '{"full_name":"Owner Nine"}'),
  ('00000000-0000-0000-0000-000000000092', 'r9@example.com', '{"full_name":"Reader EN"}'),
  ('00000000-0000-0000-0000-000000000093', 'q9@example.com', '{"full_name":"讀者中"}');

-- 店主與讀者 EN 用英文（App 自己寫 profiles.locale）
select pg_temp.as_user('00000000-0000-0000-0000-000000000091');
update public.profiles set locale = 'en' where id = auth.uid();
select id from public.create_bookstore('i18n shop', 'Owner Nine', 'mist');
create temp table t_c as select * from public.create_curation(public.current_period(), 'Stars');
select pg_temp.as_user('00000000-0000-0000-0000-000000000092');
update public.profiles set locale = 'en' where id = auth.uid();
insert into public.follows (follower_id, bookstore_id) select auth.uid(), id from public.bookstores where name = 'i18n shop';
select pg_temp.as_user('00000000-0000-0000-0000-000000000093');
insert into public.follows (follower_id, bookstore_id) select auth.uid(), id from public.bookstores where name = 'i18n shop';
reset role;
grant select on t_c to anon, authenticated, service_role;

do $$ begin
  assert (select count(*) from public.notification_outbox where kind = 'new_follower' and user_id = '00000000-0000-0000-0000-000000000091' and title = 'New follower') = 2, 'owner gets English';
  assert exists (select 1 from public.notification_outbox where kind = 'new_follower' and body = '讀者中 started following “i18n shop”'), 'english body';
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-000000000091');
insert into public.books (source, title, authors, created_by) values ('manual', 'i18n book', array['A'], auth.uid());
select public.add_curation_item((select id from t_c), (select id from public.books where title = 'i18n book'));
select public.publish_curation((select id from t_c));
reset role;

do $$ begin
  assert (select title from public.notification_outbox where kind = 'new_curation' and user_id = '00000000-0000-0000-0000-000000000092')
         like '“i18n shop” published its % curation', 'english follower';
  assert (select title from public.notification_outbox where kind = 'new_curation' and user_id = '00000000-0000-0000-0000-000000000093')
         like '「i18n shop」上架了 % 月策展', 'chinese follower';
  -- 不能把語言設成其他值
  begin
    update public.profiles set locale = 'fr' where id = '00000000-0000-0000-0000-000000000093';
    raise exception 'FAIL: locale check';
  exception when check_violation then null;
  end;
end $$;

select 'M9 i18n smoke test PASSED';
