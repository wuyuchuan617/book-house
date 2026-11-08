# 書棲 Bookhaus

每個人都能開一間屬於自己的獨立書店，每月用一檔策展分享選書。

- 設計（Design 畫布，畫面編號 A／B／O／M／C／R／S／P）：https://claude.ai/artifact/QXmS1ewfvAfyTrLZHv871k
- PRD v0.3 ＋「資料庫設計」分頁：https://claude.ai/artifact/K3bWgqXsvfJdPqCTVp6vRb

## 技術棧

| 層 | 技術 |
| --- | --- |
| App | Expo SDK 58（React Native）＋ TypeScript ＋ Expo Router |
| 資料 | TanStack Query ＋ Supabase JS |
| 後端 | Supabase：Postgres ＋ RLS、Auth（Apple、Google）、Storage、Edge Functions |
| 上架 | EAS Build／Submit |

## 目錄

```
src/app/            畫面（Expo Router，每個檔案一個畫面）
  (tabs)/           底部分頁：探索 index、收藏 saved、我的書店 my-store（M1 策展列表）
  sign-in.tsx       A1 歡迎／登入
  open-store/       O2 基本資料 → O3 第一檔策展 → O4 放上書架 → O5/O6/O9 完成 → O7 補推薦理由
  curation/[id].tsx C1/C2 新增、C6 編輯策展（草稿自動存檔；已發布按「儲存並更新」）
  curation/preview/ C7 以讀者身分預覽
  store/[slug].tsx  A3／A4 書店頁（策展、店主閱讀）
  reading/[id].tsx  A5 店主閱讀心得時間軸（讀者）
  book/[id].tsx     書籍視角：哪些書店推薦過這本書
  reading/new.tsx   R2／R4 記錄一本書、O8 記錄正在讀的書
  reading/manage/   R5 店主閱讀編輯（狀態、公開、心得增改刪）
  store-edit.tsx    M2 編輯書店資料（網址即時檢查）
  store-delete.tsx  M9 刪除書店（輸入店名確認）
  report/[id].tsx   A7 檢舉書店
  blocked.tsx       設定 › 已封鎖的帳號
  s/[slug]+api.ts   P4 網頁版唯讀書店頁（伺服器端產生 HTML＋連結預覽）
  +native-intent.tsx P5 分享連結 /s/<slug> → App 內書店頁
  help.tsx          M7 說明與意見回饋
  privacy+api.ts    隱私權政策（網頁）
  terms+api.ts      服務條款（網頁）
  settings.tsx      M3 設定
src/components/     共用 UI：book-picker（S1 選書＋C4 手動新增＋C5 推薦理由）、
                    curation-actions（C7 更多操作＋C8 刪除確認）、tag-picker、login-gate（A9）
src/lib/            supabase client、auth、資料查詢
src/constants/      design tokens（對照畫布 S7）
supabase/
  migrations/       資料庫 schema、函式、RLS、檢視表、Storage
  seed.sql          V1 固定主題標籤（清單待 PM 確認）
  functions/        Edge Functions（book-search：S1 選書搜尋）
  tests/            本機 Postgres 煙霧測試（M1＋M2，共 22 項預期錯誤＋流程斷言）
```

## 開始開發

1. 安裝套件：`npm install`
2. 環境變數：`cp .env.example .env`，填入 Supabase 專案的 anon key（Supabase › Project Settings › API）。
3. 連結 EAS 專案（會同步 owner 與 slug 到 `app.json`）：
   ```bash
   npm install --global eas-cli
   eas init --id ba7482cb-dd1b-4394-a5f6-78279dc90078
   ```
4. 啟動：`npx expo start`。Apple 登入需要 development build（`eas build --profile development`），Expo Go 不能測。

## 資料庫

```bash
# 套用到 Supabase 專案（需要 Supabase CLI）
supabase link --project-ref weadwadmdgddoiscpyyd
supabase db push
psql "$SUPABASE_DB_URL" -f supabase/seed.sql

# 部署選書搜尋（S1）；Google Books 金鑰選填，沒填也能查但配額較低
supabase functions deploy book-search
supabase secrets set GOOGLE_BOOKS_API_KEY=你的金鑰

# 產生 TypeScript 型別
npm run db:types

# 本機測試（只需要 Postgres 16，不需要 Docker）
PGHOST=localhost npm run db:test
```

`supabase/tests/local_stub.sql` 只用來在本機模擬 Supabase 的 auth 與角色，**不要**在 Supabase 上執行。

## 登入設定（Supabase › Authentication › Providers）

- **Google**：在 Google Cloud 專案（編號 615212305739）建立 OAuth 用戶端（Web application），把 Client ID／Secret 填進 Supabase；Authorized redirect URI 填 `https://weadwadmdgddoiscpyyd.supabase.co/auth/v1/callback`。
- **Apple**：Apple Developer › Identifiers 為 `com.bookhaus.app` 開啟 Sign in with Apple；在 Supabase 的 Apple provider 把 `com.bookhaus.app` 加進 Client IDs。
- **Redirect URL**：Supabase › Authentication › URL Configuration 加入 `bookhaus://auth/callback`（以及開發用的 `exp://**`）。

Bundle ID／package 目前暫定 `com.bookhaus.app`，送審前確認。

## 開發進度（PRD 第 10 節）

- [x] M1 骨架：導覽、Apple／Google 登入、訪客模式與登入引導、資料庫 schema 與 RLS
- [x] M2 開店與策展：O3–O9、C1–C8、選書元件 S1、`book-search` Edge Function（O8 記錄正在讀的書隨 M4 店主閱讀一起做）
- [x] M3 逛店與互動：A2 搜尋與主題篩選、A3／A4 書店頁（策展＋店主閱讀）、A5 心得時間軸、書籍視角、B1／B2 收藏
- [x] M4 店主閱讀與設定：R1–R7、O8、M2 編輯書店、M9 刪除書店、設定頁書店區（通知 push 延到 M5，頭貼／背景圖上傳延到 M6）
- [x] M5 安全與分享：A6–A8 檢舉／封鎖、已封鎖的帳號、審核佇列、P4 網頁版書店頁、P5 分享連結與深層連結（推播通知移到 M6：需要 development build）
- [x] M6 打磨與上架：熊貓 App icon（方案 A）、推播通知與每月提醒、頭貼／背景圖上傳、離線提示、埋點、說明與意見回饋、服務條款／隱私權政策、EAS build 設定、上架介紹圖（V3）

### M2 的產品規則（已寫進資料庫）

- 策展只能建在「本月」或「下個月」。本月 → 發布後立刻上架；下個月 → 預約，月初 00:05（台北）由排程上架。
- 每間書店每月最多一檔發布中／預約中的策展；草稿不限。
- 發布條件：有標題、至少 1 本書。發布中的策展至少要留 1 本書（想清空請先取消發布）。
- 一檔最多 20 本書、3 個主題標籤；推薦理由 120 字內。自訂標籤 1–12 字，同名沿用既有標籤。
- 書架排序目前用「往前移／往後移」（無障礙也好操作）；拖曳排序留到 M6 打磨。

## 網頁版書店頁（P4）與分享連結（P5）

分享連結格式是 `<網站>/s/<書店網址>`。網站用 EAS Hosting（Expo 的網頁主機）：

```bash
npx expo export --platform web
eas deploy                      # 第一次會請你取一個名稱，例如 book-house → https://book-house.expo.app
# 伺服器端也要讀得到 Supabase 設定
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://weadwadmdgddoiscpyyd.supabase.co --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key> --visibility plaintext
eas deploy --prod
```

部署後把 `.env` 的 `EXPO_PUBLIC_WEB_URL` 設成那個網址，App 裡的分享連結就會指向它。

讓「有裝 App 的人點連結直接開 App」（Universal Links／App Links）需要自己的網域，等網域確定後：
`app.json` 加 `ios.associatedDomains: ["applinks:<網域>"]` 與 Android `intentFilters`，並在網站放 `/.well-known/apple-app-site-association`、`assetlinks.json`。App 端的路徑對應已經寫好（`src/app/+native-intent.tsx`）。

## 檢舉審核

檢舉會進 `reports` 表。在 Supabase › SQL Editor：

```sql
select * from moderation_queue;                                   -- 待審核（依檢舉人數排序）
select moderate_bookstore('<bookstore_id>', 'pause');             -- 暫停營業：讀者看不到，檢舉標記為已處理
select moderate_bookstore('<bookstore_id>', 'restore');           -- 恢復營業
select moderate_bookstore('<bookstore_id>', 'dismiss');           -- 檢舉不成立
```

## 推播通知（需要 development build）

通知會先排進 `notification_outbox`（新策展上架→追蹤者、有人追蹤→店主、每月策展提醒），再由 `push-dispatch` 每分鐘送到 Expo Push。

```bash
supabase functions deploy push-dispatch --no-verify-jwt
supabase secrets set CRON_SECRET=<一串隨機字>
```

在 Supabase › Database › Extensions 開啟 `pg_cron` 與 `pg_net`，然後在 SQL Editor 執行一次（把 `<一串隨機字>` 換成上面那串）：

```sql
select cron.schedule('push-dispatch', '* * * * *', $$
  select net.http_post(
    url := 'https://weadwadmdgddoiscpyyd.supabase.co/functions/v1/push-dispatch',
    headers := jsonb_build_object('x-cron-secret', '<一串隨機字>')
  )
$$);
select cron.schedule('monthly-curation-reminders', '0 1 * * *', 'select public.enqueue_monthly_reminders()');
select cron.schedule('promote-scheduled-curations', '5 * * * *', 'select public.promote_scheduled_curations()');
select cron.schedule('purge-deleted-accounts', '0 19 * * *', 'select public.purge_deleted_accounts()');
```

（後三個排程在 migration 裡也有寫，但只有在 pg_cron 已開啟時才會建立；先開 pg_cron 再執行這段最保險。）

## 三個版本可以同時裝

`app.config.ts` 依 `APP_VARIANT`（在 `eas.json` 各 profile 設定）改名稱與 bundle ID：

| profile | 手機上的名稱 | iOS bundle ID／Android package |
| --- | --- | --- |
| development | 書棲 Dev | `com.bookhaus.app.dev` |
| preview | 書棲 Preview | `com.bookhaus.app.preview` |
| production | 書棲 Bookhaus | `com.bookhaus.app` |

Apple 登入：Supabase › Authentication › Providers › Apple 的 Client IDs 要填三個（逗號分隔）：`com.bookhaus.app,com.bookhaus.app.dev,com.bookhaus.app.preview`。
三個版本共用 `bookhaus://` 網址，Google 登入的回跳不受影響。

## Development build 與送審

```bash
eas build --profile development --platform ios      # 第一次會引導建立 Apple 憑證；裝到手機後用 npx expo start 開發
eas build --profile production --platform all
eas submit --platform ios
```

送審清單：
- App Store Connect 建立 App（Bundle ID `com.bookhaus.app`），填隱私權政策網址 `<網站>/privacy`、支援網址 `<網站>/terms`
- 上架介紹圖：`store-assets/ios/ios-6.9-1.png`～`5.png`（1290×2796，V3「熊貓一家」）
- App 隱私（營養標籤）：聯絡資訊（名稱、電子郵件）、使用者內容、識別碼（使用者 ID）、使用資料（產品互動）；都「連結到使用者」、「不用於追蹤」
- 審核備註：提供一組可登入的測試帳號（Google），說明檢舉／封鎖在書店頁 ⋯、刪除帳號在設定
- 內容分級：使用者產生內容 → 需有檢舉、封鎖、條款（都已完成）

## v1.1（想讀、探索、外觀、條款）

- **想讀清單**：原本的「收藏的書」改名「想讀」，和店主閱讀的「想讀」是同一份（`book_saves`）。每本可寫「為什麼想讀」「在哪看到」；店主按「開始讀」會移到在讀，理由變成第一則心得（`start_reading_from_save`）。
- **探索**：全部／追蹤中、月份切換（只列有策展的月份）、推薦／最新／熱門、已逛過標示與「只看沒逛過」（`explore_list`、`explore_months`）。推薦＝沒逛過優先＋口味（逛過、收藏、追蹤的主題標籤）＋品質＋新舊；熱門＝近 7 天拜訪＋3×收藏＋5×新追蹤。
- **設定**：外觀（跟隨系統／淺色／深色）；服務條款、隱私權政策改為 App 內頁面（`/legal/terms`、`/legal/privacy`），網頁版保留。
- **英文介面**：下一步（語言：跟隨系統／繁體中文／English）。

## 上架前修正（審查文件 P0／P1）

- **內容過濾**：`blocked_terms` 表是黑名單字詞（店名、介紹、策展標題與說明、推薦理由、心得、標籤、手動新增的書名都會檢查）。在 Table Editor 直接新增或刪除字詞即可。
- **管理員**：把自己加進管理員，之後新檢舉、新回饋都會推播給你，設定頁會出現「審核後台」：
  ```sql
  insert into app_admins (user_id) select id from auth.users where email = '你的登入信箱';
  ```
  同一間書店被 3 位不同的人檢舉（未處理）會先自動暫停，等你在後台決定恢復或維持。
- **國家圖書館書目**：在自己的電腦執行（service role key 不要放進 App 或 Git）：
  ```bash
  SUPABASE_URL=https://weadwadmdgddoiscpyyd.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service role key> npm run books:import-ncl
  ```
  之後每月執行一次 `... npm run books:import-ncl -- --latest 1`。資料從 2025 年起（出版社申請 ISBN 時的書目），更早的書仍靠 Google Books、Open Library 與掃條碼。
- **掃書背條碼**：選書時搜尋框右邊的掃描按鈕（需要相機權限，開發版要重新打包）。
- **即時更新（EAS Update）**：修文案、小 bug 不用重新送審：`eas update --channel production --message "說明"`。改到原生設定（套件、權限）時仍要重新打包。
- **指標**：`supabase/queries/metrics.sql` 有上線第一個月要看的 5 個查詢。
- **聯絡信箱**：在 `.env` 與 EAS 各環境設定 `EXPO_PUBLIC_CONTACT_EMAIL`，說明頁、條款、隱私權政策都會顯示。

## 上架前檢查

- Supabase › Authentication › URL Configuration：開發期間 Site URL 暫設為 Expo Go 的 `exp://<電腦IP>:8081/--/auth/callback`（換 Wi-Fi 要跟著改）。打包 development build／送審前改回 `bookhaus://auth/callback`。
- Supabase › Database › Extensions 開啟 `pg_cron`，再重跑 `supabase/migrations/20261106000004_storage_and_cron.sql` 與 `20261107000001_curation_flow.sql` 最後的排程段落（刪除帳號、預約策展上架）。
- 設定 `.env` 的 `EXPO_PUBLIC_CONTACT_EMAIL`（條款與隱私權政策上的聯絡信箱），並請法律專業人士看過 `src/lib/legal.ts`。
- Google Books 金鑰：`supabase secrets set GOOGLE_BOOKS_API_KEY=…`（沒有金鑰時 Supabase 共用 IP 很快遇到 429，會改查 Open Library）。

## 之後再做（V2）

- 拖曳排序書架、滑動刪除店主閱讀（目前用「往前移／往後移」與 ⋯ 選單）
- 連結預覽圖（店面顏色＋書封自動產生）、QR Code、分享圖
- 暫停營業、外觀設定（深色模式已跟隨系統）
- Email 通知、延遲深層連結（下載後自動打開那間書店）

## 待決定（PRD 第 11 節）

書目來源（Google Books 中文書涵蓋度）、主題標籤清單、刪除帳號反悔天數、檢舉審核人力、分析工具。
