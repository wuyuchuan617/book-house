-- v1.7：積讀與購書紀錄、策展推薦理由必填、書的單頁「出現在」、公開設定多「積讀」
-- PRD 6.20；畫布 Y1–Y14

-- ---------------------------------------------------------------------------
-- 1. 購書紀錄（積讀＝買了還沒讀）
-- ---------------------------------------------------------------------------
create table if not exists public.book_purchases (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  book_id     uuid not null references public.books (id),
  bought_on   date not null default ((now() at time zone 'Asia/Taipei')::date),
  place_id    uuid references public.places (id) on delete set null,
  store_label text check (char_length(trim(store_label)) between 1 and 40),
  price       int check (price between 0 and 100000),
  format      text not null default 'paper' check (format in ('paper', 'ebook', 'used', 'borrowed')),
  note        text check (char_length(note) <= 200),
  status      text not null default 'unread' check (status in ('unread', 'reading', 'done', 'gone')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, book_id)
);
create index if not exists book_purchases_user_idx on public.book_purchases (user_id, bought_on desc);
create index if not exists book_purchases_place_idx on public.book_purchases (place_id) where place_id is not null;
alter table public.book_purchases enable row level security;
drop policy if exists purchases_own on public.book_purchases;
create policy purchases_own on public.book_purchases for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.book_purchases to authenticated;

create or replace function public.guard_purchase()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  if public.content_violation(new.note) or public.content_violation(new.store_label) then
    raise exception 'content not allowed' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists book_purchases_guard on public.book_purchases;
create trigger book_purchases_guard before insert or update on public.book_purchases
  for each row execute function public.guard_purchase();

-- 買了：記一筆購書，從想讀移出；p_start = 已經開始讀
create or replace function public.record_purchase(
  p_book_id uuid, p_bought_on date default null, p_place_id uuid default null, p_store_label text default null,
  p_price int default null, p_format text default 'paper', p_note text default null, p_start boolean default false
) returns public.book_purchases
language plpgsql security definer set search_path = '' as $$
declare
  p public.book_purchases;
  s public.book_saves;
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select * into s from public.book_saves where user_id = auth.uid() and book_id = p_book_id;
  insert into public.book_purchases (user_id, book_id, bought_on, place_id, store_label, price, format, note, status)
  values (auth.uid(), p_book_id, coalesce(p_bought_on, (now() at time zone 'Asia/Taipei')::date), p_place_id,
          nullif(trim(p_store_label), ''), p_price, coalesce(p_format, 'paper'), nullif(trim(p_note), ''),
          case when p_start then 'reading' else 'unread' end)
  on conflict (user_id, book_id) do update
    set bought_on = excluded.bought_on, place_id = excluded.place_id, store_label = excluded.store_label,
        price = excluded.price, format = excluded.format, note = excluded.note,
        status = case when public.book_purchases.status in ('reading', 'done') then public.book_purchases.status else excluded.status end
  returning * into p;
  delete from public.book_saves where user_id = auth.uid() and book_id = p_book_id;
  if p_start then
    perform public.add_reading(p_book_id, 'reading', null, s.note);
  end if;
  return p;
end $$;

-- 讀的狀態跟著店主閱讀走：開始讀 → reading、讀完 → done
create or replace function public.sync_purchase_status()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.bookstores where id = new.bookstore_id;
  update public.book_purchases
     set status = case when new.status = 'finished' then 'done' else 'reading' end
   where user_id = v_owner and book_id = new.book_id and status <> 'gone';
  return new;
end $$;
drop trigger if exists readings_sync_purchase on public.readings;
create trigger readings_sync_purchase after insert or update of status on public.readings
  for each row execute function public.sync_purchase_status();

-- 書櫃 › 積讀／購書紀錄
create or replace function public.my_purchases()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'book_id', p.book_id, 'bought_on', p.bought_on, 'place_id', p.place_id,
        'place_name', pl.name, 'store_label', p.store_label, 'price', p.price, 'format', p.format, 'note', p.note,
        'status', p.status, 'book', jsonb_build_object('id', b.id, 'title', b.title, 'authors', b.authors, 'cover_url', b.cover_url))
        order by p.bought_on desc, p.created_at desc)
      from public.book_purchases p join public.books b on b.id = p.book_id
      left join public.places pl on pl.id = p.place_id
      where p.user_id = auth.uid()), '[]'::jsonb),
    'this_year', (select count(*) from public.book_purchases p where p.user_id = auth.uid()
                    and p.bought_on >= date_trunc('year', (now() at time zone 'Asia/Taipei'))::date),
    'unread', (select count(*) from public.book_purchases p where p.user_id = auth.uid() and p.status = 'unread'),
    'spent_this_year', (select coalesce(sum(p.price), 0) from public.book_purchases p where p.user_id = auth.uid()
                    and p.bought_on >= date_trunc('year', (now() at time zone 'Asia/Taipei'))::date),
    'by_month', coalesce((select jsonb_agg(jsonb_build_object('month', m, 'n', n) order by m desc)
        from (select to_char(p.bought_on, 'YYYY-MM') as m, count(*) as n from public.book_purchases p
              where p.user_id = auth.uid() group by 1 order by 1 desc limit 12) x), '[]'::jsonb),
    'top_places', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'n', n) order by n desc)
        from (select coalesce(pl.name, p.store_label) as name, count(*) as n from public.book_purchases p
              left join public.places pl on pl.id = p.place_id
              where p.user_id = auth.uid() and coalesce(pl.name, p.store_label) is not null
              group by 1 order by 2 desc limit 3) x), '[]'::jsonb)
  )
$$;
revoke execute on function public.record_purchase(uuid, date, uuid, text, int, text, text, boolean), public.my_purchases() from public, anon;
grant execute on function public.record_purchase(uuid, date, uuid, text, int, text, text, boolean), public.my_purchases() to authenticated;

-- 公開設定多「積讀」（預設關）；書店頁 › 想讀想去 的積讀（不含金額、在哪買）
alter table public.bookstores add column if not exists show_owned boolean not null default false;
grant update (show_owned) on public.bookstores to authenticated;
create or replace view public.public_bookstores with (security_invoker = true) as
  select s.id, s.slug, s.name, s.owner_name, s.tagline, s.color, s.avatar_path, s.banner_path,
         s.created_at, public.follower_count(s.id) as follower_count,
         s.show_reading, s.show_want, s.show_place, s.show_post, s.show_rx, s.show_owned
  from public.bookstores s
  where public.is_store_visible(s.id);
grant select on public.public_bookstores to anon, authenticated;

create or replace function public.store_tbr(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('book_id', b.id, 'title', b.title, 'authors', b.authors, 'cover_url', b.cover_url, 'bought_on', p.bought_on)
         order by p.bought_on desc), '[]'::jsonb)
  from public.bookstores s
  join public.book_purchases p on p.user_id = s.owner_id and p.status = 'unread'
  join public.books b on b.id = p.book_id
  where s.slug = p_slug and (s.owner_id = auth.uid() or (s.show_owned and public.is_store_visible(s.id) and not public.is_blocked_with(s.owner_id)))
$$;
grant execute on function public.store_tbr(text) to anon, authenticated;

-- 地點頁：在這裡買過幾本（不顯示是誰）
create or replace function public.place_purchase_count(p_place_id uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.book_purchases where place_id = p_place_id
$$;
grant execute on function public.place_purchase_count(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. 策展：發布前每本書都要有推薦理由；發布中的不能把理由清空
-- ---------------------------------------------------------------------------
create or replace function public.require_item_notes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('published', 'scheduled') and old.status = 'draft'
     and exists (select 1 from public.curation_items i
                 where i.curation_id = new.id and (i.note is null or char_length(trim(i.note)) = 0)) then
    raise exception 'every book needs a note to publish' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists curations_require_notes on public.curations;
create trigger curations_require_notes before update of status on public.curations
  for each row execute function public.require_item_notes();

create or replace function public.keep_item_note_when_live()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.note is null or char_length(trim(new.note)) = 0)
     and (old.note is not null and char_length(trim(old.note)) > 0)
     and exists (select 1 from public.curations c where c.id = new.curation_id and c.status in ('published', 'scheduled')) then
    raise exception 'a published curation cannot clear a note' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists curation_items_keep_note on public.curation_items;
create trigger curation_items_keep_note before update of note on public.curation_items
  for each row execute function public.keep_item_note_when_live();

-- ---------------------------------------------------------------------------
-- 3. 書的單頁「這本書出現在」：處方簽、貼文（策展與店主正在讀沿用 book_appearances）
-- ---------------------------------------------------------------------------
create or replace function public.book_mentions(p_book_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'rx', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'is_open', public.rx_is_open(p), 'count', x.n) order by x.n desc)
        from (select r.prescription_id, count(*) as n from public.prescription_replies r
              where r.book_id = p_book_id and not public.is_blocked_with(r.user_id) group by 1) x
        join public.prescriptions p on p.id = x.prescription_id
        where not public.is_blocked_with(p.user_id)), '[]'::jsonb),
    'posts', coalesce((select jsonb_agg(jsonb_build_object('id', y.id, 'source', y.source, 'body', y.body, 'created_at', y.created_at,
                                            'author_name', y.author_name, 'author_store_slug', y.author_store_slug) order by y.created_at desc)
        from (select * from (
                select e.id, 'diary' as source, e.body, e.created_at, e.author_name, e.author_store_slug from public.public_posts e where e.book_id = p_book_id
                union all
                select n.id, 'note', n.body, n.created_at, n.author_name, n.author_store_slug from public.public_notes n where n.book_id = p_book_id) u
              order by u.created_at desc limit 20) y), '[]'::jsonb),
    'mine', jsonb_build_object(
      'want', exists (select 1 from public.book_saves s where s.user_id = auth.uid() and s.book_id = p_book_id),
      'purchase', (select jsonb_build_object('status', p.status, 'bought_on', p.bought_on) from public.book_purchases p where p.user_id = auth.uid() and p.book_id = p_book_id),
      'reading', (select jsonb_build_object('id', r.id, 'status', r.status) from public.readings r
                  join public.bookstores s on s.id = r.bookstore_id where s.owner_id = auth.uid() and r.book_id = p_book_id))
  )
$$;
grant execute on function public.book_mentions(uuid) to anon, authenticated;
