-- v1.8 煙霧測試 ①：策展預告
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
  ('00000000-0000-0000-0000-0000000002a1', 'v18a@example.com', '{"full_name":"一八甲"}'),
  ('00000000-0000-0000-0000-0000000002a2', 'v18b@example.com', '{"full_name":"一八乙"}');

select pg_temp.as_user('00000000-0000-0000-0000-0000000002a1');
insert into public.books (source, title, authors, created_by) values ('manual', '預告一', array['甲'], auth.uid()), ('manual', '預告二', array['乙'], auth.uid());
create temp table t_now as select * from public.create_curation(public.current_period(), '本月');
create temp table t_next as select * from public.create_curation((public.current_period() + interval '1 month')::date, '下個月');
insert into public.curation_items (curation_id, book_id, position, note) select (select id from t_next), id, row_number() over (order by title) - 1, '推薦' from public.books where title like '預告%';

select pg_temp.expect_error($q$select public.set_teaser((select id from t_now), true)$q$, 'this month cannot tease');
select public.set_teaser((select id from t_next), true, '冬天看星星',
  array(select i.id from public.curation_items i join public.books b on b.id = i.book_id where i.curation_id = (select id from t_next) and b.title = '預告一'));

-- 別人看：只看到公開的那一本、沒有推薦理由；按提醒
select pg_temp.as_user('00000000-0000-0000-0000-0000000002a2');
do $$
declare j jsonb := public.store_teaser((select slug from public.bookstores where owner_id = '00000000-0000-0000-0000-0000000002a1'));
begin
  assert j is not null, 'teaser visible';
  assert j->>'text' = '冬天看星星';
  assert jsonb_array_length(j->'books') = 1 and (j->'hidden_count')::int = 1, 'one revealed, one hidden';
  assert not (j->'books'->0 ? 'note'), 'no note';
  assert jsonb_array_length(public.explore_teasers()) = 1, 'explore shows teaser';
end $$;
select public.teaser_remind((select id from t_next), true);
do $$ begin assert (public.store_teaser((select slug from public.bookstores where owner_id = '00000000-0000-0000-0000-0000000002a1'))->>'waiting')::int = 1; end $$;
select pg_temp.expect_error($q$select public.set_teaser((select id from t_next), false)$q$, 'only owner');

-- 上架：按提醒的人收到通知，預告關掉、提醒清掉
reset role;
select set_config('app.via_rpc', 'on', false);
update public.curations set status = 'published', published_at = now() where id = (select id from t_next);
select set_config('app.via_rpc', '', false);
do $$ begin
  assert exists (select 1 from public.notification_outbox where user_id = '00000000-0000-0000-0000-0000000002a2' and kind = 'teaser'), 'reminder sent';
  assert not (select teaser_on from public.curations where id = (select id from t_next)), 'teaser off';
  assert not exists (select 1 from public.curation_reminders where curation_id = (select id from t_next)), 'reminders cleared';
end $$;

reset role;
select 'PASSED smoke_m22';
