-- v1.9：流程調整（AL1 新用戶三步、AL2 探索分頁、AL4 日記預設與 7 天內可編輯、AL6 月底排策展）

alter table public.profiles add column if not exists onboarding_dismissed_at timestamptz;
alter table public.profiles add column if not exists diary_public_default boolean; -- null＝還沒問過

-- AL1 開始的三步：用現有資料算
create or replace function public.onboarding_progress()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'follows', (select count(*) from public.follows f where f.follower_id = auth.uid()),
    'saves', (select count(*) from public.book_saves b where b.user_id = auth.uid()),
    'entries', (select count(*) from public.diary_entries e where e.user_id = auth.uid()),
    'dismissed', (select p.onboarding_dismissed_at is not null from public.profiles p where p.id = auth.uid()))
$$;
create or replace function public.dismiss_onboarding()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set onboarding_dismissed_at = now() where id = auth.uid()
$$;

-- AL4 以後的日記預設公開／只有自己
create or replace function public.set_diary_public_default(p_public boolean)
returns void language sql security definer set search_path = '' as $$
  update public.profiles set diary_public_default = p_public where id = auth.uid()
$$;
create or replace function public.my_diary_public_default()
returns boolean language sql stable security definer set search_path = '' as $$
  select p.diary_public_default from public.profiles p where p.id = auth.uid()
$$;

-- AL2 探索：書旅、處方箋夠多才佔分頁
create or replace function public.explore_counts()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'trips', (select count(*) from public.trips t where t.status = 'published' and public.trip_visible(t)),
    'rx', (select count(*) from public.prescriptions p where p.closed_at is null and p.closes_at > now() and not public.is_blocked_with(p.user_id)))
$$;

-- AL4 日記 7 天內可以編輯（新增仍然只能記今天）
create or replace function public.guard_diary()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  only_unpublish boolean := tg_op = 'UPDATE'
    and old.is_public and not new.is_public
    and new.body is not distinct from old.body and new.photo_paths = old.photo_paths
    and new.place_id is not distinct from old.place_id and new.place_label is not distinct from old.place_label
    and new.book_id is not distinct from old.book_id and new.kind = old.kind and new.entry_date = old.entry_date;
begin
  new.updated_at := now();
  if only_unpublish then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.entry_date <> old.entry_date then
    raise exception 'cannot change the date' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and new.entry_date <> public.taipei_today() then
    raise exception 'diary can only be written for today' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.entry_date < public.taipei_today() - 7 then
    raise exception 'diary can only be edited within 7 days' using errcode = '23514';
  end if;
  if new.is_public then
    if new.place_id is not null and not exists (select 1 from public.places p where p.id = new.place_id and p.public_ok) then
      raise exception 'this place cannot be public' using errcode = '23514';
    end if;
    if public.content_violation(new.body) then
      raise exception 'content not allowed' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

-- AL6 月底：這個月讀的書（讀完的排前面）＋每本第一則心得；下個月有沒有策展
create or replace function public.month_wrap(p_period date default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with m as (select date_trunc('month', coalesce(p_period, public.current_period()))::date as d0),
  r as (
    select r.id, r.book_id, r.status, b.title, b.cover_url,
           (select n.body from public.reading_notes n where n.reading_id = r.id order by n.created_at limit 1) as first_note,
           (select count(*) from public.reading_notes n where n.reading_id = r.id
              and (n.created_at at time zone 'Asia/Taipei')::date >= (select d0 from m)
              and (n.created_at at time zone 'Asia/Taipei')::date < ((select d0 from m) + interval '1 month')::date) as notes_n,
           coalesce(r.finished_at, r.started_at) as d
    from public.readings r join public.books b on b.id = r.book_id
    where r.bookstore_id = public.my_bookstore_id()
      and (
        (r.started_at >= (select d0 from m) and r.started_at < ((select d0 from m) + interval '1 month')::date)
        or (r.finished_at >= (select d0 from m) and r.finished_at < ((select d0 from m) + interval '1 month')::date)
        or exists (select 1 from public.reading_notes n where n.reading_id = r.id
              and (n.created_at at time zone 'Asia/Taipei')::date >= (select d0 from m)
              and (n.created_at at time zone 'Asia/Taipei')::date < ((select d0 from m) + interval '1 month')::date))
  )
  select jsonb_build_object(
    'period', (select d0 from m),
    'next_period', ((select d0 from m) + interval '1 month')::date,
    'next_has_curation', exists (select 1 from public.curations c where c.bookstore_id = public.my_bookstore_id()
                                   and c.period = ((select d0 from m) + interval '1 month')::date),
    'notes', coalesce((select sum(notes_n) from r), 0),
    'books', coalesce((select jsonb_agg(jsonb_build_object('book_id', r.book_id, 'title', r.title, 'cover_url', r.cover_url,
                         'finished', r.status = 'finished', 'first_note', left(r.first_note, 200))
                       order by (r.status = 'finished') desc, r.d desc) from r), '[]'::jsonb))
$$;

grant execute on function public.onboarding_progress(), public.dismiss_onboarding(), public.set_diary_public_default(boolean),
  public.my_diary_public_default(), public.month_wrap(date) to authenticated;
grant execute on function public.explore_counts() to anon, authenticated;
