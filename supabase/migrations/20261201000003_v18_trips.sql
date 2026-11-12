-- v1.8 ③：書旅（以城市整理書店＋順路的咖啡、餐廳、景點）
-- PRD 6.23 第 4 點；畫布 19. v1.8（AG1–AG3）

-- ---------------------------------------------------------------------------
-- 1. 地點的城市：從地址抓「XX市／XX縣」（臺→台）；新地點自動帶，舊地點補
-- ---------------------------------------------------------------------------
alter table public.places add column if not exists city text check (char_length(city) <= 40);

create or replace function public.city_of(p_address text)
returns text language sql immutable set search_path = '' as $$
  select nullif(replace(substring(coalesce(p_address, '') from '([一-龥]{1,3}[市縣])'), '臺', '台'), '')
$$;

create or replace function public.places_set_city()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.city is null or (tg_op = 'UPDATE' and new.address is distinct from old.address and new.city is not distinct from old.city) then
    new.city := coalesce(public.city_of(new.address), new.city);
  end if;
  return new;
end $$;
drop trigger if exists places_city on public.places;
create trigger places_city before insert or update of address on public.places for each row execute function public.places_set_city();
update public.places set city = public.city_of(address) where city is null and public.city_of(address) is not null;
create index if not exists places_city_idx on public.places (city);

-- ---------------------------------------------------------------------------
-- 2. 公開設定多「書旅」：所有書店預設公開
-- ---------------------------------------------------------------------------
alter table public.bookstores add column if not exists show_trip boolean not null default true;
grant update (show_trip) on public.bookstores to authenticated;
create or replace view public.public_bookstores with (security_invoker = true) as
  select s.id, s.slug, s.name, s.owner_name, s.tagline, s.color, s.avatar_path, s.banner_path,
         s.created_at, public.follower_count(s.id) as follower_count,
         s.show_reading, s.show_want, s.show_place, s.show_post, s.show_rx, s.show_owned, s.show_trip
  from public.bookstores s
  where public.is_store_visible(s.id);
grant select on public.public_bookstores to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. 表
-- ---------------------------------------------------------------------------
create table if not exists public.trips (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  city       text not null check (char_length(city) between 1 and 40),
  title      text not null check (char_length(title) between 1 and 40),
  intro      text check (char_length(intro) <= 300),
  days       int not null default 1 check (days between 0 and 7), -- 0 = 半天
  status     text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trips_city_idx on public.trips (city, status);
create index if not exists trips_user_idx on public.trips (user_id, updated_at desc);

create table if not exists public.trip_stops (
  id       uuid primary key default gen_random_uuid(),
  trip_id  uuid not null references public.trips (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  day      int not null default 1 check (day between 1 and 7),
  position int not null default 0,
  note     text check (char_length(note) <= 120),
  slot     text check (slot in ('morning', 'lunch', 'afternoon', 'evening')),
  unique (trip_id, place_id)
);
create index if not exists trip_stops_trip_idx on public.trip_stops (trip_id, day, position);

create table if not exists public.trip_saves (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  trip_id    uuid not null references public.trips (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, trip_id)
);

alter table public.trips enable row level security;
alter table public.trip_stops enable row level security;
alter table public.trip_saves enable row level security;

-- 看得到：自己的全部；別人的只有公開、書店公開設定「書旅」有開、沒有互相封鎖
create or replace function public.trip_visible(t public.trips)
returns boolean language sql stable security definer set search_path = '' as $$
  select t.user_id = auth.uid() or (
    t.status = 'published' and not public.is_blocked_with(t.user_id)
    and coalesce((select s.show_trip from public.bookstores s where s.owner_id = t.user_id and s.status = 'active' limit 1), true))
$$;

drop policy if exists trips_read on public.trips;
create policy trips_read on public.trips for select using (public.trip_visible(trips));
drop policy if exists trips_own on public.trips;
create policy trips_own on public.trips for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists stops_read on public.trip_stops;
create policy stops_read on public.trip_stops for select using (exists (select 1 from public.trips t where t.id = trip_id));
drop policy if exists stops_own on public.trip_stops;
create policy stops_own on public.trip_stops for all to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

drop policy if exists trip_saves_own on public.trip_saves;
create policy trip_saves_own on public.trip_saves for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.trips, public.trip_stops to anon, authenticated;
grant insert, update, delete on public.trips, public.trip_stops to authenticated;
grant select, insert, delete on public.trip_saves to authenticated;

-- 書旅只能放公開場所；改了就更新 updated_at
create or replace function public.guard_trip_stop()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.places where id = new.place_id and public_ok) then raise exception 'trip_private_place'; end if;
  update public.trips set updated_at = now() where id = new.trip_id;
  return new;
end $$;
drop trigger if exists trip_stops_guard on public.trip_stops;
create trigger trip_stops_guard before insert or update on public.trip_stops for each row execute function public.guard_trip_stop();

create or replace function public.touch_trip()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.title := trim(new.title);
  new.city := replace(trim(new.city), '臺', '台');
  return new;
end $$;
drop trigger if exists trips_touch on public.trips;
create trigger trips_touch before insert or update on public.trips for each row execute function public.touch_trip();

-- ---------------------------------------------------------------------------
-- 4. 讀
-- ---------------------------------------------------------------------------
create or replace function public.trip_json(t public.trips, p_stops boolean default false)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', t.id, 'city', t.city, 'title', t.title, 'intro', t.intro, 'days', t.days, 'status', t.status, 'updated_at', t.updated_at,
    'is_mine', t.user_id = auth.uid(),
    'author', (select jsonb_build_object('name', coalesce(s.name, p.display_name), 'slug', s.slug, 'color', s.color, 'avatar_path', s.avatar_path)
                 from public.profiles p left join public.bookstores s on s.owner_id = p.id and s.status = 'active' where p.id = t.user_id),
    'stop_count', (select count(*) from public.trip_stops x where x.trip_id = t.id),
    'bookstore_count', (select count(*) from public.trip_stops x join public.places pl on pl.id = x.place_id
                         where x.trip_id = t.id and coalesce(pl.category_override, pl.category) in ('bookstore', 'indie')),
    'save_count', (select count(*) from public.trip_saves v where v.trip_id = t.id),
    'saved', exists (select 1 from public.trip_saves v where v.trip_id = t.id and v.user_id = auth.uid()),
    'stops', case when p_stops then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'day', x.day, 'position', x.position, 'note', x.note, 'slot', x.slot,
        'place', jsonb_build_object('id', pl.id, 'name', pl.name, 'address', pl.address, 'lat', pl.lat, 'lng', pl.lng,
                                    'category', coalesce(pl.category_override, pl.category), 'google_place_id', pl.google_place_id)
      ) order by x.day, x.position)
      from public.trip_stops x join public.places pl on pl.id = x.place_id where x.trip_id = t.id), '[]'::jsonb) end
  )
$$;

create or replace function public.trip_detail(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.trip_json(t, true) from public.trips t where t.id = p_id and public.trip_visible(t)
$$;

-- 探索 › 書旅：有公開書旅的城市（依數量）
create or replace function public.trip_cities()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('city', city, 'n', n) order by n desc, city), '[]'::jsonb)
  from (select t.city, count(*) as n from public.trips t
        where t.status = 'published' and public.trip_visible(t) and exists (select 1 from public.trip_stops x where x.trip_id = t.id)
        group by t.city) c
$$;

create or replace function public.explore_trips(p_city text default null, p_limit int default 30)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(j order by saves desc, updated desc), '[]'::jsonb)
  from (
    select public.trip_json(t) as j, (select count(*) from public.trip_saves v where v.trip_id = t.id) as saves, t.updated_at as updated
    from public.trips t
    where t.status = 'published' and public.trip_visible(t)
      and (p_city is null or t.city = replace(trim(p_city), '臺', '台'))
      and exists (select 1 from public.trip_stops x where x.trip_id = t.id)
    order by 2 desc, t.updated_at desc
    limit least(greatest(p_limit, 1), 60)
  ) x
$$;

-- 我的書旅（含草稿）、我收藏的、某間書店的公開書旅
create or replace function public.my_trips()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'mine', coalesce((select jsonb_agg(public.trip_json(t) order by t.updated_at desc) from public.trips t where t.user_id = auth.uid()), '[]'::jsonb),
    'saved', coalesce((select jsonb_agg(public.trip_json(t) order by v.created_at desc) from public.trip_saves v join public.trips t on t.id = v.trip_id
                       where v.user_id = auth.uid() and public.trip_visible(t)), '[]'::jsonb))
$$;

create or replace function public.store_trips(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.trip_json(t) order by t.updated_at desc), '[]'::jsonb)
  from public.trips t join public.bookstores s on s.owner_id = t.user_id
  where s.slug = p_slug and public.trip_visible(t) and (t.user_id = auth.uid() or t.status = 'published')
$$;

-- 地點頁：收錄在幾份公開書旅
create or replace function public.place_trip_count(p_place_id uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(distinct t.id)::int from public.trip_stops x join public.trips t on t.id = x.trip_id
  where x.place_id = p_place_id and t.status = 'published' and public.trip_visible(t)
$$;

-- ---------------------------------------------------------------------------
-- 5. 寫：存整份書旅（地點順序一次送出）、收藏、一鍵加進想去
-- ---------------------------------------------------------------------------
-- p_stops: [{place_id, day, note, slot}]，依陣列順序排
create or replace function public.save_trip(p_id uuid, p_city text, p_title text, p_intro text, p_days int, p_status text, p_stops jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  tid uuid := p_id;
  s jsonb;
  i int := 0;
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;
  if p_status = 'published' and coalesce(jsonb_array_length(p_stops), 0) = 0 then raise exception 'trip_needs_stops'; end if;
  if tid is null then
    insert into public.trips (user_id, city, title, intro, days, status)
    values (auth.uid(), p_city, p_title, nullif(trim(coalesce(p_intro, '')), ''), coalesce(p_days, 1), coalesce(p_status, 'draft'))
    returning id into tid;
  else
    update public.trips set city = p_city, title = p_title, intro = nullif(trim(coalesce(p_intro, '')), ''), days = coalesce(p_days, 1), status = coalesce(p_status, status)
     where id = tid and user_id = auth.uid();
    if not found then raise exception 'not allowed'; end if;
    delete from public.trip_stops where trip_id = tid;
  end if;
  for s in select * from jsonb_array_elements(coalesce(p_stops, '[]'::jsonb)) loop
    insert into public.trip_stops (trip_id, place_id, day, position, note, slot)
    values (tid, (s->>'place_id')::uuid, coalesce((s->>'day')::int, 1), i, nullif(trim(coalesce(s->>'note', '')), ''), nullif(s->>'slot', ''))
    on conflict (trip_id, place_id) do nothing;
    i := i + 1;
  end loop;
  return jsonb_build_object('id', tid);
end $$;

create or replace function public.trip_save(p_trip_id uuid, p_on boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;
  if p_on then insert into public.trip_saves (user_id, trip_id) values (auth.uid(), p_trip_id) on conflict do nothing;
  else delete from public.trip_saves where user_id = auth.uid() and trip_id = p_trip_id; end if;
  return jsonb_build_object('saved', p_on);
end $$;

-- 一鍵把全部地點加進想去（已經在想去的不重複）
create or replace function public.save_trip_places(p_trip_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;
  if not exists (select 1 from public.trips t where t.id = p_trip_id and public.trip_visible(t)) then raise exception 'not allowed'; end if;
  with ins as (
    insert into public.place_saves (user_id, place_id)
    select auth.uid(), x.place_id from public.trip_stops x where x.trip_id = p_trip_id
    on conflict do nothing
    returning 1
  ) select count(*) into n from ins;
  return n;
end $$;

grant execute on function public.trip_detail(uuid), public.trip_cities(), public.explore_trips(text, int), public.store_trips(text), public.place_trip_count(uuid) to anon, authenticated;
grant execute on function public.my_trips(), public.save_trip(uuid, text, text, text, int, text, jsonb), public.trip_save(uuid, boolean), public.save_trip_places(uuid) to authenticated;
grant execute on function public.trip_visible(public.trips) to anon, authenticated;
revoke execute on function public.trip_json(public.trips, boolean) from public, anon, authenticated;
