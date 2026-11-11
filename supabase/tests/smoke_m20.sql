-- v1.7 煙霧測試：購書／積讀、策展推薦理由必填、書的單頁出現在
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
  ('00000000-0000-0000-0000-0000000001e1', 'v17a@example.com', '{"full_name":"一七甲"}'),
  ('00000000-0000-0000-0000-0000000001e2', 'v17b@example.com', '{"full_name":"一七乙"}');
insert into public.places (google_place_id, name, category, public_ok, types) values ('gp-v17', '一七書店', 'bookstore', true, array['book_store']);

-- 1. 想讀 → 買了：從想讀移出、變積讀；地點頁有本數；開始讀 → reading；讀完 → done
select pg_temp.as_user('00000000-0000-0000-0000-0000000001e1');
insert into public.books (source, title, authors, created_by) values ('manual', '一七積讀', array['某人'], auth.uid()), ('manual', '一七直接讀', array['某人'], auth.uid());
insert into public.book_saves (user_id, book_id) select auth.uid(), id from public.books where title = '一七積讀';
select 1 from public.record_purchase((select id from public.books where title = '一七積讀'), null, (select id from public.places where google_place_id = 'gp-v17'), null, 380, 'paper', '店員推薦');
do $$ begin
  assert not exists (select 1 from public.book_saves where user_id = auth.uid()), 'moved out of want';
  assert (public.my_purchases()->>'unread')::int = 1;
  assert (public.my_purchases()->'items'->0->>'place_name') = '一七書店';
  assert public.place_purchase_count((select id from public.places where google_place_id = 'gp-v17')) = 1;
end $$;
select pg_temp.expect_error($q$select public.record_purchase((select id from public.books where title = '一七積讀'), null, null, null, -5)$q$, 'negative price');
insert into public.readings (bookstore_id, book_id) select public.my_bookstore_id(), id from public.books where title = '一七積讀';
do $$ begin assert (select status from public.book_purchases where user_id = auth.uid()) = 'reading', 'start reading syncs'; end $$;
update public.readings set status = 'finished', finished_at = current_date where bookstore_id = public.my_bookstore_id();
do $$ begin assert (select status from public.book_purchases where user_id = auth.uid()) = 'done', 'finish syncs'; end $$;
select 1 from public.record_purchase((select id from public.books where title = '一七直接讀'), null, null, '博客來', null, 'ebook', null, true);
do $$ begin
  assert (select status from public.book_purchases where user_id = auth.uid() and store_label = '博客來') = 'reading';
  assert exists (select 1 from public.readings r join public.books b on b.id = r.book_id where b.title = '一七直接讀'), 'started reading';
end $$;

-- 積讀公開：預設關；開了別人只看到書，看不到金額
insert into public.books (source, title, authors, created_by) values ('manual', '一七還沒讀', array['某人'], auth.uid());
select 1 from public.record_purchase((select id from public.books where title = '一七還沒讀'), null, null, '誠品', 450);
select pg_temp.as_user('00000000-0000-0000-0000-0000000001e2');
do $$
declare slug text := (select slug from public.bookstores where owner_id = '00000000-0000-0000-0000-0000000001e1');
begin
  assert jsonb_array_length(public.store_tbr(slug)) = 0, 'tbr hidden by default';
  assert not exists (select 1 from public.book_purchases), 'cannot read others purchases';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000001e1');
update public.bookstores set show_owned = true where owner_id = auth.uid();
select pg_temp.as_user('00000000-0000-0000-0000-0000000001e2');
do $$
declare
  slug text := (select slug from public.bookstores where owner_id = '00000000-0000-0000-0000-0000000001e1');
  j jsonb := public.store_tbr(slug);
begin
  assert jsonb_array_length(j) = 1, 'tbr shown';
  assert j->0->'price' is null, 'no price';
end $$;

-- 2. 策展：沒寫推薦理由不能發布；發布中不能清空
select pg_temp.as_user('00000000-0000-0000-0000-0000000001e1');
create temp table t_c20 as select * from public.create_curation(public.current_period(), '一七策展');
insert into public.curation_items (curation_id, book_id, position, note) select (select id from t_c20), id, 0, '很好看' from public.books where title = '一七積讀';
insert into public.curation_items (curation_id, book_id, position) select (select id from t_c20), id, 1 from public.books where title = '一七直接讀';
select pg_temp.expect_error($q$select public.publish_curation((select id from t_c20))$q$, 'missing note');
update public.curation_items set note = '也很好看' where curation_id = (select id from t_c20) and note is null;
select 1 from public.publish_curation((select id from t_c20));
select pg_temp.expect_error($q$update public.curation_items set note = null where curation_id = (select id from t_c20) and position = 0$q$, 'cannot clear note when live');

-- 3. 書的單頁：處方簽、貼文、我的狀態
do $$
declare j jsonb := public.book_mentions((select id from public.books where title = '一七還沒讀'));
begin
  assert (j->'mine'->'purchase'->>'status') = 'unread';
  assert not (j->'mine'->>'want')::boolean;
end $$;

reset role;
select 'PASSED smoke_m20';
