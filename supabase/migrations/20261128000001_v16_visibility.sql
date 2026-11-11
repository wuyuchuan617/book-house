-- v1.6 補充：書店頁看不到想讀、處方簽
-- 1. 想讀、想去一律跟著公開設定（再補一次，舊 App 新增的也算）
alter table public.book_saves alter column is_public set default true;
alter table public.place_saves alter column is_public set default true;
update public.book_saves set is_public = true where not is_public;
update public.place_saves set is_public = true where not is_public;

-- 2. 處方簽發起後可以改「匿名／顯示書店名稱」（匿名的不會出現在書店頁）
grant update (anonymous) on public.prescriptions to authenticated;
