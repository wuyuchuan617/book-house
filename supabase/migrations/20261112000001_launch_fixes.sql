-- 上架前修正（審查文件 P0／P1）
-- 1. 內容過濾（Guideline 1.2）  2. 管理員：檢舉／回饋即時通知、App 內審核、3 人檢舉自動隱藏
-- 3. 國家圖書館書目（ncl）＋出版社欄位  4. 探索：搜尋所有月份、上個月補位
-- 5. 每月提醒預設開啟、開店 24 小時未發布提醒

alter type public.book_source add value if not exists 'ncl';

-- ---------------------------------------------------------------------------
-- 1. 內容過濾：黑名單字詞（管理員可在 Table Editor 增減）
-- ---------------------------------------------------------------------------
create table public.blocked_terms (
  term       text primary key check (char_length(term) between 1 and 40),
  created_at timestamptz not null default now()
);
alter table public.blocked_terms enable row level security;  -- 沒有 policy：只有後台看得到

insert into public.blocked_terms (term) values
  ('幹你娘'), ('幹您娘'), ('操你媽'), ('操你妈'), ('肏'), ('屄'), ('雞巴'), ('鸡巴'), ('懶叫'), ('機掰'), ('雞掰'),
  ('婊子'), ('賤人'), ('賤貨'), ('破麻'), ('王八蛋'), ('去死吧'), ('廢物去死'), ('智障'), ('腦殘'),
  ('支那豬'), ('黑鬼'), ('死gay'), ('同性戀去死'), ('殺光'),
  ('援交'), ('約炮'), ('約砲'), ('一夜情'), ('裸聊'), ('成人影片'), ('av女優'), ('色情網'),
  ('代辦貸款'), ('免費領取'), ('加line'), ('加賴'), ('私訊賺錢'), ('線上博弈'), ('娛樂城'), ('百家樂'),
  ('fuck'), ('shit'), ('bitch'), ('cunt'), ('nigger'), ('faggot')
on conflict do nothing;

-- 比對前移除空白與標點（避免「幹 你 娘」「f.u.c.k」繞過）
create or replace function public.content_violation(p_text text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(p_text, '') <> '' and exists (
    select 1 from public.blocked_terms b
    where position(lower(regexp_replace(b.term, '[[:space:][:punct:]]', '', 'g'))
                   in lower(regexp_replace(p_text, '[[:space:][:punct:]]', '', 'g'))) > 0
  )
$$;

create or replace function public.guard_content()
returns trigger language plpgsql as $$
declare
  col text;
  val text;
begin
  foreach col in array tg_argv loop
    val := to_jsonb(new) ->> col;
    if public.content_violation(val) then
      raise exception 'content not allowed' using errcode = '23514', detail = col;
    end if;
  end loop;
  return new;
end $$;

create trigger bookstores_content before insert or update of name, owner_name, tagline on public.bookstores
  for each row execute function public.guard_content('name', 'owner_name', 'tagline');
create trigger curations_content before insert or update of title, description on public.curations
  for each row execute function public.guard_content('title', 'description');
create trigger curation_items_content before insert or update of note on public.curation_items
  for each row execute function public.guard_content('note');
create trigger reading_notes_content before insert or update of body on public.reading_notes
  for each row execute function public.guard_content('body');
create trigger tags_content before insert or update of name on public.tags
  for each row execute function public.guard_content('name');
create trigger books_content before insert on public.books
  for each row when (new.source = 'manual') execute function public.guard_content('title');

-- ---------------------------------------------------------------------------
-- 2. 管理員
-- ---------------------------------------------------------------------------
create table public.app_admins (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid())
$$;

alter table public.notification_outbox drop constraint if exists notification_outbox_kind_check;
alter table public.notification_outbox add constraint notification_outbox_kind_check
  check (kind in ('new_curation', 'new_follower', 'monthly_reminder', 'moderation', 'feedback', 'onboarding'));

-- 新檢舉 → 通知管理員；同一間書店 3 位不同的人檢舉（未處理）→ 先自動暫停待審
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
         case when n >= 3 then format('「%s」已被 %s 人檢舉，已自動暫停', coalesce(s.name, '?'), n)
              else format('新檢舉：「%s」', coalesce(s.name, '?')) end,
         coalesce(nullif(new.detail, ''), new.reason::text),
         jsonb_build_object('url', '/admin')
  from public.app_admins a;
  return new;
end $$;

create trigger reports_notify after insert on public.reports
  for each row execute function public.on_report_created();

create or replace function public.on_feedback_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notification_outbox (user_id, kind, title, body, data)
  select a.user_id, 'feedback', '新的意見回饋', left(new.body, 120), jsonb_build_object('url', '/admin')
  from public.app_admins a;
  return new;
end $$;

create trigger feedback_notify after insert on public.feedback
  for each row execute function public.on_feedback_created();

-- App 內審核：待審清單、處理、最近的回饋
create or replace function public.admin_moderation_queue()
returns setof public.moderation_queue language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  return query select * from public.moderation_queue;
end $$;

create or replace function public.admin_paused_stores()
returns table (bookstore_id uuid, store_name text, slug text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  return query select s.id, s.name, s.slug::text from public.bookstores s where s.status = 'paused' order by s.updated_at desc;
end $$;

create or replace function public.admin_moderate(p_bookstore_id uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  perform public.moderate_bookstore(p_bookstore_id, p_action, auth.uid());
end $$;

create or replace function public.admin_recent_feedback()
returns table (id uuid, kind public.feedback_kind, body text, app_version text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  return query select f.id, f.kind, f.body, f.app_version, f.created_at from public.feedback f order by f.created_at desc limit 50;
end $$;

-- ---------------------------------------------------------------------------
-- 3. 書目：出版社欄位、國家圖書館開放資料匯入
-- ---------------------------------------------------------------------------
alter table public.books add column if not exists publisher text check (char_length(publisher) <= 100);

-- p_books: [{isbn13, title, authors[], publisher, published_year}]；以 ISBN 合併既有的書
create or replace function public.upsert_ncl_books(p_books jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare
  b jsonb;
  v_isbn text;
  n int := 0;
begin
  for b in select * from jsonb_array_elements(coalesce(p_books, '[]'::jsonb)) loop
    v_isbn := b->>'isbn13';
    continue when v_isbn is null or v_isbn !~ '^[0-9]{13}$' or coalesce(trim(b->>'title'), '') = '';
    update public.books
       set publisher = coalesce(public.books.publisher, nullif(b->>'publisher', '')),
           published_year = coalesce(public.books.published_year, nullif(b->>'published_year', '')::smallint)
     where isbn13 = v_isbn and merged_into is null;
    if not found then
      insert into public.books (source, external_id, isbn13, title, authors, publisher, published_year)
      values ('ncl', v_isbn, v_isbn, left(trim(b->>'title'), 200),
              coalesce((select array_agg(left(a, 100)) from jsonb_array_elements_text(b->'authors') a where trim(a) <> ''), array['佚名']),
              nullif(left(b->>'publisher', 100), ''),
              nullif(b->>'published_year', '')::smallint)
      on conflict do nothing;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- API 書也記出版社
create or replace function public.upsert_api_books(p_books jsonb)
returns setof public.books
language plpgsql security definer set search_path = '' as $$
declare
  b jsonb;
  v_isbn text;
  r public.books;
begin
  for b in select * from jsonb_array_elements(coalesce(p_books, '[]'::jsonb)) loop
    v_isbn := nullif(b->>'isbn13', '');
    if v_isbn is not null and v_isbn !~ '^[0-9]{13}$' then
      v_isbn := null;
    end if;
    select * into r from public.books
     where source = (b->>'source')::public.book_source and external_id = b->>'external_id';
    if not found and v_isbn is not null then
      select * into r from public.books where isbn13 = v_isbn and merged_into is null;
    end if;
    if found then
      update public.books
         set cover_url = coalesce(public.books.cover_url, nullif(b->>'cover_url', '')),
             publisher = coalesce(public.books.publisher, nullif(left(b->>'publisher', 100), '')),
             published_year = coalesce(public.books.published_year, nullif(b->>'published_year', '')::smallint)
       where id = r.id
      returning * into r;
    else
      insert into public.books (source, external_id, isbn13, title, authors, cover_url, publisher, published_year)
      values ((b->>'source')::public.book_source,
              b->>'external_id',
              v_isbn,
              left(b->>'title', 200),
              coalesce((select array_agg(left(a, 100)) from jsonb_array_elements_text(b->'authors') a), array['佚名']),
              nullif(b->>'cover_url', ''),
              nullif(left(b->>'publisher', 100), ''),
              nullif(b->>'published_year', '')::smallint)
      returning * into r;
    end if;
    return next r;
  end loop;
end $$;

-- 本機書庫搜尋：書名、作者、出版社；13 碼 ISBN 直接比對
create or replace function public.search_local_books(p_query text, p_limit int default 20)
returns setof public.books
language sql stable security definer set search_path = '' as $$
  with q as (
    select trim(p_query) as raw,
           '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat,
           regexp_replace(p_query, '[^0-9]', '', 'g') as digits
  )
  select b.* from public.books b, q
  where b.merged_into is null
    and (b.source <> 'manual' or b.created_by = auth.uid())
    and (
      (char_length(q.digits) = 13 and b.isbn13 = q.digits)
      or b.title ilike q.pat
      or b.publisher ilike q.pat
      or exists (select 1 from unnest(b.authors) a where a ilike q.pat)
    )
  order by (b.isbn13 = q.digits) desc nulls last, (b.title ilike q.raw || '%') desc, (b.cover_url is not null) desc, char_length(b.title)
  limit least(greatest(p_limit, 1), 40)
$$;

-- ---------------------------------------------------------------------------
-- 4. 探索：所有已發布的策展（搜尋用、上個月補位用）
-- ---------------------------------------------------------------------------
create or replace view public.published_feed with (security_invoker = true) as
  select c.id as curation_id, c.title, c.description, c.period, c.published_at,
         s.id as bookstore_id, s.slug, s.name as store_name, s.owner_name, s.color, s.avatar_path,
         s.follower_count,
         (select count(*) from public.curation_items i where i.curation_id = c.id) as book_count,
         array(select b.cover_url from public.curation_items i join public.books b on b.id = i.book_id
               where i.curation_id = c.id order by i.position limit 3) as cover_urls,
         array(select t.slug::text from public.curation_tags ct join public.tags t on t.id = ct.tag_id
               where ct.curation_id = c.id order by t.sort) as tag_slugs,
         array(select b.title from public.curation_items i join public.books b on b.id = i.book_id
               where i.curation_id = c.id order by i.position limit 3) as cover_titles
  from public.curations c
  join public.public_bookstores s on s.id = c.bookstore_id
  where c.status = 'published';

grant select on public.published_feed to anon, authenticated;

create or replace function public.search_explore(p_query text)
returns setof public.explore_feed
language sql stable security invoker set search_path = '' as $$
  with q as (select '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat)
  select f.* from public.published_feed f, q
  where char_length(trim(p_query)) >= 1
    and (f.title ilike q.pat or f.description ilike q.pat
         or f.store_name ilike q.pat or f.owner_name ilike q.pat
         or exists (select 1 from public.curation_items i join public.books b on b.id = i.book_id
                    where i.curation_id = f.curation_id
                      and (b.title ilike q.pat or array_to_string(b.authors, ' ') ilike q.pat)))
  order by (f.period = public.current_period()) desc, f.period desc, f.published_at desc
  limit 50
$$;

-- ---------------------------------------------------------------------------
-- 5. 店主提醒：開店就預設開啟每月提醒；開店 24 小時還沒發布 → 提醒一次
-- ---------------------------------------------------------------------------
create or replace function public.on_bookstore_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.notification_prefs
     set monthly_reminder = true, reminder_day = coalesce(reminder_day, 25)
   where user_id = new.owner_id;
  return new;
end $$;

create trigger bookstores_defaults after insert on public.bookstores
  for each row execute function public.on_bookstore_created();

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
    where s.status = 'active' and np.push
      and s.created_at between now() - interval '72 hours' and now() - interval '24 hours'
      and not exists (select 1 from public.curations c where c.bookstore_id = s.id and c.status <> 'draft')
      and not exists (select 1 from public.notification_outbox o where o.user_id = s.owner_id and o.kind = 'onboarding')
    returning 1
  ) select count(*) into n from ins;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 權限與排程
-- ---------------------------------------------------------------------------
revoke execute on function public.content_violation(text), public.guard_content(), public.is_admin(),
  public.on_report_created(), public.on_feedback_created(), public.admin_moderation_queue(), public.admin_paused_stores(),
  public.admin_moderate(uuid, text), public.admin_recent_feedback(), public.upsert_ncl_books(jsonb),
  public.on_bookstore_created(), public.enqueue_onboarding_nudges()
  from public, anon, authenticated;
-- content_violation 由 trigger 以呼叫者身分執行 → 要讓登入者能執行
grant execute on function public.content_violation(text) to anon, authenticated;
grant execute on function public.is_admin(), public.admin_moderation_queue(), public.admin_paused_stores(),
  public.admin_moderate(uuid, text), public.admin_recent_feedback() to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.upsert_ncl_books(jsonb), public.upsert_api_books(jsonb),
      public.search_local_books(text, int), public.enqueue_onboarding_nudges() to service_role;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('onboarding-nudges', '30 2 * * *', 'select public.enqueue_onboarding_nudges()');
  end if;
end $$;
