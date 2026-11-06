-- Bookhaus（書棲）schema v0.3
-- 對照：PRD v0.3「資料庫設計」分頁。所有主鍵 uuid、時間 timestamptz。

create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
create type public.store_color as enum ('moss', 'mist', 'olive', 'wisteria', 'clay', 'ochre');
create type public.store_status as enum ('active', 'paused', 'deleted');
create type public.curation_status as enum ('draft', 'scheduled', 'published'); -- scheduled = V2
create type public.tag_kind as enum ('system', 'custom');                         -- custom = V2
create type public.book_source as enum ('google_books', 'open_library', 'manual');
create type public.reading_status as enum ('reading', 'finished');
create type public.report_target as enum ('bookstore', 'curation', 'reading_note');
create type public.report_reason as enum ('inappropriate', 'infringement', 'spam', 'impersonation', 'other');
create type public.report_status as enum ('open', 'reviewing', 'actioned', 'dismissed');
create type public.feedback_kind as enum ('suggestion', 'bug', 'other');

-- ---------------------------------------------------------------------------
-- 2. 使用者與書店
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  display_name        text not null check (char_length(display_name) between 1 and 40),
  avatar_url          text,
  locale              text check (locale in ('zh-Hant', 'en')),
  delete_requested_at timestamptz,
  delete_reason       text check (char_length(delete_reason) <= 500),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.bookstores (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null unique references public.profiles (id) on delete cascade, -- 一人一店
  name                   text not null check (char_length(name) between 1 and 20),
  owner_name             text not null check (char_length(owner_name) between 1 and 20),
  tagline                text check (char_length(tagline) <= 60),
  slug                   extensions.citext not null unique
                         check (slug ~ '^[a-z0-9]([a-z0-9-]{1,28})[a-z0-9]$'),
  color                  public.store_color not null default 'moss',
  avatar_path            text,
  banner_path            text,
  status                 public.store_status not null default 'active',
  paused_until           timestamptz, -- V2
  reading_public_default boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. 策展與書
-- ---------------------------------------------------------------------------
create table public.curations (
  id            uuid primary key default gen_random_uuid(),
  bookstore_id  uuid not null references public.bookstores (id) on delete cascade,
  period        date not null check (period = date_trunc('month', period)::date),
  title         text check (char_length(title) <= 24),
  description   text check (char_length(description) <= 500),
  status        public.curation_status not null default 'draft',
  published_at  timestamptz,
  scheduled_for timestamptz, -- V2
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint published_needs_title check (status = 'draft' or (title is not null and char_length(title) > 0))
);
-- 每間書店每月只有一檔已發布／已預約；草稿不限
create unique index curations_one_live_per_month
  on public.curations (bookstore_id, period)
  where status in ('published', 'scheduled');
create index curations_explore_idx on public.curations (status, period desc, published_at desc);
create index curations_store_idx on public.curations (bookstore_id, period desc);

create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  slug       extensions.citext not null unique,
  name       text not null check (char_length(name) between 1 and 20),
  kind       public.tag_kind not null default 'system',
  sort       int not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.curation_tags (
  curation_id uuid not null references public.curations (id) on delete cascade,
  tag_id      uuid not null references public.tags (id) on delete cascade,
  primary key (curation_id, tag_id)
);
create index curation_tags_tag_idx on public.curation_tags (tag_id);

create table public.books (
  id             uuid primary key default gen_random_uuid(),
  source         public.book_source not null,
  external_id    text,
  isbn13         text check (isbn13 ~ '^[0-9]{13}$'),
  title          text not null check (char_length(title) between 1 and 200),
  authors        text[] not null check (cardinality(authors) >= 1),
  cover_url      text,
  published_year smallint,
  created_by     uuid references public.profiles (id) on delete set null,
  merged_into    uuid references public.books (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint manual_has_no_external check (source <> 'manual' or external_id is null),
  constraint api_has_external check (source = 'manual' or external_id is not null)
);
create unique index books_source_external_uidx on public.books (source, external_id) where external_id is not null;
create unique index books_isbn_uidx on public.books (isbn13) where isbn13 is not null and merged_into is null;
create index books_title_trgm_idx on public.books using gin (title extensions.gin_trgm_ops);

create table public.curation_items (
  id          uuid primary key default gen_random_uuid(),
  curation_id uuid not null references public.curations (id) on delete cascade,
  book_id     uuid not null references public.books (id),
  note        text check (char_length(note) <= 120),
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (curation_id, book_id)
);
create index curation_items_book_idx on public.curation_items (book_id);
create index curation_items_order_idx on public.curation_items (curation_id, position);

-- ---------------------------------------------------------------------------
-- 4. 店主閱讀（不記錄閱讀進度）
-- ---------------------------------------------------------------------------
create table public.readings (
  id           uuid primary key default gen_random_uuid(),
  bookstore_id uuid not null references public.bookstores (id) on delete cascade,
  book_id      uuid not null references public.books (id),
  status       public.reading_status not null default 'reading',
  is_public    boolean not null default true,
  started_at   date not null default current_date,
  finished_at  date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (bookstore_id, book_id)
);
create index readings_store_idx on public.readings (bookstore_id, updated_at desc);

create table public.reading_notes (
  id         uuid primary key default gen_random_uuid(),
  reading_id uuid not null references public.readings (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reading_notes_timeline_idx on public.reading_notes (reading_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. 互動
-- ---------------------------------------------------------------------------
create table public.follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  bookstore_id uuid not null references public.bookstores (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, bookstore_id)
);
create index follows_store_idx on public.follows (bookstore_id);

create table public.book_saves (
  user_id           uuid not null references public.profiles (id) on delete cascade,
  book_id           uuid not null references public.books (id) on delete cascade,
  from_curation_id  uuid references public.curations (id) on delete set null,
  from_bookstore_id uuid references public.bookstores (id) on delete set null,
  created_at        timestamptz not null default now(),
  primary key (user_id, book_id)
);
create index book_saves_recent_idx on public.book_saves (user_id, created_at desc);

-- 同一人（或同一訪客裝置）同一天同一檔只算 1 次
create table public.curation_visits (
  curation_id uuid not null references public.curations (id) on delete cascade,
  visitor_key text not null check (char_length(visitor_key) between 8 and 128),
  visit_date  date not null default current_date,
  created_at  timestamptz not null default now(),
  primary key (curation_id, visitor_key, visit_date)
);

-- ---------------------------------------------------------------------------
-- 6. 安全、通知與回饋
-- ---------------------------------------------------------------------------
create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  target_type  public.report_target not null,
  target_id    uuid not null,
  reason       public.report_reason not null,
  detail       text check (char_length(detail) <= 500),
  also_blocked boolean not null default false,
  status       public.report_status not null default 'open',
  reviewed_by  uuid,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index reports_queue_idx on public.reports (status, created_at);
create index reports_dedupe_idx on public.reports (reporter_id, target_type, target_id, created_at desc);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

create table public.notification_prefs (
  user_id                    uuid primary key references public.profiles (id) on delete cascade,
  new_curation_from_followed boolean not null default true,
  new_follower               boolean not null default true,
  monthly_reminder           boolean not null default false, -- V2
  reminder_day               smallint check (reminder_day in (20, 25, -3)),
  push                       boolean not null default true,
  email                      boolean not null default false,
  updated_at                 timestamptz not null default now()
);

create table public.push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  token      text not null unique,
  platform   text not null check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles (id) on delete set null,
  kind        public.feedback_kind not null,
  body        text not null check (char_length(body) between 1 and 2000),
  app_version text,
  created_at  timestamptz not null default now()
);
