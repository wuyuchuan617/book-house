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
  (tabs)/           底部分頁：探索 index、收藏 saved、我的書店 my-store
  sign-in.tsx       A1 歡迎／登入
  open-store.tsx    O2 開店步驟 1
  store/[slug].tsx  A3 書店頁
  settings.tsx      M3 設定
src/components/     共用 UI（含 A9 登入引導 login-gate）
src/lib/            supabase client、auth、資料查詢
src/constants/      design tokens（對照畫布 S7）
supabase/
  migrations/       資料庫 schema、函式、RLS、檢視表、Storage
  seed.sql          V1 固定主題標籤（清單待 PM 確認）
  tests/            本機 Postgres 煙霧測試（14 項權限與業務規則）
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
- [ ] M2 開店與策展：O3–O6、C1–C8、選書元件 S1、`book-search` Edge Function
- [ ] M3 逛店與互動：搜尋與主題篩選、A4 店主閱讀分頁、書籍視角、B2 收藏的書
- [ ] M4 店主閱讀與設定：R1–R7、M2 編輯書店、通知、刪除書店
- [ ] M5 安全與分享：檢舉、封鎖、審核、網頁版書店頁、深層連結
- [ ] M6 打磨與上架：空／錯誤狀態、無障礙、埋點、送審

## 待決定（PRD 第 11 節）

書目來源（Google Books 中文書涵蓋度）、主題標籤清單、刪除帳號反悔天數、檢舉審核人力、分析工具。
