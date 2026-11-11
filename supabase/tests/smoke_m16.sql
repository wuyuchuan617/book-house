-- v1.5 ② 煙霧測試：日記貼文（沒有地點也能公開）、想讀／想去連結與公開、店主手記
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
  ('00000000-0000-0000-0000-0000000001a1', 'post1@example.com', '{"full_name":"貼文一"}'),
  ('00000000-0000-0000-0000-0000000001a2', 'post2@example.com', '{"full_name":"貼文二"}');
insert into public.places (google_place_id, name, category, public_ok, types) values
  ('gp-post-pub', '公開書店', 'bookstore', true, array['book_store']),
  ('gp-post-home', '某人的家', 'other', false, array['premise']);

select pg_temp.as_user('00000000-0000-0000-0000-0000000001a1');
insert into public.books (source, title, authors, created_by) values ('manual', '手記測試書', array['某人'], auth.uid());

-- 沒有地點的日記可以公開；有公開場所也可以；私人地點、自己輸入的地點不行
insert into public.diary_entries (kind, body, is_public) values ('note', '今天在河堤讀書', true);
insert into public.diary_entries (kind, body, place_id, is_public) values ('checkin', '二樓很安靜', (select id from public.places where google_place_id = 'gp-post-pub'), true);
insert into public.diary_entries (kind, body, book_id, page_ref, is_public)
  values ('note', '讀到獵戶座', (select id from public.books where title = '手記測試書'), 'p.156', false);
select pg_temp.expect_error($q$insert into public.diary_entries (kind, body, place_id, is_public) values ('checkin', 'x', (select id from public.places where google_place_id = 'gp-post-home'), true)$q$, 'private place cannot be public');
select pg_temp.expect_error($q$insert into public.diary_entries (kind, body, place_label, is_public) values ('checkin', 'x', '家裡', true)$q$, 'typed place cannot be public');
do $$ begin
  assert (select x->>'page_ref' from jsonb_array_elements(public.my_diary_day()->'items') x where x->>'body' = '讀到獵戶座') = 'p.156';
end $$;

-- 想讀、想去：連結＋公開
insert into public.book_saves (user_id, book_id, note, link, is_public)
  values (auth.uid(), (select id from public.books where title = '手記測試書'), '朋友推薦', 'https://example.com/review', true);
select pg_temp.expect_error($q$update public.book_saves set link = 'javascript:alert(1)' where user_id = auth.uid()$q$, 'link must be http');
insert into public.place_saves (place_id, note, is_public) values ((select id from public.places where google_place_id = 'gp-post-pub'), '想再去', true);
insert into public.place_saves (place_id, note, is_public) values ((select id from public.places where google_place_id = 'gp-post-home'), '私人', true);

-- 店主自己看手記：全部都有（含只有自己的）
do $$
declare j jsonb := public.store_journal(public.my_bookstore_id());
begin
  assert jsonb_array_length(j) = 6, 'owner sees all 6 items, got ' || jsonb_array_length(j);
  assert (select count(*) from jsonb_array_elements(j) x where x->>'type' = 'post' and not (x->>'shown')::boolean) >= 1, 'private post marked not shown';
  assert (select (x->>'is_public')::boolean from jsonb_array_elements(j) x where x->'place'->>'name' = '某人的家' and x->>'type' = 'place') = false, 'private place never public';
end $$;

-- 別人看：預設 想讀關、想去關、貼文開 → 只看到 2 則公開貼文
select pg_temp.as_user('00000000-0000-0000-0000-0000000001a2');
do $$
declare j jsonb := public.store_journal((select id from public.bookstores where owner_id = '00000000-0000-0000-0000-0000000001a1'));
begin
  assert jsonb_array_length(j) = 2, 'reader sees 2 public posts, got ' || jsonb_array_length(j);
  assert (select count(*) from jsonb_array_elements(j) x where x->>'type' <> 'post') = 0;
  assert (select count(*) from jsonb_array_elements(j) x where x ? 'place_label' and x->>'place_label' is not null) = 0;
  assert (select count(*) from public.public_posts where user_id = '00000000-0000-0000-0000-0000000001a1') = 2;
  assert (select author_name from public.public_posts where body = '今天在河堤讀書') = '貼文一的書店';
  assert (select count(*) from public.book_saves where user_id = '00000000-0000-0000-0000-0000000001a1') = 0, 'saves stay private (RLS)';
end $$;

-- 店主打開想讀、想去 → 讀者多看到公開的想讀與公開場所的想去（私人地點不會）
select pg_temp.as_user('00000000-0000-0000-0000-0000000001a1');
update public.bookstores set show_want = true, show_place = true where owner_id = auth.uid();
select pg_temp.as_user('00000000-0000-0000-0000-0000000001a2');
do $$
declare j jsonb := public.store_journal((select id from public.bookstores where owner_id = '00000000-0000-0000-0000-0000000001a1'));
begin
  assert jsonb_array_length(j) = 4, 'reader sees 4, got ' || jsonb_array_length(j);
  assert (select count(*) from jsonb_array_elements(j) x where x->'place'->>'name' = '某人的家') = 0, 'private place hidden';
  assert not (select (x ? 'link') from jsonb_array_elements(j) x where x->>'type' = 'want'), 'link never exposed';
end $$;

-- 封鎖後看不到
insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), '00000000-0000-0000-0000-0000000001a1');
do $$ begin
  assert jsonb_array_length(public.store_journal((select id from public.bookstores where owner_id = '00000000-0000-0000-0000-0000000001a1'))) = 0, 'blocked';
  assert (select count(*) from public.public_posts where user_id = '00000000-0000-0000-0000-0000000001a1') = 0;
end $$;

reset role;
\echo 'V1.5 QUICK ADD SMOKE TEST PASSED'
