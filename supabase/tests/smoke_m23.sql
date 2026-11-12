-- v1.8 煙霧測試 ②：活動（共用一筆、大家分享）
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
  ('00000000-0000-0000-0000-0000000002b1', 'ev1@example.com', '{"full_name":"活動甲"}'),
  ('00000000-0000-0000-0000-0000000002b2', 'ev2@example.com', '{"full_name":"活動乙"}');
insert into public.places (google_place_id, name, category, public_ok, types) values
  ('gp-ev', '華山', 'museum', true, array['museum']), ('gp-ev-home', '某人的家', 'other', false, array['street_address']);

select pg_temp.as_user('00000000-0000-0000-0000-0000000002b1');
create temp table t_ev as select (public.create_event('冬日舊書市集', 'market', now() + interval '3 days', now() + interval '3 days 5 hours',
  (select id from public.places where google_place_id = 'gp-ev'), false, 'https://example.com/market'))->>'id' as id;
select public.share_event((select id::uuid from t_ev), '我會在中午到', true);
select pg_temp.expect_error($q$select public.create_event('家裡讀書會', 'club', now() + interval '1 day', null, (select id from public.places where google_place_id = 'gp-ev-home'))$q$, 'private place');
select pg_temp.expect_error($q$select public.create_event('過期', 'talk', now() - interval '3 days', null, null, true)$q$, 'already over');

-- 乙：同一個連結 → 回傳已有的；同地點同一天 → 問是不是這個；強制才新增
select pg_temp.as_user('00000000-0000-0000-0000-0000000002b2');
do $$
declare
  r jsonb := public.create_event('舊書市集', 'market', now() + interval '3 days', null, null, true, 'https://example.com/market');
  r2 jsonb := public.create_event('另一個名字', 'market', now() + interval '3 days', null, (select id from public.places where google_place_id = 'gp-ev'));
begin
  assert r ? 'duplicate' and r->'duplicate'->>'title' = '冬日舊書市集', 'same url is duplicate';
  assert r2 ? 'duplicate', 'same place same day asks';
  assert jsonb_array_length(public.find_events('舊書')) = 1, 'find by title';
end $$;
select public.share_event((select id::uuid from t_ev), '去年挖到整套魔戒', false);
update public.book_events set title = '改名' where id = (select id::uuid from t_ev);
do $$ begin assert (select title from public.book_events where id = (select id::uuid from t_ev)) = '冬日舊書市集', 'only creator edits'; end $$;
do $$
declare
  ex jsonb := public.explore_events();
  d jsonb := public.event_detail((select id::uuid from t_ev));
begin
  assert jsonb_array_length(ex) = 1, 'one card per event';
  assert (ex->0->>'share_count')::int = 2 and (ex->0->>'going_count')::int = 1;
  assert jsonb_array_length(d->'shares') = 2 and (d->>'i_shared')::boolean;
  assert jsonb_array_length(public.place_events((select id from public.places where google_place_id = 'gp-ev'))) = 1;
end $$;
-- 同一個人只分享一次（再分享是更新）
select public.share_event((select id::uuid from t_ev), '改一下', null);
do $$ begin assert (select count(*) from public.book_event_shares where event_id = (select id::uuid from t_ev)) = 2; end $$;
select public.event_go((select id::uuid from t_ev), true);

-- 提醒：活動改到明天，跑提醒
reset role;
update public.book_events set starts_at = (date_trunc('day', now() at time zone 'Asia/Taipei') + interval '1 day 14 hours') at time zone 'Asia/Taipei', ends_at = null where id = (select id::uuid from t_ev);
do $$ begin assert public.enqueue_event_reminders() = 2, 'two going'; end $$;

reset role;
select 'PASSED smoke_m23';
