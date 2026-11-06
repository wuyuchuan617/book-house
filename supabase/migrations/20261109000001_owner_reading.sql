-- M4 店主閱讀與設定：R1–R7、O8、M2 編輯書店、M9 刪除書店

-- ---------------------------------------------------------------------------
-- M2 編輯書店：店主只能改這些欄位（狀態、店主、暫停時間由系統管理）
-- ---------------------------------------------------------------------------
revoke update on public.bookstores from anon, authenticated;
grant update (name, owner_name, tagline, slug, color, avatar_path, banner_path, reading_public_default)
  on public.bookstores to authenticated;

-- 網址規則跟 is_slug_available 一致（保留字不能用）
create or replace function public.guard_bookstore_slug()
returns trigger language plpgsql as $$
begin
  if new.slug is distinct from old.slug
     and lower(new.slug::text) in ('admin', 'api', 'app', 'help', 'login', 'settings', 'store', 'explore', 'www') then
    raise exception 'this address is reserved' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger bookstores_slug_guard before update on public.bookstores
  for each row execute function public.guard_bookstore_slug();

-- M9 刪除書店前顯示影響範圍
create or replace function public.store_delete_impact()
returns table (curation_count int, reading_count int, follower_count int, slug text)
language sql stable security definer set search_path = '' as $$
  select (select count(*)::int from public.curations c where c.bookstore_id = s.id),
         (select count(*)::int from public.readings r where r.bookstore_id = s.id),
         (select count(*)::int from public.follows f where f.bookstore_id = s.id),
         s.slug::text
  from public.bookstores s
  where s.owner_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- R2／O8 記錄一本書：沒指定公開與否就用書店的預設；可附第一則心得
-- 同一本書已在店主閱讀裡 → 回傳原本那筆（App 顯示「已在閱讀中」）
-- ---------------------------------------------------------------------------
create or replace function public.add_reading(
  p_book_id uuid,
  p_status public.reading_status default 'reading',
  p_is_public boolean default null,
  p_note text default null
)
returns public.readings
language plpgsql security definer set search_path = '' as $$
declare
  v_store public.bookstores;
  r public.readings;
begin
  select * into v_store from public.bookstores where owner_id = auth.uid();
  if not found then
    raise exception 'open a bookstore first' using errcode = 'P0002';
  end if;
  select * into r from public.readings where bookstore_id = v_store.id and book_id = p_book_id;
  if found then
    return r;
  end if;
  insert into public.readings (bookstore_id, book_id, status, is_public)
  values (v_store.id, p_book_id, coalesce(p_status, 'reading'), coalesce(p_is_public, v_store.reading_public_default))
  returning * into r;
  if nullif(trim(p_note), '') is not null then
    insert into public.reading_notes (reading_id, body) values (r.id, left(trim(p_note), 1000));
  end if;
  return r;
end $$;

revoke execute on function public.store_delete_impact(), public.add_reading(uuid, public.reading_status, boolean, text),
  public.guard_bookstore_slug() from public, anon, authenticated;
grant execute on function public.store_delete_impact(), public.add_reading(uuid, public.reading_status, boolean, text)
  to authenticated;
