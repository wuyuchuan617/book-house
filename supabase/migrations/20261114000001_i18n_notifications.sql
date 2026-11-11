-- M9 英文介面：推播文字依收件人的語言（profiles.locale = 'en' 用英文，其他用繁體中文）
-- App 在登入後與切換語言時寫入 profiles.locale

create or replace function public.prefers_en(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select locale = 'en' from public.profiles where id = p_user), false)
$$;

create or replace function public.month_name_en(p_month int)
returns text language sql immutable set search_path = '' as $$
  select (array['January','February','March','April','May','June','July','August','September','October','November','December'])[p_month]
$$;

-- 追蹤的書店發布新策展 → 通知追蹤者
create or replace function public.notify_new_curation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  s public.bookstores;
  m int;
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    select * into s from public.bookstores where id = new.bookstore_id;
    m := extract(month from new.period)::int;
    insert into public.notification_outbox (user_id, kind, title, body, data)
    select f.follower_id, 'new_curation',
           case when public.prefers_en(f.follower_id)
                then format('“%s” published its %s curation', s.name, public.month_name_en(m))
                else format('「%s」上架了 %s 月策展', s.name, m) end,
           coalesce(new.title, ''),
           jsonb_build_object('url', '/store/' || s.slug)
    from public.follows f
    join public.notification_prefs np on np.user_id = f.follower_id
    where f.bookstore_id = new.bookstore_id
      and np.push and np.new_curation_from_followed
      and not exists (select 1 from public.blocks b
                      where (b.blocker_id = f.follower_id and b.blocked_id = s.owner_id)
                         or (b.blocker_id = s.owner_id and b.blocked_id = f.follower_id));
  end if;
  return new;
end $$;

-- 有人追蹤我的書店 → 通知店主
create or replace function public.notify_new_follower()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  s public.bookstores;
  who text;
  en boolean;
begin
  select * into s from public.bookstores where id = new.bookstore_id;
  select display_name into who from public.profiles where id = new.follower_id;
  en := public.prefers_en(s.owner_id);
  insert into public.notification_outbox (user_id, kind, title, body, data)
  select s.owner_id, 'new_follower',
         case when en then 'New follower' else '有新的追蹤者' end,
         case when en then format('%s started following “%s”', coalesce(who, 'Someone'), s.name)
              else format('%s 開始追蹤「%s」', coalesce(who, '有人'), s.name) end,
         jsonb_build_object('url', '/my-store')
  from public.notification_prefs np
  where np.user_id = s.owner_id and np.push and np.new_follower;
  return new;
end $$;

-- 每月策展提醒
create or replace function public.enqueue_monthly_reminders(p_today date default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  today date := coalesce(p_today, (now() at time zone 'Asia/Taipei')::date);
  last_day int := extract(day from (date_trunc('month', today) + interval '1 month - 1 day'))::int;
  nm int := extract(month from public.next_period())::int;
  n int;
begin
  with ins as (
    insert into public.notification_outbox (user_id, kind, title, body, data)
    select s.owner_id, 'monthly_reminder',
           case when public.prefers_en(s.owner_id) then format('Ready for your %s curation?', public.month_name_en(nm))
                else format('準備 %s 月策展了嗎？', nm) end,
           case when public.prefers_en(s.owner_id) then 'Pick a theme and add a book — it goes live on the 1st.'
                else '挑一個主題、放上一本書，月初就會自動上架。' end,
           jsonb_build_object('url', '/my-store')
    from public.bookstores s
    join public.notification_prefs np on np.user_id = s.owner_id
    where s.status = 'active' and np.push and np.monthly_reminder
      and (np.reminder_day = extract(day from today)::int
           or (np.reminder_day = -3 and extract(day from today)::int = last_day - 3))
      and not exists (select 1 from public.curations c
                      where c.bookstore_id = s.id and c.period = public.next_period()
                        and c.status in ('published', 'scheduled'))
    returning 1
  ) select count(*) into n from ins;
  return n;
end $$;

-- 開店 24 小時還沒發布 → 提醒一次
create or replace function public.enqueue_onboarding_nudges()
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  with ins as (
    insert into public.notification_outbox (user_id, kind, title, body, data)
    select s.owner_id, 'onboarding',
           case when public.prefers_en(s.owner_id) then format('“%s” is one step from opening', s.name)
                else format('「%s」還差一步就開張', s.name) end,
           case when public.prefers_en(s.owner_id) then 'Add a book and publish so readers can find you in Explore. Your draft is still there.'
                else '放上一本書、按發布，讀者就能在探索頁看到你。草稿都還在。' end,
           jsonb_build_object('url', '/my-store')
    from public.bookstores s
    join public.notification_prefs np on np.user_id = s.owner_id
    where s.status = 'active' and np.push
      and s.created_at between now() - interval '72 hours' and now() - interval '24 hours'
      and not exists (select 1 from public.curations c where c.bookstore_id = s.id and c.status <> 'draft')
      and not exists (select 1 from public.notification_outbox o where o.user_id = s.owner_id and o.kind = 'onboarding')
    returning 1
  ) select count(*) into n from ins;
  return n;
end $$;

-- 新檢舉 → 通知管理員（3 人檢舉自動暫停）
create or replace function public.on_report_created()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  s public.bookstores;
  n int;
begin
  if new.target_type <> 'bookstore' then
    return new;
  end if;
  select * into s from public.bookstores where id = new.target_id;
  select count(distinct reporter_id) into n from public.reports
   where target_type = 'bookstore' and target_id = new.target_id and status in ('open', 'reviewing');
  if s.id is not null and n >= 3 and s.status = 'active' then
    update public.bookstores set status = 'paused' where id = s.id;
  end if;
  insert into public.notification_outbox (user_id, kind, title, body, data)
  select a.user_id, 'moderation',
         case when public.prefers_en(a.user_id) then
                case when n >= 3 then format('“%s” was reported by %s people and auto-paused', coalesce(s.name, '?'), n)
                     else format('New report: “%s”', coalesce(s.name, '?')) end
              else
                case when n >= 3 then format('「%s」已被 %s 人檢舉，已自動暫停', coalesce(s.name, '?'), n)
                     else format('新檢舉：「%s」', coalesce(s.name, '?')) end
         end,
         coalesce(nullif(new.detail, ''), new.reason::text),
         jsonb_build_object('url', '/admin')
  from public.app_admins a;
  return new;
end $$;

create or replace function public.on_feedback_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notification_outbox (user_id, kind, title, body, data)
  select a.user_id, 'feedback',
         case when public.prefers_en(a.user_id) then 'New feedback' else '新的意見回饋' end,
         left(new.body, 120), jsonb_build_object('url', '/admin')
  from public.app_admins a;
  return new;
end $$;

revoke execute on function public.prefers_en(uuid), public.month_name_en(int) from public, anon, authenticated;
