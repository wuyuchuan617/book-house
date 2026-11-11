-- v1.5 ①：每個人都有書店、公開設定（書店頁顯示什麼）
-- PRD 6.18；畫布 G0–G4

-- ---------------------------------------------------------------------------
-- 1. 欄位
--   auto_created：系統自動開的（還沒自己開店流程）
--   setup_done：第一次進「我的書店」的設定卡看過了沒（G0）
--   show_*：公開設定的 5 個開關（一類關掉 → 書店頁整類看不到）
-- ---------------------------------------------------------------------------
alter table public.bookstores
  add column if not exists auto_created boolean not null default false,
  add column if not exists setup_done   boolean not null default true,
  add column if not exists show_reading boolean not null default true,
  add column if not exists show_want    boolean not null default false,
  add column if not exists show_place   boolean not null default false,
  add column if not exists show_post    boolean not null default true,
  add column if not exists show_rx      boolean not null default true;

grant update (setup_done, show_reading, show_want, show_place, show_post, show_rx)
  on public.bookstores to authenticated;

-- 某一類有沒有開（給 RLS 與之後的店主手記用）
create or replace function public.store_shows(p_bookstore_id uuid, p_kind text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case p_kind
      when 'reading' then s.show_reading
      when 'want'    then s.show_want
      when 'place'   then s.show_place
      when 'post'    then s.show_post
      when 'rx'      then s.show_rx
      else false end
    from public.bookstores s where s.id = p_bookstore_id), false)
$$;
grant execute on function public.store_shows(uuid, text) to anon, authenticated;

-- 公開的店主閱讀：還要看「正在讀／讀過」這類有沒有開
drop policy if exists readings_read on public.readings;
create policy readings_read on public.readings for select
  using (public.is_store_owner(bookstore_id)
         or (is_public and public.is_store_visible(bookstore_id) and public.store_shows(bookstore_id, 'reading')));

-- 書店頁要知道哪些分頁要顯示（欄位接在最後面）
create or replace view public.public_bookstores with (security_invoker = true) as
  select s.id, s.slug, s.name, s.owner_name, s.tagline, s.color, s.avatar_path, s.banner_path,
         s.created_at, public.follower_count(s.id) as follower_count,
         s.show_reading, s.show_want, s.show_place, s.show_post, s.show_rx
  from public.bookstores s
  where public.is_store_visible(s.id);

-- ---------------------------------------------------------------------------
-- 2. 自動開書店
-- ---------------------------------------------------------------------------
create or replace function public.unique_store_slug(p_base text, p_except uuid default null)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_base text := left(public.slugify(p_base), 24);
  v_slug text;
  i int := 0;
begin
  if char_length(v_base) < 3 or v_base in ('admin', 'api', 'app', 'help', 'login', 'settings', 'store', 'explore', 'www') then
    v_base := 'store-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;
  v_slug := v_base;
  while exists (select 1 from public.bookstores
                where slug = v_slug::extensions.citext and id is distinct from p_except) loop
    i := i + 1;
    v_slug := v_base || '-' || i;
  end loop;
  return v_slug;
end $$;

-- 內部用：替某個人開一間書店（名字＋的書店、隨機顏色）；名字被內容過濾擋下就用「我的書店」
create or replace function public.create_auto_bookstore(p_uid uuid)
returns public.bookstores
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_color public.store_color;
  v_store public.bookstores;
begin
  select * into v_store from public.bookstores where owner_id = p_uid;
  if found then
    return v_store;
  end if;
  select left(trim(display_name), 17) into v_name from public.profiles where id = p_uid;
  if v_name is null then
    return null;
  end if;
  v_color := (enum_range(null::public.store_color))[1 + floor(random() * 6)::int];
  begin
    insert into public.bookstores (owner_id, name, owner_name, color, slug, auto_created, setup_done)
    values (p_uid, v_name || '的書店', left(v_name, 20), v_color, public.unique_store_slug(v_name), true, false)
    returning * into v_store;
  exception when others then
    insert into public.bookstores (owner_id, name, owner_name, color, slug, auto_created, setup_done)
    values (p_uid, '我的書店', '店主', v_color, public.unique_store_slug(''), true, false)
    returning * into v_store;
  end;
  return v_store;
end $$;
revoke execute on function public.create_auto_bookstore(uuid) from public, anon, authenticated;

-- App 進「我的書店」時呼叫：沒有書店就幫你開一間（重設書店後也會再開）
create or replace function public.ensure_my_bookstore()
returns public.bookstores
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and delete_requested_at is not null) then
    return null;
  end if;
  return public.create_auto_bookstore(v_uid);
end $$;
grant execute on function public.ensure_my_bookstore() to authenticated;

-- 新帳號：建立 profile 之後順便開書店
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, ''), '@', 1),
      '讀者'
    ), 40),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  insert into public.notification_prefs (user_id) values (new.id) on conflict do nothing;
  begin
    perform public.create_auto_bookstore(new.id);
  exception when others then
    null; -- 開不成也不影響登入；進「我的書店」時 ensure_my_bookstore 會再試
  end;
  return new;
end $$;

-- 原本的開店流程（O2）：已經有自動開的書店 → 改成「認領」它（換名字、顏色、網址）
create or replace function public.create_bookstore(
  p_name text,
  p_owner_name text,
  p_color public.store_color default 'moss'
) returns public.bookstores
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_store public.bookstores;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select * into v_store from public.bookstores where owner_id = v_uid;
  if found then
    if not v_store.auto_created then
      raise exception 'you already have a bookstore' using errcode = '23505';
    end if;
    update public.bookstores
       set name = p_name, owner_name = p_owner_name, color = p_color,
           slug = public.unique_store_slug(p_name, v_store.id),
           auto_created = false, setup_done = true
     where id = v_store.id
    returning * into v_store;
    perform public.on_store_claimed(v_store.owner_id);
    return v_store;
  end if;

  insert into public.bookstores (owner_id, name, owner_name, color, slug)
  values (v_uid, p_name, p_owner_name, p_color, public.unique_store_slug(p_name))
  returning * into v_store;
  return v_store;
end $$;

-- ---------------------------------------------------------------------------
-- 3. 店主提醒：自動開的書店不打開每月提醒、不推「還差一步就開張」
--    （自己按過開店、或發布第一檔策展時才打開每月提醒）
-- ---------------------------------------------------------------------------
create or replace function public.on_store_claimed(p_owner uuid)
returns void language sql security definer set search_path = '' as $$
  update public.notification_prefs
     set monthly_reminder = true, reminder_day = coalesce(reminder_day, 25)
   where user_id = p_owner
$$;
revoke execute on function public.on_store_claimed(uuid) from public, anon, authenticated;

create or replace function public.on_bookstore_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not new.auto_created then
    perform public.on_store_claimed(new.owner_id);
  end if;
  return new;
end $$;

-- 自動開的書店第一次發布策展 → 變成正式開店（打開每月提醒）
create or replace function public.on_first_publish()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    update public.bookstores set auto_created = false
     where id = new.bookstore_id and auto_created
    returning owner_id into v_owner;
    if v_owner is not null then
      perform public.on_store_claimed(v_owner);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists curations_first_publish on public.curations;
create trigger curations_first_publish after update of status on public.curations
  for each row execute function public.on_first_publish();

create or replace function public.enqueue_onboarding_nudges()
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  with ins as (
    insert into public.notification_outbox (user_id, kind, title, body, data)
    select s.owner_id, 'onboarding', format('「%s」還差一步就開張', s.name),
           '放上一本書、按發布，讀者就能在探索頁看到你。草稿都還在。',
           jsonb_build_object('url', '/my-store')
    from public.bookstores s
    join public.notification_prefs np on np.user_id = s.owner_id
    where s.status = 'active' and np.push and not s.auto_created
      and s.created_at between now() - interval '72 hours' and now() - interval '24 hours'
      and not exists (select 1 from public.curations c where c.bookstore_id = s.id and c.status <> 'draft')
      and not exists (select 1 from public.notification_outbox o where o.user_id = s.owner_id and o.kind = 'onboarding')
    returning 1
  ) select count(*) into n from ins;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 4. 舊帳號補開書店（還沒申請刪除的）
-- ---------------------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in select pr.id from public.profiles pr
           where pr.delete_requested_at is null
             and not exists (select 1 from public.bookstores s where s.owner_id = pr.id)
  loop
    perform public.create_auto_bookstore(p.id);
  end loop;
end $$;
