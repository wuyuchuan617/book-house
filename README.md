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
- [ ] M4 店主閱讀與設定：R1–R7、M2 編輯書店、通知、刪除書店
- [ ] M5 安全與分享：檢舉、封鎖、審核、網頁版書店頁、深層連結
- [ ] M6 打磨與上架：空／錯誤狀態、無障礙、埋點、送審

### M2 的產品規則（已寫進資料庫）

- 策展只能建在「本月」或「下個月」。本月 → 發布後立刻上架；下個月 → 預約，月初 00:05（台北）由排程上架。
- 每間書店每月最多一檔發布中／預約中的策展；草稿不限。
- 發布條件：有標題、至少 1 本書。發布中的策展至少要留 1 本書（想清空請先取消發布）。
- 一檔最多 20 本書、3 個主題標籤；推薦理由 120 字內。自訂標籤 1–12 字，同名沿用既有標籤。
- 書架排序目前用「往前移／往後移」（無障礙也好操作）；拖曳排序留到 M6 打磨。

## 上架前檢查

- Supabase › Authentication › URL Configuration：開發期間 Site URL 暫設為 Expo Go 的 `exp://<電腦IP>:8081/--/auth/callback`（換 Wi-Fi 要跟著改）。打包 development build／送審前改回 `bookhaus://auth/callback`。
- Supabase › Database › Extensions 開啟 `pg_cron`，再重跑 `supabase/migrations/20261106000004_storage_and_cron.sql` 與 `20261107000001_curation_flow.sql` 最後的排程段落（刪除帳號、預約策展上架）。
- Google Books 金鑰：`supabase secrets set GOOGLE_BOOKS_API_KEY=…`（沒有金鑰時 Supabase 共用 IP 很快遇到 429，會改查 Open Library）。

## 待決定（PRD 第 11 節）

書目來源（Google Books 中文書涵蓋度）、主題標籤清單、刪除帳號反悔天數、檢舉審核人力、分析工具。
