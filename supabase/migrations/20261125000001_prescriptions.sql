-- v1.5 ④：閱讀處方簽（每人一張處方、一本書）
-- PRD 6.18；畫布 X1–X6

alter type public.report_target add value if not exists 'prescription';
alter type public.report_target add value if not exists 'prescription_reply';

-- ---------------------------------------------------------------------------
-- 1. 資料表
-- ---------------------------------------------------------------------------
create table public.prescriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title         text not null check (char_length(trim(title)) between 1 and 60),
  body          text check (char_length(body) <= 300),
  tags          text[] not null default '{}' check (cardinality(tags) <= 3
                  and tags <@ array['mood', 'work', 'relationship', 'beginner', 'gift', 'kids', 'travel']),
  anonymous     boolean not null default false,
  duration_days int not null default 14 check (duration_days in (7, 14, 30)),
  closes_at     timestamptz not null default now() + interval '14 days',
  closed_at     timestamptz,
  extended      boolean not null default false,
  reminded_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index prescriptions_recent_idx on public.prescriptions (created_at desc);
create index prescriptions_user_idx on public.prescriptions (user_id, created_at desc);
alter table public.prescriptions enable row level security;
-- 本人直接讀寫；別人只能透過 rx_* 函式讀（匿名發起時不外洩是誰）
create policy rx_self on public.prescriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.prescriptions from anon, authenticated;
grant update (title, body, tags) on public.prescriptions to authenticated;

create table public.prescription_replies (
  id              uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions (id) on delete cascade,
  user_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  book_id         uuid not null references public.books (id),
  reason          text not null check (char_length(trim(reason)) between 10 and 200),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (prescription_id, user_id)
);
create index prescription_replies_rx_idx on public.prescription_replies (prescription_id, book_id);
create index prescription_replies_user_idx on public.prescription_replies (user_id, created_at desc);
alter table public.prescription_replies enable row level security;
create policy rx_replies_self_read on public.prescription_replies for select using (user_id = auth.uid());
create policy rx_replies_self_delete on public.prescription_replies for delete using (user_id = auth.uid());
-- 新增、修改只經 rx_reply()

alter table public.notification_prefs add column if not exists prescription boolean not null default true;
alter table public.notification_outbox drop constraint if exists notification_outbox_kind_check;
alter table public.notification_outbox add constraint notification_outbox_kind_check
  check (kind in ('new_curation', 'new_follower', 'monthly_reminder', 'moderation', 'feedback', 'onboarding', 'weekly_review', 'prescription'));

-- 發起：內容過濾、同時開放最多 3 張、開放天數決定結案時間
create or replace function public.guard_prescription()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  if public.content_violation(new.title) or public.content_violation(new.body) then
    raise exception 'content not allowed' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    new.closes_at := now() + make_interval(days => new.duration_days);
    new.closed_at := null;
    new.extended := false;
    if (select count(*) from public.prescriptions p
        where p.user_id = new.user_id and p.closed_at is null and p.closes_at > now()) >= 3 then
      raise exception 'too many open prescriptions' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger prescriptions_guard before insert or update on public.prescriptions
  for each row execute function public.guard_prescription();

-- ---------------------------------------------------------------------------
-- 2. 讀取
-- ---------------------------------------------------------------------------
create or replace function public.rx_is_open(p public.prescriptions)
returns boolean language sql stable as $$ select p.closed_at is null and p.closes_at > now() $$;

-- 發起人怎麼顯示：匿名 → 一位讀者；否則用書店（每個人都有書店）
create or replace function public.rx_author(p_user uuid, p_anonymous boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p_anonymous then jsonb_build_object('name', null, 'slug', null, 'color', null, 'avatar_path', null)
         else (select jsonb_build_object('name', coalesce(s.name, pr.display_name), 'slug', s.slug, 'color', s.color, 'avatar_path', s.avatar_path)
               from public.profiles pr left join public.bookstores s on s.owner_id = pr.id and s.status = 'active'
               where pr.id = p_user) end
$$;

-- X1 列表：latest／unanswered（還沒人開）／popular（最多處方）；p_tag 篩選
create or replace function public.rx_list(p_filter text default 'latest', p_tag text default null, p_limit int default 40)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(item order by sort1 desc nulls last, created_at desc), '[]'::jsonb) from (
    select p.created_at,
           case when p_filter = 'popular' then (select count(*) from public.prescription_replies r where r.prescription_id = p.id) end as sort1,
           jsonb_build_object(
             'id', p.id, 'title', p.title, 'tags', p.tags, 'created_at', p.created_at, 'closes_at', p.closes_at,
             'is_open', public.rx_is_open(p), 'is_mine', p.user_id = auth.uid(),
             'author', public.rx_author(p.user_id, p.anonymous),
             'reply_count', (select count(*) from public.prescription_replies r where r.prescription_id = p.id and not public.is_blocked_with(r.user_id)),
             'my_replied', exists (select 1 from public.prescription_replies r where r.prescription_id = p.id and r.user_id = auth.uid()),
             'covers', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'cover_url', b.cover_url))
                                 from (select r.book_id, count(*) n, max(r.created_at) last from public.prescription_replies r
                                       where r.prescription_id = p.id and not public.is_blocked_with(r.user_id)
                                       group by r.book_id order by n desc, last desc limit 4) t
                                 join public.books b on b.id = t.book_id), '[]'::jsonb)) as item
    from public.prescriptions p
    join public.profiles pr on pr.id = p.user_id and pr.delete_requested_at is null
    where not public.is_blocked_with(p.user_id)
      and (p_tag is null or p_tag = any (p.tags))
      and (p_filter <> 'unanswered' or (public.rx_is_open(p) and not exists (select 1 from public.prescription_replies r where r.prescription_id = p.id)))
    order by p.created_at desc
    limit greatest(1, least(p_limit, 100))
  ) x
$$;

-- X3 詳情：同一本書的處方合併成一張卡，依人數排序；每張卡附每個人的理由
create or replace function public.rx_detail(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  p public.prescriptions;
begin
  select * into p from public.prescriptions where id = p_id;
  if not found or (p.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000') and (public.is_blocked_with(p.user_id)
     or exists (select 1 from public.profiles pr where pr.id = p.user_id and pr.delete_requested_at is not null))) then
    return null;
  end if;
  return jsonb_build_object(
    'id', p.id, 'title', p.title, 'body', p.body, 'tags', p.tags, 'created_at', p.created_at, 'closes_at', p.closes_at,
    'closed_at', p.closed_at, 'extended', p.extended, 'anonymous', p.anonymous, 'duration_days', p.duration_days,
    'is_open', public.rx_is_open(p), 'is_mine', p.user_id = auth.uid(),
    'author', public.rx_author(p.user_id, p.anonymous),
    'my_reply', (select jsonb_build_object('id', r.id, 'reason', r.reason, 'book', jsonb_build_object('id', b.id, 'title', b.title, 'authors', b.authors, 'cover_url', b.cover_url))
                 from public.prescription_replies r join public.books b on b.id = r.book_id
                 where r.prescription_id = p.id and r.user_id = auth.uid()),
    'reply_count', (select count(*) from public.prescription_replies r where r.prescription_id = p.id and not public.is_blocked_with(r.user_id)),
    'books', coalesce((
      select jsonb_agg(g.item order by g.n desc, g.last desc) from (
        select count(*) as n, max(r.created_at) as last, jsonb_build_object(
          'book', jsonb_build_object('id', b.id, 'title', b.title, 'authors', b.authors, 'cover_url', b.cover_url),
          'count', count(*),
          'owner_wants', exists (select 1 from public.book_saves sv where sv.user_id = p.user_id and sv.book_id = b.id),
          'reasons', jsonb_agg(jsonb_build_object(
            'id', r.id, 'reason', r.reason, 'created_at', r.created_at, 'is_mine', r.user_id = auth.uid(),
            'author', public.rx_author(r.user_id, false)) order by r.created_at)) as item
        from public.prescription_replies r join public.books b on b.id = r.book_id
        where r.prescription_id = p.id and not public.is_blocked_with(r.user_id)
        group by b.id, b.title, b.authors, b.cover_url
      ) g), '[]'::jsonb));
end $$;

-- X5 書櫃 › 處方簽：我發起的（started）／我開的（replied）
create or replace function public.rx_mine(p_kind text default 'started')
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p_kind = 'replied' then
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'title', p.title, 'is_open', public.rx_is_open(p), 'closes_at', p.closes_at,
      'reply_count', (select count(*) from public.prescription_replies x where x.prescription_id = p.id),
      'my_book', jsonb_build_object('id', b.id, 'title', b.title, 'cover_url', b.cover_url),
      'owner_wants', exists (select 1 from public.book_saves sv where sv.user_id = p.user_id and sv.book_id = r.book_id)
    ) order by r.created_at desc)
    from public.prescription_replies r join public.prescriptions p on p.id = r.prescription_id join public.books b on b.id = r.book_id
    where r.user_id = auth.uid()), '[]'::jsonb)
  else
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'title', p.title, 'is_open', public.rx_is_open(p), 'closes_at', p.closes_at, 'closed_at', p.closed_at,
      'anonymous', p.anonymous,
      'reply_count', (select count(*) from public.prescription_replies x where x.prescription_id = p.id),
      'new_count', (select count(*) from public.prescription_replies x where x.prescription_id = p.id and x.created_at > now() - interval '2 days'),
      'wanted_count', (select count(distinct x.book_id) from public.prescription_replies x
                       join public.book_saves sv on sv.user_id = p.user_id and sv.book_id = x.book_id where x.prescription_id = p.id)
    ) order by p.created_at desc)
    from public.prescriptions p where p.user_id = auth.uid()), '[]'::jsonb)
  end
$$;

-- ---------------------------------------------------------------------------
-- 3. 寫入：開處方（每人每張一次、一本書）、撤回、結案、延長
-- ---------------------------------------------------------------------------
create or replace function public.rx_reply(p_id uuid, p_book_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  p public.prescriptions;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select * into p from public.prescriptions where id = p_id;
  if not found or public.is_blocked_with(p.user_id) then
    raise exception 'prescription not found' using errcode = 'P0002';
  end if;
  if p.user_id = auth.uid() then
    raise exception 'cannot reply to your own prescription' using errcode = '23514';
  end if;
  if not public.rx_is_open(p) then
    raise exception 'prescription is closed' using errcode = '23514';
  end if;
  if public.content_violation(p_reason) then
    raise exception 'content not allowed' using errcode = '23514';
  end if;
  insert into public.prescription_replies (prescription_id, user_id, book_id, reason)
  values (p_id, auth.uid(), p_book_id, trim(p_reason))
  on conflict (prescription_id, user_id) do update
    set book_id = excluded.book_id, reason = excluded.reason, updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.rx_close(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.prescriptions set closed_at = now() where id = p_id and user_id = auth.uid() and closed_at is null
$$;

-- 延長一次：從現在或原本的結案時間（較晚的）再加 7 天
create or replace function public.rx_extend(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.prescriptions
     set closes_at = greatest(closes_at, now()) + interval '7 days', extended = true
   where id = p_id and user_id = auth.uid() and closed_at is null and not extended;
  if not found then
    raise exception 'cannot extend' using errcode = '23514';
  end if;
end $$;

create or replace function public.rx_report(p_target text, p_id uuid, p_reason public.report_reason, p_detail text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if p_target not in ('prescription', 'prescription_reply') then
    raise exception 'bad target' using errcode = '22023';
  end if;
  if exists (select 1 from public.reports where reporter_id = auth.uid() and target_type::text = p_target
             and target_id = p_id and created_at > now() - interval '24 hours') then
    raise exception 'already reported recently' using errcode = '23505';
  end if;
  insert into public.reports (reporter_id, target_type, target_id, reason, detail)
  values (auth.uid(), p_target::public.report_target, p_id, p_reason, nullif(left(trim(p_detail), 500), ''));
end $$;

-- ---------------------------------------------------------------------------
-- 4. 通知
-- ---------------------------------------------------------------------------
-- 有人開處方 → 發起人（同一張 1 小時內只推一則）
create or replace function public.notify_rx_reply()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  p public.prescriptions;
  t text;
begin
  select * into p from public.prescriptions where id = new.prescription_id;
  select title into t from public.books where id = new.book_id;
  if exists (select 1 from public.notification_outbox o where o.user_id = p.user_id and o.kind = 'prescription'
             and o.data->>'rx' = p.id::text and o.data->>'event' = 'reply' and o.created_at > now() - interval '1 hour') then
    return new;
  end if;
  insert into public.notification_outbox (user_id, kind, title, body, data)
  select p.user_id, 'prescription', '有人幫你開了一張處方',
         format('「%s」：%s', left(p.title, 30), coalesce(t, '一本書')),
         jsonb_build_object('url', '/rx/' || p.id, 'rx', p.id, 'event', 'reply')
  from public.notification_prefs np
  where np.user_id = p.user_id and np.push and np.prescription;
  return new;
end $$;
create trigger prescription_replies_notify after insert on public.prescription_replies
  for each row execute function public.notify_rx_reply();

-- 發起人把處方裡的書加入想讀 → 開這本的人
create or replace function public.notify_rx_wanted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notification_outbox (user_id, kind, title, body, data)
  select r.user_id, 'prescription', '你開的書被加入想讀了',
         format('「%s」的發起人把《%s》加入想讀', left(p.title, 30), b.title),
         jsonb_build_object('url', '/rx/' || p.id, 'rx', p.id, 'event', 'wanted')
  from public.prescription_replies r
  join public.prescriptions p on p.id = r.prescription_id and p.user_id = new.user_id
  join public.books b on b.id = r.book_id
  join public.notification_prefs np on np.user_id = r.user_id and np.push and np.prescription
  where r.book_id = new.book_id and r.user_id <> new.user_id;
  return new;
end $$;
create trigger book_saves_rx_notify after insert on public.book_saves
  for each row execute function public.notify_rx_wanted();

-- 快結案（剩 3 天內）還沒人開 → 提醒發起人分享出去（每張一次）
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
    select d.user_id, 'prescription', '處方簽快結案了', format('「%s」還沒有人開處方，分享給朋友看看？', left(d.title, 30)),
           jsonb_build_object('url', '/rx/' || d.id, 'rx', d.id, 'event', 'reminder')
    from due d join public.notification_prefs np on np.user_id = d.user_id and np.push and np.prescription
    returning 1
  ) select count(*) into n from ins;
  return n;
end $$;

grant execute on function public.rx_list(text, text, int), public.rx_detail(uuid) to anon, authenticated;
grant execute on function public.rx_mine(text), public.rx_reply(uuid, uuid, text), public.rx_close(uuid), public.rx_extend(uuid),
  public.rx_report(text, uuid, public.report_reason, text) to authenticated;
revoke execute on function public.enqueue_rx_reminders() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rx-reminders', '15 2 * * *', 'select public.enqueue_rx_reminders()');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. 店主手記多「閱讀處方簽」：開過的處方、用書店身分發起的處方簽（公開設定 show_rx）
-- ---------------------------------------------------------------------------
create or replace function public.store_journal(p_bookstore_id uuid, p_limit int default 60)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s public.bookstores;
  mine boolean;
begin
  select * into s from public.bookstores where id = p_bookstore_id;
  if not found then
    return '[]'::jsonb;
  end if;
  mine := s.owner_id = auth.uid();
  if not mine and not public.is_store_visible(s.id) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(item order by at desc) from (
      select * from (
        select sv.created_at as at, jsonb_build_object(
          'type', 'want', 'id', sv.book_id, 'at', sv.created_at, 'is_public', sv.is_public,
          'shown', s.show_want and sv.is_public,
          'note', sv.note, 'source_text', sv.source_text,
          'book', jsonb_build_object('id', b.id, 'title', b.title, 'authors', b.authors, 'cover_url', b.cover_url)) as item
        from public.book_saves sv join public.books b on b.id = sv.book_id
        where sv.user_id = s.owner_id and (mine or (s.show_want and sv.is_public))
        union all
        select ps.created_at, jsonb_build_object(
          'type', 'place', 'id', ps.place_id, 'at', ps.created_at, 'is_public', ps.is_public and pl.public_ok,
          'shown', s.show_place and ps.is_public and pl.public_ok,
          'note', ps.note, 'public_ok', pl.public_ok,
          'place', jsonb_build_object('id', pl.id, 'name', pl.name, 'category', public.place_category(pl.id)))
        from public.place_saves ps join public.places pl on pl.id = ps.place_id
        where ps.user_id = s.owner_id and (mine or (s.show_place and ps.is_public and pl.public_ok))
        union all
        select e.created_at, jsonb_build_object(
          'type', 'post', 'id', e.id, 'at', e.created_at, 'is_public', e.is_public,
          'shown', s.show_post and e.is_public,
          'kind', e.kind, 'entry_date', e.entry_date, 'body', e.body, 'photo_paths', e.photo_paths, 'page_ref', e.page_ref,
          'place', case when pl.id is null then null else jsonb_build_object('id', pl.id, 'name', pl.name) end,
          'place_label', case when mine then e.place_label end,
          'book', case when b.id is null then null else jsonb_build_object('id', b.id, 'title', b.title, 'cover_url', b.cover_url) end)
        from public.diary_entries e
        left join public.places pl on pl.id = e.place_id
        left join public.books b on b.id = e.book_id
        where e.user_id = s.owner_id and (mine or (s.show_post and e.is_public))
        union all
        select r.created_at, jsonb_build_object(
          'type', 'rx_reply', 'id', r.id, 'at', r.created_at, 'is_public', true, 'shown', s.show_rx,
          'reason', r.reason, 'prescription', jsonb_build_object('id', p.id, 'title', p.title),
          'book', jsonb_build_object('id', b.id, 'title', b.title, 'cover_url', b.cover_url))
        from public.prescription_replies r
        join public.prescriptions p on p.id = r.prescription_id
        join public.books b on b.id = r.book_id
        where r.user_id = s.owner_id and (mine or (s.show_rx and not public.is_blocked_with(p.user_id)))
        union all
        select p.created_at, jsonb_build_object(
          'type', 'rx', 'id', p.id, 'at', p.created_at, 'is_public', not p.anonymous, 'shown', s.show_rx and not p.anonymous,
          'title', p.title, 'reply_count', (select count(*) from public.prescription_replies r where r.prescription_id = p.id),
          'is_open', p.closed_at is null and p.closes_at > now())
        from public.prescriptions p
        where p.user_id = s.owner_id and (mine or (s.show_rx and not p.anonymous))
      ) all_items
      order by at desc
      limit greatest(1, least(p_limit, 200))
    ) x), '[]'::jsonb);
end $$;
