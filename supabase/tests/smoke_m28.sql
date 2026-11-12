-- v1.9 煙霧測試：新用戶三步、探索分頁數、日記 7 天內可編輯、月底排策展
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
  ('00000000-0000-0000-0000-000000000301', 'v19a@example.com', '{"full_name":"十九甲"}'),
  ('00000000-0000-0000-0000-000000000302', 'v19b@example.com', '{"full_name":"十九乙"}');

select pg_temp.as_user('00000000-0000-0000-0000-000000000301');
do $$
declare p jsonb := public.onboarding_progress();
begin
  assert (p->>'follows')::int = 0 and (p->>'saves')::int = 0 and (p->>'entries')::int = 0 and not (p->>'dismissed')::boolean, 'fresh progress';
  assert public.my_diary_public_default() is null, 'default not asked yet';
end $$;
insert into public.books (source, title, authors, created_by) values ('manual', '十九之書', array['某人'], auth.uid());
insert into public.diary_entries (kind, body) values ('note', '第一則');
insert into public.follows (follower_id, bookstore_id) values (auth.uid(), (select id from public.bookstores where owner_id = '00000000-0000-0000-0000-000000000302'));
insert into public.readings (bookstore_id, book_id) values (public.my_bookstore_id(), (select id from public.books where title = '十九之書'));
insert into public.reading_notes (reading_id, kind, body) values ((select id from public.readings where book_id = (select id from public.books where title = '十九之書')), 'thought', '這本的第一句心得');
select public.set_diary_public_default(false);
select public.dismiss_onboarding();
do $$
declare p jsonb := public.onboarding_progress(); w jsonb := public.month_wrap();
begin
  assert (p->>'follows')::int = 1 and (p->>'entries')::int = 1 and (p->>'dismissed')::boolean, 'progress counted';
  assert public.my_diary_public_default() = false, 'default saved';
  assert jsonb_array_length(w->'books') = 1 and w->'books'->0->>'first_note' = '這本的第一句心得', 'month wrap books';
  assert (w->>'notes')::int = 1 and not (w->>'next_has_curation')::boolean, 'month wrap notes';
  assert (public.explore_counts()->>'trips') is not null, 'explore counts';
end $$;

-- 日記：7 天內可以改，超過不行；新增還是只能今天
reset role;
alter table public.diary_entries disable trigger diary_entries_guard;
insert into public.diary_entries (user_id, kind, body, entry_date) values
  ('00000000-0000-0000-0000-000000000301', 'note', '三天前', public.taipei_today() - 3),
  ('00000000-0000-0000-0000-000000000301', 'note', '十天前', public.taipei_today() - 10);
alter table public.diary_entries enable trigger diary_entries_guard;
select pg_temp.as_user('00000000-0000-0000-0000-000000000301');
update public.diary_entries set body = '三天前（改過）' where body = '三天前';
do $$ begin assert exists (select 1 from public.diary_entries where body = '三天前（改過）'), 'edit within 7 days'; end $$;
select pg_temp.expect_error($q$update public.diary_entries set body = '改' where body = '十天前'$q$, 'edit after 7 days');
select pg_temp.expect_error($q$insert into public.diary_entries (kind, body, entry_date) values ('note', '補寫', public.taipei_today() - 1)$q$, 'insert only today');
reset role;
select 'PASSED smoke_m28';
