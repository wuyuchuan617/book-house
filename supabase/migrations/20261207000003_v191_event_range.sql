-- v1.9.1：多天的活動（書展、展覽、連續幾天的市集）可以選開始～結束日期
-- 畫布 19. v1.8（AE1 新增活動、AE3 活動頁）
-- ends_at 本來就有；這裡補上：區間最長 92 天、同地點「日期重疊」才問是不是同一個、找活動的日期落在區間內也算。

-- 已經有的資料不檢查（not valid），之後新增、修改都要符合
alter table public.book_events drop constraint if exists events_span_max;
alter table public.book_events add constraint events_span_max
  check (ends_at is null or ends_at <= starts_at + interval '92 days') not valid;

-- 台北日期區間：[開始那天, 結束那天]
create or replace function public.event_days(e public.book_events)
returns daterange language sql stable set search_path = '' as $$
  select daterange((e.starts_at at time zone 'Asia/Taipei')::date, (greatest(coalesce(e.ends_at, e.starts_at), e.starts_at) at time zone 'Asia/Taipei')::date, '[]')
$$;
revoke execute on function public.event_days(public.book_events) from public, anon, authenticated;

create or replace function public.find_events(p_query text default null, p_place_id uuid default null, p_date date default null, p_url text default null, p_limit int default 10)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.event_json(e) order by e.starts_at), '[]'::jsonb)
  from (
    select e.* from public.book_events e
    left join public.places pl on pl.id = e.place_id
    where e.merged_into is null
      and coalesce(e.ends_at, e.starts_at) >= now() - interval '6 hours'
      and (
        (nullif(trim(p_query), '') is not null and (e.title ilike '%' || trim(p_query) || '%' or pl.name ilike '%' || trim(p_query) || '%'))
        or (p_place_id is not null and e.place_id = p_place_id and (p_date is null or public.event_days(e) @> p_date))
        or (nullif(trim(p_url), '') is not null and e.url = trim(p_url))
      )
    order by e.starts_at
    limit least(greatest(p_limit, 1), 20)
  ) e
$$;

create or replace function public.create_event(p_title text, p_type text, p_starts_at timestamptz, p_ends_at timestamptz default null,
  p_place_id uuid default null, p_online boolean default false, p_url text default null, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  dup uuid;
  new_id uuid;
  -- 結束早於開始交給 events_end_after_start 擋，這裡不能先在 daterange 出錯
  days daterange := daterange((p_starts_at at time zone 'Asia/Taipei')::date, (greatest(coalesce(p_ends_at, p_starts_at), p_starts_at) at time zone 'Asia/Taipei')::date, '[]');
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;
  -- 同一個連結＝同一個活動；同一個地點、日期有重疊，先問是不是這個
  select id into dup from public.book_events e
   where merged_into is null and coalesce(ends_at, starts_at) >= now() - interval '1 day'
     and ((nullif(trim(p_url), '') is not null and url = trim(p_url))
          or (not p_force and p_place_id is not null and place_id = p_place_id and public.event_days(e) && days))
   order by (url = trim(coalesce(p_url, ''))) desc nulls last
   limit 1;
  if dup is not null then
    return jsonb_build_object('duplicate', (select public.event_json(e) from public.book_events e where e.id = dup));
  end if;
  insert into public.book_events (title, event_type, starts_at, ends_at, place_id, online, url)
  values (p_title, coalesce(p_type, 'other'), p_starts_at, p_ends_at, p_place_id, coalesce(p_online, false), nullif(trim(p_url), ''))
  returning id into new_id;
  return jsonb_build_object('id', new_id);
end $$;
