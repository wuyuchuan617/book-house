import { isAppText, tr } from '@/lib/i18n';
/** 把伺服器回傳的英文錯誤換成給使用者看的中文；認不得的一律給通用說明，不露出英文 */
export function userMessage(input: unknown): string {
  const message = input instanceof Error ? input.message : typeof input === 'string' ? input : '';
  const m = message.toLowerCase();
  if (m.includes('content not allowed')) return tr('內容包含不適當的字詞，請修改後再試一次。');
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('failed to send')) return tr('連線不太穩，檢查網路後再試一次。你填的內容還在。');
  if (m.includes('jwt') || m.includes('sign in required') || m.includes('not authenticated')) return tr('登入已經過期，請重新登入。');
  if (m.includes('row-level security') || m.includes('permission denied')) return tr('你沒有權限做這件事。');
  if (m.includes('cannot follow your own')) return tr('不能追蹤自己的書店。');
  if (m.includes('you already have a bookstore')) return tr('你已經開過一間書店了。');
  if (m.includes('bookstores_name_check')) return tr('書店名稱 1–20 個字。');
  if (m.includes('duplicate key')) return tr('這筆資料已經存在了。');
  if (isAppText(message)) return message; // 已經是給使用者看的文字
  return tr('沒有成功，請稍後再試一次。');
}
