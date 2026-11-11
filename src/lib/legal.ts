/** 服務條款、隱私權政策（網頁 /terms、/privacy；App 內 legal/[doc]）。中英兩版，上架前請請法律專業人士確認。 */
export type LegalLang = 'zh' | 'en';
export type LegalDoc = 'terms' | 'privacy';
type Sections = [string, string[]][];

const CONTACT_ENV = process.env.EXPO_PUBLIC_CONTACT_EMAIL;
export const CONTACT = CONTACT_ENV || '[聯絡信箱]';
export const contactFor = (lang: LegalLang) => CONTACT_ENV || (lang === 'en' ? '[contact email]' : '[聯絡信箱]');
export const UPDATED = '2026 年 11 月 9 日';
const UPDATED_EN = 'November 9, 2026';

const UI = {
  zh: { terms: '服務條款', privacy: '隱私權政策', updated: `最後更新：${UPDATED}`, contact: (c: string) => `有任何問題，請寫信到 ${c}。`, other: 'English', otherHref: '?lang=en' },
  en: { terms: 'Terms of Service', privacy: 'Privacy Policy', updated: `Last updated: ${UPDATED_EN}`, contact: (c: string) => `Questions? Email ${c}.`, other: '繁體中文', otherHref: '?lang=zh' },
};

/** 網頁版：?lang=en|zh 優先，否則看瀏覽器語言 */
export function requestLang(request: Request): LegalLang {
  const url = new URL(request.url);
  const q = url.searchParams.get('lang');
  if (q === 'en' || q === 'zh') return q;
  const al = (request.headers.get('accept-language') ?? '').toLowerCase();
  return al.startsWith('en') ? 'en' : 'zh';
}

export function legalContent(doc: LegalDoc, lang: LegalLang) {
  const sections = doc === 'terms' ? (lang === 'en' ? TERMS_EN : TERMS) : lang === 'en' ? PRIVACY_EN : PRIVACY;
  return { title: UI[lang][doc], updated: UI[lang].updated, contact: UI[lang].contact(contactFor(lang)), sections };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

export function legalPage(doc: LegalDoc, lang: LegalLang) {
  const { title, updated, contact, sections } = legalContent(doc, lang);
  const body = sections
    .map(([h, ps]) => `<h2>${esc(h)}</h2>${ps.map((p) => `<p>${esc(p)}</p>`).join('')}`)
    .join('');
  const html = `<!doctype html><html lang="${lang === 'en' ? 'en' : 'zh-Hant'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}｜書棲 Bookhaus</title>
<style>
:root{--bg:#F3EFE8;--text:#1F1B16;--muted:#5F574E;--primary:#8B4F37}
@media (prefers-color-scheme: dark){:root{--bg:#1F1B16;--text:#F3EFE8;--muted:#C9BCAB;--primary:#D9997C}}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.75 -apple-system,"PingFang TC","Noto Sans TC",system-ui,sans-serif}
main{max-width:680px;margin:0 auto;padding:32px 16px 64px}
h1{font-family:ui-serif,"Noto Serif TC",serif;font-size:28px;margin:0 0 4px}
h2{font-size:18px;margin:28px 0 6px}
p{margin:6px 0}.muted{color:var(--muted);font-size:14px}a{color:var(--primary)}
</style></head><body><main><p class="muted" style="text-align:right"><a href="${UI[lang].otherHref}">${UI[lang].other}</a></p><h1>${esc(title)}</h1><p class="muted">${esc(updated)}</p>${body}
<p class="muted" style="margin-top:32px">${esc(contact)}</p></main></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600', Vary: 'Accept-Language' } });
}

export const PRIVACY: Sections = [
  ['我們收集哪些資料', [
    '帳號：你用 Apple 或 Google 登入時提供的名稱與電子郵件。Apple「隱藏我的電子郵件」產生的轉寄信箱也會被當成你的電子郵件。',
    '你建立的內容：書店名稱、介紹、頭貼與背景圖、策展、推薦理由、店主閱讀與心得。公開的內容任何人都看得到。',
    '互動：你追蹤的書店、想讀清單、檢舉與封鎖紀錄、意見回饋。這些只有你自己（與審核人員處理檢舉時）看得到。',
    '使用情形：匿名的裝置代號、使用了哪些功能（例如發布策展、收藏書）、App 版本與作業系統，用來改善產品。我們不收集通訊錄、位置或廣告識別碼。',
    '推播：你允許通知後，我們會保存這支裝置的推播代號，只用來傳送你在設定裡開啟的通知。',
  ]],
  ['我們怎麼使用', [
    '提供書棲的功能（顯示書店、通知新策展、計算店主看得到的拜訪與追蹤數）、處理檢舉與維護社群安全、了解哪些功能好用。',
    '我們不販售你的個人資料，也不用於廣告。',
  ]],
  ['與誰分享', [
    'Supabase（資料庫與檔案儲存）、Expo（App 更新與推播傳送）、Google Books／Open Library（查書目，只傳送搜尋關鍵字）。這些服務只依我們的指示處理資料。',
    '法律要求時，我們可能依法提供必要資料。',
  ]],
  ['保存與刪除', [
    '你可以隨時在 App 的「設定 › 刪除書店」刪除書店與其中所有內容。',
    '在「設定 › 刪除帳號」申請刪除後，帳號會立即對其他人隱藏；30 天內重新登入可以取消，30 天後永久刪除帳號與所有內容。',
    '匿名的使用統計會保留最多 24 個月。',
  ]],
  ['你的權利', ['你可以查閱、更正或刪除你的資料，或要求我們停止處理。寫信給我們，我們會在 30 天內回覆。']],
  ['兒童', ['書棲不是設計給 13 歲以下兒童使用，我們不會刻意收集兒童的個人資料。']],
];

export const TERMS: Sections = [
  ['服務內容', ['書棲讓每個人開一間自己的線上獨立書店，每月用一檔策展分享選書。我們可能隨時調整或停止部分功能。']],
  ['帳號', ['你需要用 Apple 或 Google 帳號登入，並對帳號下的所有活動負責。一個帳號只能開一間書店。']],
  ['你的內容', [
    '你發布的策展、推薦理由、心得與圖片的權利屬於你。你授權書棲在提供服務的範圍內儲存、顯示與分享這些內容（例如在探索頁、網頁版書店頁與分享連結預覽中顯示）。',
    '請只上傳你有權使用的內容。不要張貼整本書的內容、未授權的封面或圖片。',
  ]],
  ['社群規範（零容忍）', [
    '不得張貼：仇恨、騷擾、威脅、色情或暴力內容；侵害他人著作權或隱私的內容；垃圾訊息、廣告或詐騙；冒充他人。',
    '你可以在書店頁的 ⋯ 選單檢舉或封鎖。我們會在 24 小時內審核檢舉，移除違規內容，並可能暫停或終止違規帳號。',
  ]],
  ['免責', ['書棲依現況提供服務。書目資料來自第三方，可能有錯誤；店主的推薦理由代表店主個人看法。']],
  ['條款變更', ['條款有重大變更時，我們會在 App 內通知。變更後繼續使用即表示同意新的條款。']],
];

export const PRIVACY_EN: Sections = [
  ['What we collect', [
    'Account: the name and email you share when signing in with Apple or Google. If you use Apple’s “Hide My Email”, the relay address is treated as your email.',
    'Content you create: store name, tagline, avatar and banner, curations, notes on books, and your reading log. Public content can be seen by anyone.',
    'Activity: bookstores you follow, your Want to read list, reports and blocks, and feedback. Only you (and moderators handling a report) can see these.',
    'Usage: an anonymous device ID, which features you use (for example publishing a curation or saving a book), app version, and operating system, to improve the product. We don’t collect contacts, location, or advertising IDs.',
    'Push: if you allow notifications, we store this device’s push token and use it only for the notifications you turn on in Settings.',
  ]],
  ['How we use it', [
    'To run Bookhaus (showing bookstores, notifying you of new curations, counting the visits and followers owners see), to handle reports and keep the community safe, and to learn which features work.',
    'We don’t sell your personal data or use it for advertising.',
  ]],
  ['Who we share it with', [
    'Supabase (database and file storage), Expo (app updates and push delivery), and Google Books / Open Library (book lookup — only your search terms are sent). They process data only on our instructions.',
    'We may disclose necessary data when required by law.',
  ]],
  ['Retention and deletion', [
    'You can delete your bookstore and everything in it anytime in Settings › Delete bookstore.',
    'After you request deletion in Settings › Delete account, your account is hidden from others right away. Sign in within 30 days to cancel; after 30 days your account and all content are permanently deleted.',
    'Anonymous usage statistics are kept for up to 24 months.',
  ]],
  ['Your rights', ['You can access, correct, or delete your data, or ask us to stop processing it. Email us and we’ll reply within 30 days.']],
  ['Children', ['Bookhaus isn’t designed for children under 13, and we don’t knowingly collect their personal data.']],
];

export const TERMS_EN: Sections = [
  ['The service', ['Bookhaus lets anyone open their own online indie bookstore and share book picks through one curation a month. We may change or discontinue features at any time.']],
  ['Accounts', ['You sign in with Apple or Google and are responsible for all activity on your account. Each account can open one bookstore.']],
  ['Your content', [
    'You own the curations, notes, and images you publish. You grant Bookhaus permission to store, display, and share them as needed to run the service (for example in Explore, on the web version of your store, and in link previews).',
    'Only upload content you have the right to use. Don’t post the full text of books or unlicensed covers or images.',
  ]],
  ['Community rules (zero tolerance)', [
    'Don’t post hateful, harassing, threatening, sexual, or violent content; content that infringes copyright or privacy; spam, ads, or scams; or content impersonating others.',
    'You can report or block from the ⋯ menu on a bookstore page. We review reports within 24 hours, remove violating content, and may suspend or terminate violating accounts.',
  ]],
  ['Disclaimer', ['Bookhaus is provided as is. Book data comes from third parties and may contain errors; owners’ notes reflect their own opinions.']],
  ['Changes', ['We’ll notify you in the app about material changes. Continuing to use Bookhaus means you accept the updated terms.']],
];
