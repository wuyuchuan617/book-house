/**
 * P4 網頁版唯讀書店頁（沒裝 App 的人點分享連結會看到這頁）＋P5 連結預覽（Open Graph）
 * 部署：EAS Hosting（npx expo export --platform web && eas deploy）
 * 網頁版只能看：不做登入、追蹤、收藏、編輯；按鈕一律導去 App 或商店
 */
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const IOS_STORE_URL = process.env.EXPO_PUBLIC_IOS_STORE_URL ?? '';
const ANDROID_STORE_URL = process.env.EXPO_PUBLIC_ANDROID_STORE_URL ?? '';

const COLORS: Record<string, string> = {
  moss: '#667659', mist: '#5E7594', olive: '#857039', wisteria: '#6E5A9E', clay: '#9A6457', ochre: '#8B4F37',
};

type Store = { id: string; slug: string; name: string; owner_name: string; tagline: string | null; color: string; follower_count: number };
type Item = { note: string | null; position: number; books: { title: string; authors: string[]; cover_url: string | null } };
type Curation = { id: string; period: string; title: string; description: string | null; curation_items: Item[] };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : one + 's'}`;

/** 網頁版文字（?lang=en 或瀏覽器語言是英文時用英文） */
const TEXT = {
  zh: {
    html: 'zh-Hant', site: '書棲 Bookhaus', brand: '書棲', app: '書棲 App', barSub: '追蹤這間書店，新策展第一個知道',
    notFoundTitle: '找不到這間書店｜書棲', notFound: '找不到這間書店', typo: '這個連結可能打錯了。',
    errDesc: '暫時無法載入，請稍後再試。', errH: '暫時無法載入', errP: '請稍後再試一次。',
    pausedTitle: '暫停營業中｜書棲', pausedDesc: '這間書店目前沒有營業。', pausedH: '這間書店暫停營業中', pausedP: '可能已經關閉，或店主暫時休息。到書棲 App 看看其他書店吧。',
    month: (m: number) => `${m} 月策展`, books: (n: number) => `${n} 本書`,
    ownerIndie: (o: string) => `${o} 的獨立書店 · 書棲`, owner: (o: string, f: number) => `店主 ${o} · ${f} 人追蹤`,
    authorSep: '、', more: (n: number) => `還有 ${n} 本，在 App 裡看完整書架`,
    empty: '這間書店還沒有發布策展。追蹤後，新策展上架時會通知你。', follow: (n: string) => `在 App 追蹤「${n}」`,
    download: '還沒有 App？前往下載', hint: '沒有 App 會前往 App Store／Google Play；裝好後再點一次連結就會打開這間書店',
    titleSep: '｜', curTitle: (name: string, m: number, t: string) => `${name}｜${m} 月策展：${t}`,
  },
  en: {
    html: 'en', site: 'Bookhaus', brand: 'Bookhaus', app: 'Bookhaus app', barSub: 'Follow this bookstore to hear about new curations first',
    notFoundTitle: 'Bookstore not found | Bookhaus', notFound: 'Bookstore not found', typo: 'This link may be mistyped.',
    errDesc: 'Couldn’t load right now. Please try again later.', errH: 'Couldn’t load', errP: 'Please try again in a moment.',
    pausedTitle: 'Temporarily closed | Bookhaus', pausedDesc: 'This bookstore isn’t open right now.', pausedH: 'This bookstore is closed for now', pausedP: 'It may have closed, or the owner is taking a break. Find other bookstores in the Bookhaus app.',
    month: (m: number) => `${MONTHS[m - 1]} curation`, books: (n: number) => plural(n, 'book'),
    ownerIndie: (o: string) => `${o}’s indie bookstore · Bookhaus`, owner: (o: string, f: number) => `By ${o} · ${plural(f, 'follower')}`,
    authorSep: ', ', more: (n: number) => `${plural(n, 'more book')} — see the full shelf in the app`,
    empty: 'No curations yet. Follow to get notified when one goes live.', follow: (n: string) => `Follow “${n}” in the app`,
    download: 'Don’t have the app? Download it', hint: 'Without the app you’ll go to the App Store / Google Play. Once installed, tap the link again to open this bookstore.',
    titleSep: ' | ', curTitle: (name: string, m: number, t: string) => `${name} | ${MONTHS[m - 1]} curation: ${t}`,
  },
};
type Text = (typeof TEXT)['zh'];

function langOf(request: Request, url: URL): Text {
  const q = url.searchParams.get('lang');
  if (q === 'en' || q === 'zh') return TEXT[q];
  return (request.headers.get('accept-language') ?? '').toLowerCase().startsWith('en') ? TEXT.en : TEXT.zh;
}

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
  if (!res.ok) throw new Error(`supabase ${res.status}`);
  return (await res.json()) as T;
}

function page(L: Text, { title, description, body, status = 200, url }: { title: string; description: string; body: string; status?: number; url: string }) {
  const html = `<!doctype html>
<html lang="${L.html}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${L.site}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary">
${status === 200 ? '' : '<meta name="robots" content="noindex">'}
<style>
  :root { --bg:#F3EFE8; --surface:#FFFFFF; --text:#1F1B16; --muted:#5F574E; --primary:#8B4F37; --border:#DCD3C6; }
  @media (prefers-color-scheme: dark) { :root { --bg:#1F1B16; --surface:#2A251F; --text:#F3EFE8; --muted:#C9BCAB; --primary:#D9997C; --border:#4A4238; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.6 -apple-system, "PingFang TC", "Noto Sans TC", system-ui, sans-serif; }
  main { max-width:560px; margin:0 auto; padding:0 16px 48px; }
  .bar { display:flex; align-items:center; gap:12px; background:var(--surface); border-bottom:1px solid var(--border); padding:10px 16px; position:sticky; top:0; }
  .bar b { display:block; font-size:14px; } .bar small { color:var(--muted); font-size:12px; }
  .logo { width:36px; height:36px; border-radius:9px; background:var(--primary); color:#fff; display:grid; place-items:center; font-weight:700; }
  .btn { display:inline-flex; align-items:center; justify-content:center; min-height:44px; padding:0 18px; border-radius:14px; background:var(--primary); color:#fff; font-weight:700; text-decoration:none; }
  .bar .btn { margin-left:auto; min-height:40px; font-size:14px; }
  .hero { margin:16px 0; border-radius:16px; padding:20px; color:#fff; }
  .hero h1 { margin:0; font-size:24px; font-family: ui-serif, "Noto Serif TC", serif; }
  .hero p { margin:4px 0 0; }
  .avatar { width:52px; height:52px; border-radius:15px; background:rgba(255,255,255,.2); border:2px solid rgba(255,255,255,.6); display:grid; place-items:center; font-size:22px; font-weight:700; margin-bottom:12px; }
  h2 { font-size:20px; margin:8px 0 4px; font-family: ui-serif, "Noto Serif TC", serif; }
  .label { font-size:13px; font-weight:700; color:var(--muted); }
  .card { background:var(--surface); border-radius:16px; padding:16px; margin-top:12px; }
  .book { display:flex; gap:12px; padding:8px 0; }
  .cover { width:52px; height:78px; border-radius:3px; flex:none; color:#fff; font-size:10px; font-weight:700; padding:5px; display:flex; align-items:flex-end; overflow:hidden; object-fit:cover; }
  .book b { display:block; } .book small { color:var(--muted); } .book p { margin:6px 0 0; font-size:13px; }
  .more { text-align:center; color:var(--muted); font-size:13px; margin:12px 0 0; }
  .cta { display:flex; flex-direction:column; align-items:stretch; gap:8px; margin-top:24px; text-align:center; }
  .cta small { color:var(--muted); font-size:12px; }
</style>
</head>
<body>
<div class="bar"><div class="logo">書</div><div><b>${L.app}</b><small>${L.barSub}</small></div></div>
<main>${body}</main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60, s-maxage=300', Vary: 'Accept-Language' },
  });
}

function currentPeriod() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export async function GET(request: Request, { slug }: { slug: string }) {
  const url = new URL(request.url);
  const L = langOf(request, url);
  const s = (slug ?? '').toLowerCase();
  const appLink = `bookhaus://store/${encodeURIComponent(s)}`;
  const ua = request.headers.get('user-agent') ?? '';
  const storeLink = /android/i.test(ua) ? ANDROID_STORE_URL : IOS_STORE_URL;

  if (!/^[a-z0-9-]{3,30}$/.test(s) || !SUPABASE_URL) {
    return page(L, { title: L.notFoundTitle, description: L.typo, status: 404, url: url.href, body: `<h2 style="margin-top:32px">${L.notFound}</h2><p>${L.typo}</p>` });
  }

  let store: Store | undefined;
  let cur: Curation | undefined;
  try {
    [store] = await rest<Store[]>(`public_bookstores?slug=eq.${encodeURIComponent(s)}&select=id,slug,name,owner_name,tagline,color,follower_count`);
    if (store) {
      [cur] = await rest<Curation[]>(
        `curations?bookstore_id=eq.${store.id}&status=eq.published&period=lte.${currentPeriod()}&order=period.desc&limit=1` +
          `&select=id,period,title,description,curation_items(note,position,books(title,authors,cover_url))`,
      );
    }
  } catch {
    return page(L, { title: L.brand, description: L.errDesc, status: 503, url: url.href, body: `<h2 style="margin-top:32px">${L.errH}</h2><p>${L.errP}</p>` });
  }

  // 暫停營業、刪除申請中、找不到：public_bookstores 不會回傳
  if (!store) {
    return page(L, { title: L.pausedTitle, description: L.pausedDesc, status: 404, url: url.href, body: `<h2 style="margin-top:32px">${L.pausedH}</h2><p>${L.pausedP}</p>` });
  }

  const color = COLORS[store.color] ?? COLORS.moss;
  const items = (cur?.curation_items ?? []).sort((a, b) => a.position - b.position);
  const month = cur ? Number(cur.period.slice(5, 7)) : null;
  const title = cur && month ? L.curTitle(store.name, month, cur.title) : store.name;
  const description = cur ? `${L.books(items.length)} · ${L.site}` : store.tagline ?? L.ownerIndie(store.owner_name);

  const cover = (b: Item['books']) =>
    b.cover_url
      ? `<img class="cover" src="${esc(b.cover_url)}" alt="">`
      : `<div class="cover" style="background:${color}">${esc(b.title)}</div>`;

  const shown = items.slice(0, 2);
  const body = `
<div class="hero" style="background:${color}">
  <div class="avatar">${esc([...store.name][0] ?? '書')}</div>
  <h1>${esc(store.name)}</h1>
  <p>${esc(L.owner(store.owner_name, store.follower_count))}</p>
  ${store.tagline ? `<p style="margin-top:10px">${esc(store.tagline)}</p>` : ''}
</div>
${
  cur
    ? `<div class="label">${L.month(month ?? 1)}</div>
<h2>${esc(cur.title)}</h2>
${cur.description ? `<p style="color:var(--muted);margin:0">${esc(cur.description)}</p>` : ''}
<div class="card">
${shown
  .map(
    (i) => `<div class="book">${cover(i.books)}<div><b>${esc(i.books.title)}</b><small>${esc(i.books.authors.join(L.authorSep))}</small>${
      i.note ? `<p>${esc(i.note)}</p>` : ''
    }</div></div>`,
  )
  .join('')}
${items.length > 2 ? `<p class="more">${esc(L.more(items.length - 2))}</p>` : ''}
</div>`
    : `<div class="card"><p style="margin:0;color:var(--muted)">${L.empty}</p></div>`
}
<div class="cta">
  <a class="btn" href="${esc(appLink)}" data-open>${esc(L.follow(store.name))}</a>
  ${storeLink ? `<a href="${esc(storeLink)}" style="color:var(--primary);font-weight:700;text-decoration:none;min-height:44px;display:grid;place-items:center">${L.download}</a>` : ''}
  <small>${L.hint}</small>
</div>`;

  return page(L, { title, description, body, url: url.href });
}
