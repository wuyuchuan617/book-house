/** 策展期別：每月 1 號（Asia/Taipei，UTC+8、無日光節約） */
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

function taipeiNow() {
  return new Date(Date.now() + TAIPEI_OFFSET_MS);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-01' */
export function currentPeriod() {
  const d = taipeiNow();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
}

export function nextPeriod() {
  const d = taipeiNow();
  const y = d.getUTCMonth() === 11 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1) % 12;
  return `${y}-${pad(m + 1)}-01`;
}

export const monthOf = (period: string) => Number(period.slice(5, 7));

/** 「2026 年 12 月」 */
export const periodLabel = (period: string) => `${period.slice(0, 4)} 年 ${monthOf(period)} 月`;

/** 「本月」「下個月」或空字串 */
export function periodRelative(period: string) {
  if (period === currentPeriod()) return '本月';
  if (period === nextPeriod()) return '下個月';
  return '';
}

/** 「2 天前」「剛剛」 */
export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return '剛剛';
  if (s < 3600) return `${Math.floor(s / 60)} 分鐘前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小時前`;
  return `${Math.floor(s / 86400)} 天前`;
}
