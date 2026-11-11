-- v1.6 煙霧測試：想讀預設公開、自訂處方簽標籤、書店處方簽分頁、追蹤名單、數據、通知列表、心得進探索貼文、搜尋
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
  ('00000000-0000-0000-0000-0000000001d1', 'v16a@example.com', '{"full_name":"一六甲"}'),
  ('00000000-0000-0000-0000-0000000001d2', 'v16b@example.com', '{"full_name":"一六乙"}');

-- 1. 想讀：不給 is_public 也會出現在書店頁（只看公開設定）
select pg_temp.as_user('00000000-0000-0000-0000-0000000001d1');
insert into public.books (source, title, authors, created_by) values ('manual', '一六想讀', array['某人'], auth.uid()), ('manual', '一六在讀', array['某人'], auth.uid());
insert into public.book_saves (user_id, book_id) select auth.uid(), id from public.books where title = '一六想讀';
do $$ begin assert (select is_public from public.book_saves where user_id = auth.uid()), 'want public by default'; end $$;

-- 2. 處方簽：自訂標籤（1–10 字、最多 3 個）；匿名的不會出現在書店頁
insert into public.prescriptions (title, tags) values ('想找一本讀完會想去看星星的書', array['通勤讀物', 'mood']);
insert into public.prescriptions (title, anonymous, tags) values ('匿名的那張', true, array['relationship']);
select pg_temp.expect_error($q$insert into public.prescriptions (title, tags) values ('x', array['a', 'b', 'c', 'd'])$q$, 'max 3 tags');
select pg_temp.expect_error($q$insert into public.prescriptions (title, tags) values ('x', array[' 空白'])$q$, 'tag trimmed');
update public.bookstores set show_rx = true where owner_id = auth.uid();
do $$
declare slug text := (select slug from public.bookstores where owner_id = auth.uid());
begin
  assert jsonb_array_length(public.store_rx(slug)) = 2, 'owner sees all own';
end $$;

-- 3. 公開的書：心得出現在探索貼文（標 note）；被日記貼文帶出的不重複
insert into public.readings (bookstore_id, book_id) select public.my_bookstore_id(), id from public.books where title = '一六在讀';
insert into public.reading_notes (reading_id, kind, title, body) select id, 'quote', '一句', '星星的光要走幾百年才到這裡。' from public.readings where bookstore_id = public.my_bookstore_id();
insert into public.reading_notes (reading_id, kind, body) select id, 'thought', '已經分享成貼文的心得' from public.readings where bookstore_id = public.my_bookstore_id();
insert into public.diary_entries (kind, body, is_public, reading_note_id, book_id)
  select 'note', '已經分享成貼文的心得', true, n.id, r.book_id from public.reading_notes n join public.readings r on r.id = n.reading_id where n.body = '已經分享成貼文的心得';

select pg_temp.as_user('00000000-0000-0000-0000-0000000001d2');
do $$
declare
  slug text := (select slug from public.bookstores where owner_id = '00000000-0000-0000-0000-0000000001d1');
  j jsonb := public.explore_posts('all');
begin
  assert jsonb_array_length(public.store_rx(slug)) = 1, 'reader sees non-anonymous only';
  assert (select count(*) from jsonb_array_elements(j) x where x->>'source' = 'note' and x->>'body' like '星星的光%') = 1, 'public note in posts';
  assert (select x->>'note_kind' from jsonb_array_elements(j) x where x->>'source' = 'note' and x->>'body' like '星星的光%') = 'quote';
  assert (select count(*) from jsonb_array_elements(j) x where x->>'body' = '已經分享成貼文的心得') = 1, 'no duplicate with diary post';
  assert jsonb_array_length(public.explore_posts('all', null, null, null, 30, '星星')) = 1, 'post search';
  assert jsonb_array_length(public.rx_search('通勤讀物')) = 1, 'rx search by custom tag';
  assert jsonb_array_length(public.rx_search('星星')) = 1, 'rx search by title';
end $$;

-- 書不公開 → 心得不出現
select pg_temp.as_user('00000000-0000-0000-0000-0000000001d1');
update public.readings set is_public = false where bookstore_id = public.my_bookstore_id();
select pg_temp.as_user('00000000-0000-0000-0000-0000000001d2');
do $$ begin
  assert (select count(*) from jsonb_array_elements(public.explore_posts('all')) x where x->>'source' = 'note' and x->>'body' like '星星的光%') = 0, 'private book hides notes';
end $$;

-- 4. 追蹤名單與數據：乙追蹤甲 → 甲的追蹤者有乙；乙的追蹤中有甲
insert into public.follows (follower_id, bookstore_id) select auth.uid(), id from public.bookstores where owner_id = '00000000-0000-0000-0000-0000000001d1';
do $$ begin
  assert (public.my_follow_list('following')->0->>'name') is not null, 'following list';
  assert (public.my_follow_list('following')->0->>'i_follow')::boolean, 'i follow';
  assert (public.my_store_insights()->>'following')::int = 1;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000001d1');
do $$ begin
  assert jsonb_array_length(public.my_follow_list('followers')) = 1, 'followers list';
  assert not (public.my_follow_list('followers')->0->>'i_follow')::boolean, 'not following back';
  assert (public.my_store_insights()->>'followers')::int = 1;
end $$;
select pg_temp.as_user(null);
select pg_temp.expect_error($q$select public.my_follow_list('followers')$q$, 'anon cannot list');

-- 5. 通知列表：被追蹤的通知留在列表；點了算已讀；看不到別人的
reset role;
insert into public.notification_outbox (user_id, kind, title, body) values
  ('00000000-0000-0000-0000-0000000001d1', 'new_follower', '有新的追蹤者', '一六乙的書店追蹤了你'),
  ('00000000-0000-0000-0000-0000000001d2', 'new_curation', '別人的', '不該看到');
select pg_temp.as_user('00000000-0000-0000-0000-0000000001d1');
do $$
declare j jsonb := public.my_notifications();
begin
  assert (j->>'unread')::int >= 1, 'unread';
  assert not exists (select 1 from jsonb_array_elements(j->'items') x where x->>'title' = '別人的'), 'only mine';
end $$;
select public.mark_notifications_read();
do $$ begin assert (public.my_notifications()->>'unread')::int = 0, 'all read'; end $$;
do $$
declare n int;
begin
  begin
    select count(*) into n from public.notification_outbox;
  exception when insufficient_privilege then n := 0;
  end;
  assert n = 0, 'no direct read (RLS)';
end $$;

reset role;
select 'PASSED smoke_m19';
