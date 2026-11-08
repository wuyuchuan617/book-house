-- 上線第一個月的 5 個指標（在 Supabase › SQL Editor 執行；會用到 events、bookstores、curations、follows、reports）

-- 1. 開店率：登入過的人有多少開了書店（近 30 天）
select count(distinct s.owner_id)::float / nullif(count(distinct e.user_id), 0) as store_open_rate
from public.events e
left join public.bookstores s on s.owner_id = e.user_id
where e.name = 'login_success' and e.created_at > now() - interval '30 days';

-- 2. 首檔發布率：開店的人有多少發布了第一檔策展
select count(*) filter (where exists (select 1 from public.curations c where c.bookstore_id = s.id and c.status <> 'draft'))::float
       / nullif(count(*), 0) as first_publish_rate
from public.bookstores s
where s.created_at > now() - interval '30 days';

-- 3. 追蹤率：瀏覽過書店頁的登入者，有多少追蹤了至少一間（近 30 天）
select count(distinct f.follower_id)::float / nullif(count(distinct v.visitor_key), 0) as follow_rate
from public.curation_visits v
left join public.follows f on f.follower_id::text = v.visitor_key
where v.visit_date > current_date - 30;

-- 4. 次月留存：上個月發布過策展的書店，這個月也發布了
with last as (select distinct bookstore_id from public.curations where status <> 'draft' and period = (public.current_period() - interval '1 month')::date),
     this as (select distinct bookstore_id from public.curations where status <> 'draft' and period = public.current_period())
select count(this.bookstore_id)::float / nullif(count(last.bookstore_id), 0) as store_retention
from last left join this using (bookstore_id);

-- 5. 檢舉：近 7 天的檢舉數與處理狀態
select status, count(*) from public.reports where created_at > now() - interval '7 days' group by status;
