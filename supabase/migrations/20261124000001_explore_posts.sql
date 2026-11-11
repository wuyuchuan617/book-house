-- v1.5 ③：探索 › 貼文（全部／追蹤中／附近），書的地方收進貼文的「地點」檢視
-- PRD 6.18；畫布 E1、E2

-- 探索的貼文：公開的日記貼文（含打卡、正在讀），新到舊；
-- p_filter = 'following'：只看追蹤的書店；'near'：只看有地點的、依距離（位置只用來排序、不儲存）
create or replace function public.explore_posts(
  p_filter text default 'all',
  p_lat double precision default null,
  p_lng double precision default null,
  p_before timestamptz default null,
  p_limit int default 30
) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(x) - 'sort_key' order by x.sort_key nulls last, x.created_at desc), '[]'::jsonb)
  from (
    select p.id, p.created_at, p.entry_date, p.kind, p.body, p.photo_paths, p.page_ref,
           p.book_id, p.book_title, p.book_cover_url,
           p.place_id, p.place_name, p.place_category,
           p.author_name, p.author_store_slug, p.author_store_color, p.author_avatar_path,
           p.user_id = auth.uid() as is_mine,
           case when p_lat is null or pl.lat is null then null
                else (6371000 * 2 * asin(sqrt(power(sin(radians(pl.lat - p_lat) / 2), 2)
                      + cos(radians(p_lat)) * cos(radians(pl.lat)) * power(sin(radians(pl.lng - p_lng) / 2), 2))))::int end as distance_m,
           case when p_filter = 'near' and p_lat is not null and pl.lat is not null
                then power(pl.lat - p_lat, 2) + power((pl.lng - p_lng) * cos(radians(p_lat)), 2) end as sort_key
    from public.public_posts p
    left join public.places pl on pl.id = p.place_id
    where (p_before is null or p.created_at < p_before)
      and (p_filter <> 'following' or exists (
            select 1 from public.follows f where f.follower_id = auth.uid() and f.bookstore_id = p.author_store_id))
      and (p_filter <> 'near' or p.place_id is not null)
    order by case when p_filter = 'near' and p_lat is not null and pl.lat is not null
                  then power(pl.lat - p_lat, 2) + power((pl.lng - p_lng) * cos(radians(p_lat)), 2) end asc nulls last,
             p.created_at desc
    limit greatest(1, least(p_limit, 100))
  ) x
$$;
grant execute on function public.explore_posts(text, double precision, double precision, timestamptz, int) to anon, authenticated;

-- 檢舉：沒有地點的公開貼文也可以檢舉（原本只看公開打卡）
create or replace function public.report_checkin(p_entry_id uuid, p_reason public.report_reason, p_detail text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.public_posts c where c.id = p_entry_id) then
    raise exception 'checkin not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.reports where reporter_id = auth.uid() and target_type::text = 'checkin'
             and target_id = p_entry_id and created_at > now() - interval '24 hours') then
    raise exception 'already reported recently' using errcode = '23505';
  end if;
  insert into public.reports (reporter_id, target_type, target_id, reason, detail)
  values (auth.uid(), 'checkin'::text::public.report_target, p_entry_id, p_reason, nullif(left(trim(p_detail), 500), ''));
end $$;
