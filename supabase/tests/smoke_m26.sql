-- v1.8.3 煙霧測試：追蹤動態
\set QUIET on
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
  if p is null then execute 'set role anon'; else execute 'set role authenticated'; end if;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000002e1', 'feed1@example.com', '{"full_name":"動態店主"}'),
  ('00000000-0000-0000-0000-0000000002e2', 'feed2@example.com', '{"full_name":"動態讀者"}'),
  ('00000000-0000-0000-0000-0000000002e3', 'feed3@example.com', '{"full_name":"動態路人"}');

-- 店主：一則公開日記、一則私人日記、開始讀一本公開的書
select pg_temp.as_user('00000000-0000-0000-0000-0000000002e1');
insert into public.books (source, title, authors, created_by) values ('manual', '動態之書', array['某人'], auth.uid());
insert into public.diary_entries (kind, body, is_public) values ('note', '公開的一句', true);
insert into public.diary_entries (kind, body, is_public) values ('note', '私人的一句', false);
insert into public.readings (bookstore_id, book_id, is_public)
  values (public.my_bookstore_id(), (select id from public.books where title = '動態之書'), true);

-- 讀者：追蹤之前沒有動態、可以被推薦
select pg_temp.as_user('00000000-0000-0000-0000-0000000002e2');
do $$
declare st uuid := (select id from public.bookstores where owner_id = '00000000-0000-0000-0000-0000000002e1');
begin
  assert jsonb_array_length(public.following_feed()->'groups') = 0, 'no feed before follow';
  assert not public.feed_unread(), 'nothing unread before follow';
  assert exists (select 1 from jsonb_array_elements(public.suggest_stores(10)) x where (x->>'id')::uuid = st and x->>'reason' = 'post'), 'suggested by recent post';
end $$;
insert into public.follows (follower_id, bookstore_id)
  values (auth.uid(), (select id from public.bookstores where owner_id = '00000000-0000-0000-0000-0000000002e1'));
do $$
declare f jsonb := public.following_feed(); g jsonb;
begin
  assert jsonb_array_length(f->'groups') = 1, 'one group (same store, same day)';
  g := f->'groups'->0;
  assert g->'store'->>'name' is not null, 'store info';
  assert exists (select 1 from jsonb_array_elements(g->'items') x where x->>'kind' = 'post' and x->'data'->>'body' = '公開的一句'), 'public post in feed';
  assert not exists (select 1 from jsonb_array_elements(g->'items') x where x->'data'->>'body' = '私人的一句'), 'private post hidden';
  assert exists (select 1 from jsonb_array_elements(g->'items') x where x->>'kind' = 'reading_started' and x->'data'->'book'->>'title' = '動態之書'), 'reading started';
  assert f->>'seen_at' is null, 'never seen';
  assert public.feed_unread(), 'unread after follow';
  assert not exists (select 1 from jsonb_array_elements(public.suggest_stores(10)) x where x->>'name' = '動態店主'), 'followed store not suggested';
end $$;
select public.mark_feed_seen();
do $$ begin
  assert not public.feed_unread(), 'seen';
  assert public.following_feed()->>'seen_at' is not null, 'seen_at returned';
end $$;

-- 店主關掉手記：動態裡不再有手記
reset role;
update public.bookstores set show_post = false where owner_id = '00000000-0000-0000-0000-0000000002e1';
select pg_temp.as_user('00000000-0000-0000-0000-0000000002e2');
do $$ begin
  assert not exists (select 1 from jsonb_array_elements(public.following_feed()->'groups') g, jsonb_array_elements(g->'items') x where x->>'kind' = 'post'), 'hidden category not in feed';
end $$;

-- 路人沒追蹤：沒有動態
select pg_temp.as_user('00000000-0000-0000-0000-0000000002e3');
do $$ begin assert jsonb_array_length(public.following_feed()->'groups') = 0, 'stranger has no feed'; end $$;
reset role;
select 'PASSED smoke_m26';
