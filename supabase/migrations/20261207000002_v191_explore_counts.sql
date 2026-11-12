-- v1.9.1 AL2 探索分頁數：要跟分頁裡實際列得出來的一樣多
-- 書旅＝explore_trips（公開、看得到、至少一站）；處方箋＝rx_list 最新（含已結案，排除封鎖與申請刪除的帳號）
create or replace function public.explore_counts()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'trips', (select count(*) from public.trips t
              where t.status = 'published' and public.trip_visible(t)
                and exists (select 1 from public.trip_stops x where x.trip_id = t.id)),
    'rx', (select count(*) from public.prescriptions p
           join public.profiles pr on pr.id = p.user_id and pr.delete_requested_at is null
           where not public.is_blocked_with(p.user_id)))
$$;

grant execute on function public.explore_counts() to anon, authenticated;
