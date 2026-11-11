-- v1.7.1：自動開的書店，公開設定的「想讀」「想去」「積讀」預設打開
-- PRD 6.21；畫布 17. v1.7.1
--
-- 原本預設關，結果大部分人的書店頁沒有「想讀想去」分頁（例如 satori）。
-- 個別項目本來就各自有公開／私人（想讀、想去預設公開；私人地點永遠不公開；積讀不顯示金額和在哪買）。
alter table public.bookstores
  alter column show_want  set default true,
  alter column show_place set default true,
  alter column show_owned set default true;

-- 已經自動開好的書店：三個都還是舊預設（全關）的，一起打開。
-- 自己動過其中任何一個開關的（不是三個都關）不動。
update public.bookstores
   set show_want = true, show_place = true, show_owned = true
 where auto_created
   and not show_want and not show_place and not show_owned;
