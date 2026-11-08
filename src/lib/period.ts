import { tr } from '@/lib/i18n';
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

export function previousPeriod() {
  const d = taipeiNow();
  const y = d.getUTCMonth() === 0 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
  const m = d.getUTCMonth() === 0 ? 12 : d.getUTCMonth();
  return `${y}-${pad(m)}-01`;
}

export const monthOf = (period: string) => Number(period.slice(5, 7));

/** 「2026 年 12 月」 */
export const periodLabel = (period: string) => tr('{p0} 年 {p1} 月', { p0: period.slice(0, 4), p1: monthOf(period) });

/** 「本月」「下個月」或空字串 */
export function periodRelative(period: string) {
  if (period === currentPeriod()) return tr('本月');
  if (period === nextPeriod()) return tr('下個月');
  return '';
}

/** 「2 天前」「剛剛」 */
export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return tr('剛剛');
  if (s < 3600) return tr('{p0} 分鐘前', { p0: Math.floor(s / 60) });
  if (s < 86400) return tr('{p0} 小時前', { p0: Math.floor(s / 3600) });
  return tr('{p0} 天前', { p0: Math.floor(s / 86400) });
}

/** 'YYYY-MM-DD'（台北今天） */
export function taipeiToday() {
  const d = taipeiNow();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** period 加 n 個月 */
export function addMonths(period: string, n: number) {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7)) - 1 + n;
  return `${y + Math.floor(m / 12)}-${pad(((m % 12) + 12) % 12 + 1)}-01`;
}

/** 可以排策展的最後一個月（本月起 4 個月內） */
export const lastOpenPeriod = () => addMonths(currentPeriod(), 3);

/** 預約時間（timestamptz）→ 台北的 'M/D' 與 'YYYY-MM-DD' */
export function taipeiDate(iso: string) {
  const d = new Date(new Date(iso).getTime() + TAIPEI_OFFSET_MS);
  return { md: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`, ymd: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` };
}
