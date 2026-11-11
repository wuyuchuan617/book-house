-- v1.2：店主自選上架日期（3 個月內）、新增策展接在最後一個月之後、每檔策展的拜訪與收藏數
--
-- 規則
-- • 策展月份：本月起算 4 個月內（本月＋之後 3 個月）。每間書店每月仍只有一檔發布中／預約中
-- • 上架日期：必須在該策展的月份裡、而且是今天或之後；台北時間早上 9 點上架（今天就直接上架）
-- • 預約的策展由 promote_scheduled_curations（每小時 :05）在 scheduled_for 到了之後上架

create or replace function public.last_open_period()
returns date language sql stable as $$
  select (public.current_period() + interval '3 months')::date
$$;

create or replace function public.period_in_window(p date)
returns boolean language sql stable as $$
  select p between public.current_period() and public.last_open_period()
$$;

-- 「新增策展」的預設月份：最後一檔（本月以後）的下一個月；都沒有就本月（本月已發布就下個月）
create or replace function public.suggest_new_period()
returns date language sql stable security definer set search_path = '' as $$
  with mine as (
    select period, status from public.curations
    where bookstore_id = public.my_bookstore_id() and period >= public.current_period()
  )
  select case
    when not exists (select 1 from mine) then public.current_period()
    else (select (max(period) + interval '1 month')::date from mine)
  end
$$;

-- C1：建立草稿（4 個月內）。同月已有草稿就回傳那份
create or replace function public.create_curation(p_period date, p_title text default null, p_description text default null)
returns public.curations
language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid := public.my_bookstore_id();
  v_period date := date_trunc('month', p_period)::date;
  c public.curations;
begin
  if v_store is null then
    raise exception 'open a bookstore first' using errcode = 'P0002';
  end if;
  if not public.period_in_window(v_period) then
    raise exception 'only within the next 3 months' using errcode = '23514';
  end if;
  select * into c from public.curations
   where bookstore_id = v_store and period = v_period and status = 'draft'
   order by updated_at desc limit 1;
  if found then
    return c;
  end if;
  insert into public.curations (bookstore_id, period, title, description)
  values (v_store, v_period, nullif(trim(p_title), ''), nullif(trim(p_description), ''))
  returning * into c;
  return c;
end $$;

-- 發布／預約。p_publish_on：上架日期（null = 本月就立刻上架、未來月份就是該月 1 號）
drop function if exists public.publish_curation(uuid);
create or replace function public.publish_curation(p_curation_id uuid, p_publish_on date default null)
returns public.curations
language plpgsql security definer set search_path = '' as $$
declare
  c public.curations;
  today date := (now() at time zone 'Asia/Taipei')::date;
  v_on date;
begin
  select * into c from public.curations where id = p_curation_id for update;
  if not found or not public.is_curation_owner(p_curation_id) then
    raise exception 'curation not found' using errcode = 'P0002';
  end if;
  if c.status = 'published' then
    return c;
  end if;
  if c.title is null or char_length(trim(c.title)) = 0 then
    raise exception 'title is required to publish' using errcode = '23514';
  end if;
  if not exists (select 1 from public.curation_items where curation_id = c.id) then
    raise exception 'add at least 1 book to publish' using errcode = '23514';
  end if;
  if not public.period_in_window(c.period) then
    raise exception 'only within the next 3 months can be published' using errcode = '23514';
  end if;
  if exists (select 1 from public.curations
             where bookstore_id = c.bookstore_id and period = c.period
               and status in ('published', 'scheduled') and id <> c.id) then
    raise exception 'this month already has a published curation' using errcode = '23505';
  end if;

  v_on := coalesce(p_publish_on, greatest(c.period, today));
  if date_trunc('month', v_on)::date <> c.period then
    raise exception 'publish date must be in the curation month' using errcode = '23514';
  end if;
  if v_on < today then
    raise exception 'publish date is in the past' using errcode = '23514';
  end if;

  perform set_config('app.via_rpc', 'on', true);
  if v_on = today then
    update public.curations
       set status = 'published', published_at = now(), scheduled_for = null
     where id = c.id
    returning * into c;
  else
    update public.curations
       set status = 'scheduled', published_at = null,
           scheduled_for = ((v_on + time '09:00')::timestamp at time zone 'Asia/Taipei')
     where id = c.id
    returning * into c;
  end if;
  perform set_config('app.via_rpc', 'off', true);
  return c;
end $$;

-- 排程：到了 scheduled_for 就上架；條件不符合（沒書、沒標題）的改回草稿
create or replace function public.promote_scheduled_curations()
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  perform set_config('app.via_rpc', 'on', true);
  update public.curations c
     set status = 'draft', scheduled_for = null
   where c.status = 'scheduled' and coalesce(c.scheduled_for, c.period::timestamptz) <= now()
     and (c.title is null or not exists (select 1 from public.curation_items i where i.curation_id = c.id));
  with up as (
    update public.curations
       set status = 'published', published_at = now(), scheduled_for = null
     where status = 'scheduled' and coalesce(scheduled_for, period::timestamptz) <= now()
    returning 1
  ) select count(*) into n from up;
  perform set_config('app.via_rpc', 'off', true);
  return n;
end $$;

-- C7 複製：預設放到「新增策展」的月份
create or replace function public.duplicate_curation(p_curation_id uuid, p_period date default null)
returns public.curations
language plpgsql security definer set search_path = '' as $$
declare
  src public.curations;
  v_period date := coalesce(date_trunc('month', p_period)::date, public.suggest_new_period());
  c public.curations;
begin
  select * into src from public.curations where id = p_curation_id;
  if not found or not public.is_curation_owner(p_curation_id) then
    raise exception 'curation not found' using errcode = 'P0002';
  end if;
  if not public.period_in_window(v_period) then
    raise exception 'only within the next 3 months' using errcode = '23514';
  end if;
  insert into public.curations (bookstore_id, period, title, description)
  values (src.bookstore_id, v_period, src.title, src.description)
  returning * into c;
  insert into public.curation_items (curation_id, book_id, note, position)
  select c.id, book_id, note, position from public.curation_items where curation_id = src.id;
  insert into public.curation_tags (curation_id, tag_id)
  select c.id, tag_id from public.curation_tags where curation_id = src.id;
  return c;
end $$;

-- 我的書店策展列表：加上拜訪數（同一人一天算一次）與預約上架時間
drop function if exists public.my_curations();
create or replace function public.my_curations()
returns table (id uuid, period date, title text, description text, status public.curation_status,
               published_at timestamptz, updated_at timestamptz, book_count int, save_count int,
               noted_count int, visit_count int, scheduled_for timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, c.period, c.title, c.description, c.status, c.published_at, c.updated_at,
         (select count(*)::int from public.curation_items i where i.curation_id = c.id),
         (select count(*)::int from public.book_saves s where s.from_curation_id = c.id),
         (select count(*)::int from public.curation_items i where i.curation_id = c.id and i.note is not null),
         (select count(*)::int from public.curation_visits v where v.curation_id = c.id),
         c.scheduled_for
  from public.curations c
  where c.bookstore_id = public.my_bookstore_id()
  order by c.period desc, c.updated_at desc
$$;

-- 單一策展的店主數據（編輯頁）
create or replace function public.curation_stats(p_curation_id uuid)
returns table (visit_count int, visitor_count int, save_count int)
language sql stable security definer set search_path = '' as $$
  select (select count(*)::int from public.curation_visits v where v.curation_id = c.id),
         (select count(distinct visitor_key)::int from public.curation_visits v where v.curation_id = c.id),
         (select count(*)::int from public.book_saves s where s.from_curation_id = c.id)
  from public.curations c
  where c.id = p_curation_id and public.is_curation_owner(p_curation_id)
$$;

revoke execute on function public.publish_curation(uuid, date), public.my_curations(), public.curation_stats(uuid),
  public.suggest_new_period(), public.duplicate_curation(uuid, date), public.create_curation(date, text, text),
  public.promote_scheduled_curations()
  from public, anon;
grant execute on function public.publish_curation(uuid, date), public.my_curations(), public.curation_stats(uuid),
  public.suggest_new_period(), public.duplicate_curation(uuid, date), public.create_curation(date, text, text)
  to authenticated;
grant execute on function public.last_open_period(), public.period_in_window(date) to anon, authenticated;
revoke execute on function public.promote_scheduled_curations() from authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.promote_scheduled_curations() to service_role;
  end if;
end $$;
