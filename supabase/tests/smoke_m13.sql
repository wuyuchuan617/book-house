-- M12 煙霧測試：本週回顧、一句話與下週想讀、推播排程
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
  ('00000000-0000-0000-0000-0000000000d1', 'w1@example.com', '{"full_name":"週一"}'),
  ('00000000-0000-0000-0000-0000000000d2', 'w2@example.com', '{"full_name":"週二"}');
update public.profiles set created_at = now() - interval '60 days' where id = '00000000-0000-0000-0000-0000000000d1';

select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select 1 from public.create_bookstore('week shop', '週一', 'moss');
insert into public.books (source, title, authors, created_by) values
  ('manual', '週回顧測試書甲', array['某人'], auth.uid()), ('manual', '週回顧測試書乙', array['某人'], auth.uid());
select 1 from public.add_reading((select id from public.books where title = '週回顧測試書甲'), 'reading', true, null);
insert into public.book_saves (user_id, book_id) values (auth.uid(), (select id from public.books where title = '週回顧測試書乙'));

-- 上週的紀錄（直接插入，模擬過去）
reset role;
alter table public.diary_entries disable trigger diary_entries_guard;
insert into public.diary_entries (user_id, kind, body, entry_date, book_id, photo_paths) values
  ('00000000-0000-0000-0000-0000000000d1', 'note', '上週一', public.week_start_of(public.taipei_today() - 7), (select id from public.books where title = '週回顧測試書甲'), array['u/e/1.jpg']),
  ('00000000-0000-0000-0000-0000000000d1', 'note', '上週三', public.week_start_of(public.taipei_today() - 7) + 2, null, '{}');
insert into public.diary_entries (user_id, kind, place_label, entry_date) values
  ('00000000-0000-0000-0000-0000000000d1', 'checkin', '家裡陽台', public.week_start_of(public.taipei_today() - 7) + 3);
alter table public.diary_entries enable trigger diary_entries_guard;
insert into public.reading_notes (reading_id, kind, body, created_at)
select r.id, 'quote', '上週的摘句', (public.week_start_of(public.taipei_today() - 7) + 2)::timestamp at time zone 'Asia/Taipei' + interval '10 hours'
from public.readings r join public.books b on b.id = r.book_id where b.title = '週回顧測試書甲';

select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
do $$
declare j jsonb := public.my_week_review();
begin
  assert (j->>'week_start')::date = public.week_start_of(public.taipei_today() - 7), 'default last week';
  assert jsonb_array_length(j->'days') = 7;
  assert (j->'counts'->>'active_days')::int = 3, 'active days 3: ' || (j->'counts');
  assert (j->'counts'->>'notes')::int = 2 and (j->'counts'->>'checkins')::int = 1 and (j->'counts'->>'reading_notes')::int = 1;
  assert jsonb_array_length(j->'books') = 1 and (j->'books'->0->>'count')::int = 2, 'books: ' || (j->'books');
  assert jsonb_array_length(j->'quotes') = 1 and j->'quotes'->0->>'body' = '上週的摘句';
  assert jsonb_array_length(j->'photos') = 1 and j->'photos'->0->>'bucket' = 'diary';
  assert jsonb_array_length(j->'places') = 1 and j->'places'->0->>'name' = '家裡陽台';
  assert j->'store' is not null and j->'store' <> 'null'::jsonb;
  assert (j->'reflection'->>'editable')::boolean;
  assert j->'suggestion'->>'title' = '週回顧測試書乙';
end $$;

-- 一句話與下週想讀；兩週前的不能改；未來的週不能寫
insert into public.weekly_reflections (week_start, body, next_book_ids)
values (public.week_start_of(public.taipei_today() - 7), '這週讀得很開心', array[(select id from public.books where title = '週回顧測試書乙')]);
update public.weekly_reflections set body = '改一下' where week_start = public.week_start_of(public.taipei_today() - 7);
select pg_temp.expect_error($q$insert into public.weekly_reflections (week_start, body) values (public.week_start_of(public.taipei_today() - 14), '太久了')$q$, 'too old');
select pg_temp.expect_error($q$insert into public.weekly_reflections (week_start, body) values (public.week_start_of(public.taipei_today()) + 7, '未來')$q$, 'future week');
select pg_temp.expect_error($q$insert into public.weekly_reflections (week_start, body) values (public.week_start_of(public.taipei_today()) + 1, '不是週一')$q$, 'not monday');
select public.mark_week_opened(public.taipei_today() - 7);
select public.mark_week_opened(public.week_start_of(public.taipei_today() - 14));  -- 只記打開時間，過期也可以
do $$
declare j jsonb := public.my_week_review();
begin
  assert j->'reflection'->>'body' = '改一下';
  assert jsonb_array_length(j->'reflection'->'next_books') = 1;
  assert j->'reflection'->>'opened_at' is not null;
  -- 這週回顧會問「上週想讀的書，讀了嗎？」
  assert jsonb_array_length(public.my_week_review(public.taipei_today())->'last_week_next') = 1;
  assert not (public.my_week_review(public.taipei_today())->'last_week_next'->0->>'read')::boolean;
  assert (select count(*) from public.my_week_list(4)) = 4, 'week list 4';
  assert (select active_days from public.my_week_list(4) where week_start = public.week_start_of(public.taipei_today() - 7)) = 3;
  assert (select has_reflection from public.my_week_list(4) where week_start = public.week_start_of(public.taipei_today() - 7));
end $$;

-- 別人看不到
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2');
do $$
begin
  assert (select count(*) from public.weekly_reflections) = 0;
  assert (public.my_week_review()->'counts'->>'active_days')::int = 0;
  assert coalesce((public.my_week_review()->'store'->>'visits')::int, 0) = 0, 'auto store has no visits';
end $$;
select pg_temp.as_user(null);
select pg_temp.expect_error($q$select public.my_week_review()$q$, 'anon cannot');

-- 推播：上週有紀錄、有推播 token 的人才推，只推一次
reset role;
insert into public.push_tokens (user_id, token, platform) values
  ('00000000-0000-0000-0000-0000000000d1', 'ExponentPushToken[w1]', 'ios'), ('00000000-0000-0000-0000-0000000000d2', 'ExponentPushToken[w2]', 'ios');
do $$
begin
  assert public.enqueue_weekly_reviews() = 1, 'one push';
  assert public.enqueue_weekly_reviews() = 0, 'no duplicate';
  assert (select body from public.notification_outbox where kind = 'weekly_review') like '%3 天%';
end $$;
insert into public.notification_prefs (user_id, weekly_review) values ('00000000-0000-0000-0000-0000000000d1', false)
  on conflict (user_id) do update set weekly_review = false;
delete from public.notification_outbox where kind = 'weekly_review';
do $$ begin assert public.enqueue_weekly_reviews() = 0, 'opted out'; end $$;

select 'M12 WEEKLY REVIEW SMOKE TEST PASSED';
