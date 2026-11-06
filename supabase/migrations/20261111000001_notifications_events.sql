-- M6：推播通知（待發送佇列＋觸發條件）、每月策展提醒、埋點事件

-- ---------------------------------------------------------------------------
-- 推播 token：登入後由 App 登記；同一支手機換帳號登入時改掛到新帳號
-- ---------------------------------------------------------------------------
create or replace function public.register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  insert into public.push_tokens (user_id, token, platform)
  values (auth.uid(), p_token, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end $$;

-- 登出時移除這支手機的 token
create or replace function public.unregister_push_token(p_token text)
returns void language sql security definer set search_path = '' as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- 待發送的通知（Edge Function push-dispatch 每分鐘取出送到 Expo Push）
-- ---------------------------------------------------------------------------
create table public.notification_outbox (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('new_curation', 'new_follower', 'monthly_reminder')),
  title      text not null,
  body       text not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  error      text
);
create index notification_outbox_pending_idx on public.notification_outbox (created_at) where sent_at is null;
alter table public.notification_outbox enable row level security;
-- 沒有 policy：只有 service role（Edge Function）讀寫

-- 追蹤的書店發布新策展（含預約到期上架）→ 通知追蹤者
create or replace function public.notify_new_curation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  s public.bookstores;
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    select * into s from public.bookstores where id = new.bookstore_id;
    insert into public.notification_outbox (user_id, kind, title, body, data)
    select f.follower_id, 'new_curation',
           format('「%s」上架了 %s 月策展', s.name, extract(month from new.period)::int),
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

create trigger curations_notify_published after update of status on public.curations
  for each row execute function public.notify_new_curation();

-- 有人追蹤我的書店 → 通知店主
create or replace function public.notify_new_follower()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  s public.bookstores;
  who text;
begin
  select * into s from public.bookstores where id = new.bookstore_id;
  select display_name into who from public.profiles where id = new.follower_id;
  insert into public.notification_outbox (user_id, kind, title, body, data)
  select s.owner_id, 'new_follower', '有新的追蹤者',
         format('%s 開始追蹤「%s」', coalesce(who, '有人'), s.name),
         jsonb_build_object('url', '/my-store')
  from public.notification_prefs np
  where np.user_id = s.owner_id and np.push and np.new_follower;
  return new;
end $$;

create trigger follows_notify after insert on public.follows
  for each row execute function public.notify_new_follower();

-- 每月策展提醒（設定 › 每月策展提醒：20 日、25 日、月底前 3 天）。下個月已發布／預約就不提醒
create or replace function public.enqueue_monthly_reminders(p_today date default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  today date := coalesce(p_today, (now() at time zone 'Asia/Taipei')::date);
  last_day int := extract(day from (date_trunc('month', today) + interval '1 month - 1 day'))::int;
  n int;
begin
  with ins as (
    insert into public.notification_outbox (user_id, kind, title, body, data)
    select s.owner_id, 'monthly_reminder',
           format('準備 %s 月策展了嗎？', extract(month from public.next_period())::int),
           '挑一個主題、放上一本書，月初就會自動上架。',
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

-- ---------------------------------------------------------------------------
-- 埋點事件（P2）：只能新增，不能讀；分析在 Supabase 後台或匯出
-- ---------------------------------------------------------------------------
create table public.events (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles (id) on delete set null,
  anon_id     text check (char_length(anon_id) <= 64),
  name        text not null check (name ~ '^[a-z][a-z0-9_]{1,48}$'),
  props       jsonb not null default '{}'::jsonb check (pg_column_size(props) < 4000),
  platform    text check (platform in ('ios', 'android', 'web')),
  app_version text check (char_length(app_version) <= 20),
  created_at  timestamptz not null default now()
);
create index events_name_time_idx on public.events (name, created_at desc);
alter table public.events enable row level security;
create policy events_insert on public.events for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
revoke select, update, delete on public.events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 權限與排程
-- ---------------------------------------------------------------------------
revoke execute on function public.register_push_token(text, text), public.unregister_push_token(text),
  public.notify_new_curation(), public.notify_new_follower(), public.enqueue_monthly_reminders(date)
  from public, anon, authenticated;
grant execute on function public.register_push_token(text, text), public.unregister_push_token(text) to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.enqueue_monthly_reminders(date) to service_role;
    grant select, update, delete on public.notification_outbox to service_role;
    grant select, delete on public.push_tokens to service_role;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- 每天 09:00（台北）排每月提醒
    perform cron.schedule('monthly-curation-reminders', '0 1 * * *', 'select public.enqueue_monthly_reminders()');
  end if;
end $$;
