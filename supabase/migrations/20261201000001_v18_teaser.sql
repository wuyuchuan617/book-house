-- v1.8 ①：閱讀處方箋改字（提醒通知）＋ 策展預告
-- PRD 6.23；畫布 19. v1.8（AD1–AD3、AF1）

-- ---------------------------------------------------------------------------
-- 0. 通知種類：預告上架、活動提醒
-- ---------------------------------------------------------------------------
alter table public.notification_outbox drop constraint if exists notification_outbox_kind_check;
alter table public.notification_outbox add constraint notification_outbox_kind_check
  check (kind in ('new_curation', 'new_follower', 'monthly_reminder', 'moderation', 'feedback', 'onboarding', 'weekly_review', 'prescription', 'teaser', 'event'));

-- 處方箋快結案的提醒：改用正確的「處方箋」
create or replace function public.enqueue_rx_reminders()
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  with due as (
    update public.prescriptions p set reminded_at = now()
     where p.closed_at is null and p.reminded_at is null
       and p.closes_at between now() and now() + interval '3 days'
       and not exists (select 1 from public.prescription_replies r where r.prescription_id = p.id)
    returning p.*
  ), ins as (
    insert into public.notification_outbox (user_id, kind, title, body, data)
    select d.user_id, 'prescription', '處方箋快結案了', format('「%s」還沒有人開處方，分享給朋友看看？', left(d.title, 30)),
           jsonb_build_object('url', '/rx/' || d.id, 'rx', d.id, 'event', 'reminder')
    from due d join public.notification_prefs np on np.user_id = d.user_id and np.push and np.prescription
    returning 1
  ) select count(*) into n from ins;
  return n;
end $$;
revoke execute on function public.enqueue_rx_reminders() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. 欄位與表
--   teaser_on：開了預告；teaser_text：一句話；curation_items.teaser：先公開的書（最多 3 本）
--   curation_reminders：「上架提醒我」
-- ---------------------------------------------------------------------------
alter table public.curations
  add column if not exists teaser_on   boolean not null default false,
  add column if not exists teaser_text text check (char_length(teaser_text) <= 80);
alter table public.curation_items add column if not exists teaser boolean not null default false;

create table if not exists public.curation_reminders (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  curation_id uuid not null references public.curations (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, curation_id)
);
alter table public.curation_reminders enable row level security;
drop policy if exists reminders_own on public.curation_reminders;
create policy reminders_own on public.curation_reminders for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, delete on public.curation_reminders to authenticated;

-- ---------------------------------------------------------------------------
-- 2. 店主設定預告：只能預告下個月以後、還沒上架的；同一間書店同時只有一檔（開新的會關掉舊的）
-- ---------------------------------------------------------------------------
create or replace function public.set_teaser(p_curation_id uuid, p_on boolean, p_text text default null, p_item_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.curations;
begin
  select * into c from public.curations where id = p_curation_id;
  if c.id is null or not public.is_store_owner(c.bookstore_id) then raise exception 'not allowed'; end if;
  if p_on then
    if c.period <= public.current_period() or c.status = 'published' then raise exception 'teaser_not_upcoming'; end if;
    if coalesce(array_length(p_item_ids, 1), 0) > 3 then raise exception 'teaser_too_many_books'; end if;
    update public.curations set teaser_on = false where bookstore_id = c.bookstore_id and id <> c.id and teaser_on;
  end if;
  update public.curations
     set teaser_on = p_on, teaser_text = nullif(trim(coalesce(p_text, '')), '')
   where id = c.id;
  update public.curation_items set teaser = (id = any(coalesce(p_item_ids, '{}'))) where curation_id = c.id;
  if not p_on then delete from public.curation_reminders where curation_id = c.id; end if;
  return jsonb_build_object('id', c.id, 'teaser_on', p_on);
end $$;

-- 讀者看的預告卡（書不含推薦理由；其他本數用模糊書封）
create or replace function public.teaser_json(c public.curations)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id,
    'period', c.period,
    'title', c.title,
    'text', coalesce(c.teaser_text, nullif(split_part(coalesce(c.description, ''), '。', 1), '')),
    'scheduled_for', case when c.status = 'scheduled' then c.scheduled_for end,
    'books', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'cover_url', b.cover_url) order by i.position)
                         from public.curation_items i join public.books b on b.id = i.book_id
                        where i.curation_id = c.id and i.teaser), '[]'::jsonb),
    'hidden_count', (select count(*) from public.curation_items i where i.curation_id = c.id and not i.teaser),
    'waiting', (select count(*) from public.curation_reminders r where r.curation_id = c.id),
    'reminded', exists (select 1 from public.curation_reminders r where r.curation_id = c.id and r.user_id = auth.uid()),
    'store', (select jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.name, 'color', s.color, 'avatar_path', s.avatar_path)
                from public.bookstores s where s.id = c.bookstore_id)
  )
$$;

create or replace function public.store_teaser(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.teaser_json(c)
  from public.curations c join public.bookstores s on s.id = c.bookstore_id
  where s.slug = p_slug and c.teaser_on and c.status <> 'published' and c.period > public.current_period()
    and public.is_store_visible(s.id) and not public.is_blocked_with(s.owner_id)
  order by c.period
  limit 1
$$;

-- 探索 › 策展「即將上架」：追蹤中的書店優先，再依等的人數
create or replace function public.explore_teasers(p_limit int default 10)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(t.j order by t.following desc, t.waiting desc, t.period), '[]'::jsonb)
  from (
    select public.teaser_json(c) as j, c.period,
           exists (select 1 from public.follows f where f.bookstore_id = c.bookstore_id and f.follower_id = auth.uid()) as following,
           (select count(*) from public.curation_reminders r where r.curation_id = c.id) as waiting
    from public.curations c join public.bookstores s on s.id = c.bookstore_id
    where c.teaser_on and c.status <> 'published' and c.period > public.current_period()
      and public.is_store_visible(s.id) and not public.is_blocked_with(s.owner_id)
      and s.owner_id is distinct from auth.uid()
    order by 3 desc, 4 desc, c.period
    limit least(greatest(p_limit, 1), 20)
  ) t
$$;

-- 上架提醒我（開／關）
create or replace function public.teaser_remind(p_curation_id uuid, p_on boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;
  if p_on then
    if not exists (select 1 from public.curations where id = p_curation_id and teaser_on and status <> 'published') then raise exception 'teaser_gone'; end if;
    insert into public.curation_reminders (user_id, curation_id) values (auth.uid(), p_curation_id) on conflict do nothing;
  else
    delete from public.curation_reminders where user_id = auth.uid() and curation_id = p_curation_id;
  end if;
  return jsonb_build_object('reminded', p_on, 'waiting', (select count(*) from public.curation_reminders where curation_id = p_curation_id));
end $$;

-- ---------------------------------------------------------------------------
-- 3. 上架那天：按過提醒、沒追蹤的人收到通知（追蹤者本來就會收到），預告關掉
-- ---------------------------------------------------------------------------
create or replace function public.teaser_on_publish()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  s public.bookstores;
  m int;
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    select * into s from public.bookstores where id = new.bookstore_id;
    m := extract(month from new.period)::int;
    insert into public.notification_outbox (user_id, kind, title, body, data)
    select r.user_id, 'teaser',
           case when public.prefers_en(r.user_id)
                then format('“%s” just published the curation you were waiting for', s.name)
                else format('你在等的「%s」%s 月策展上架了', s.name, m) end,
           coalesce(new.title, ''),
           jsonb_build_object('url', '/store/' || s.slug)
    from public.curation_reminders r
    where r.curation_id = new.id
      and not exists (select 1 from public.follows f where f.bookstore_id = new.bookstore_id and f.follower_id = r.user_id)
      and not exists (select 1 from public.blocks b
                      where (b.blocker_id = r.user_id and b.blocked_id = s.owner_id)
                         or (b.blocker_id = s.owner_id and b.blocked_id = r.user_id));
    delete from public.curation_reminders where curation_id = new.id;
    new.teaser_on := false;
  end if;
  return new;
end $$;
drop trigger if exists curations_teaser_publish on public.curations;
create trigger curations_teaser_publish before update of status on public.curations
  for each row execute function public.teaser_on_publish();

grant execute on function public.store_teaser(text), public.explore_teasers(int) to anon, authenticated;
grant execute on function public.set_teaser(uuid, boolean, text, uuid[]), public.teaser_remind(uuid, boolean) to authenticated;
revoke execute on function public.teaser_json(public.curations), public.teaser_on_publish() from public, anon, authenticated;
