-- v1.8.4 煙霧測試：日記連結
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
  ('00000000-0000-0000-0000-0000000002f1', 'link1@example.com', '{"full_name":"連結店主"}'),
  ('00000000-0000-0000-0000-0000000002f2', 'link2@example.com', '{"full_name":"連結讀者"}');

select pg_temp.as_user('00000000-0000-0000-0000-0000000002f1');
insert into public.diary_entries (kind, body, is_public, link, link_title)
  values ('note', '聽了這集', true, 'https://www.youtube.com/watch?v=abc', '跟著小說去花蓮');
select pg_temp.expect_error($q$insert into public.diary_entries (kind, body, link) values ('note', 'x', 'javascript:alert(1)')$q$, 'link must be http(s)');
select pg_temp.expect_error($q$insert into public.diary_entries (kind, body, link_title) values ('note', 'x', '沒有連結的標題')$q$, 'title needs link');
do $$
declare it jsonb;
begin
  select x into it from jsonb_array_elements(public.my_diary_day(null)->'items') x where x->>'body' = '聽了這集';
  assert it->>'link' = 'https://www.youtube.com/watch?v=abc' and it->>'link_title' = '跟著小說去花蓮', 'diary day has link';
  assert exists (select 1 from jsonb_array_elements(public.store_journal(public.my_bookstore_id())) x where x->>'link' = 'https://www.youtube.com/watch?v=abc'), 'journal has link';
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000002f2');
do $$ begin
  assert exists (select 1 from jsonb_array_elements(public.explore_posts()) x where x->>'link_title' = '跟著小說去花蓮'), 'explore has link';
end $$;
insert into public.follows (follower_id, bookstore_id) values (auth.uid(), (select id from public.bookstores where owner_id = '00000000-0000-0000-0000-0000000002f1'));
do $$ begin
  assert exists (select 1 from jsonb_array_elements(public.following_feed()->'groups') g, jsonb_array_elements(g->'items') x where x->'data'->>'link' is not null), 'feed has link';
end $$;
reset role;
select 'PASSED smoke_m27';
