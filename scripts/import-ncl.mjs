#!/usr/bin/env node
/**
 * 匯入國家圖書館「臺灣出版新書預告書訊」（全國新書資訊網 › 書目下載，每月一個 CSV）到 Supabase books 表。
 * 資料是出版社申請 ISBN 時的書目（2025 年起每月一檔），以 ISBN 合併已存在的書（補上出版社、出版年）。
 *
 * 用法（在自己的電腦執行；service role key 在 Supabase › Project Settings › API，不要放進 App 或 Git）：
 *   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-ncl.mjs            # 下載全部月份
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-ncl.mjs --latest 2                    # 只匯最近 2 個月
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-ncl.mjs ./下載的檔案.csv              # 匯入本機檔案
 */
import { readFile } from 'node:fs/promises';

const LIST_URL = 'https://isbn.ncl.edu.tw/NEW_ISBNNet/main_ProcessMenuItems.php?Ptarget=418&Pact=ViewContent&Pval=418&Pfld=Ffile';
const BASE = 'https://isbn.ncl.edu.tw/';
const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CHUNK = 500;

if (!SUPABASE_URL || !KEY) {
  console.error('請設定 SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

/** CSV（RFC 4180，支援引號內換行與 ""） */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** 先試 UTF-8，有亂碼就改用 Big5（舊檔常見） */
function decode(buf) {
  const utf8 = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '');
  if (!utf8.includes('�')) return utf8;
  return new TextDecoder('big5').decode(buf);
}

const ROLE = /(主編|總編輯|編著|編撰|編繪|編譯|改寫|翻譯|審訂|監修|原著|原作|作者|插畫|繪圖|攝影|撰文|口述|著|編|譯|繪|文|圖|作|等)$/;
function authors(raw) {
  return [...new Set(
    String(raw ?? '')
      .split(/[;；、,，/／]|\s{2,}/)
      .map((a) => a.trim().replace(/[\[［(（].*?[\]］)）]/g, '').trim().replace(ROLE, '').trim())
      .filter(Boolean),
  )].slice(0, 5);
}

function year(raw) {
  const s = String(raw ?? '').trim();
  const roc = s.match(/^(\d{2,3})[\/.\-年]/); // 民國年，例如 114/05
  if (roc && Number(roc[1]) < 200) return String(Number(roc[1]) + 1911);
  const ad = s.match(/(19|20)\d{2}/);
  return ad ? ad[0] : null;
}

function toBooks(text) {
  const [header, ...rows] = parseCsv(text).filter((r) => r.some((c) => c.trim()));
  if (!header) return [];
  const col = (name) => header.findIndex((h) => h.replace(/\s/g, '') === name);
  const iTitle = col('申請書名'), iAuthor = col('作者'), iPub = col('出版機構'), iIsbn = col('ISBN'), iDate = col('預訂出版日');
  if (iTitle < 0 || iIsbn < 0) throw new Error(`看不懂這個 CSV 的欄位：${header.slice(0, 8).join(', ')}`);
  return rows
    .map((r) => ({
      isbn13: String(r[iIsbn] ?? '').replace(/[^0-9]/g, ''),
      title: String(r[iTitle] ?? '').trim(),
      authors: authors(r[iAuthor]),
      publisher: iPub >= 0 ? String(r[iPub] ?? '').trim() || null : null,
      published_year: iDate >= 0 ? year(r[iDate]) : null,
    }))
    .filter((b) => /^97[89]\d{10}$/.test(b.isbn13) && b.title);
}

async function upsert(books) {
  let done = 0;
  for (let i = 0; i < books.length; i += CHUNK) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/upsert_ncl_books`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_books: books.slice(i, i + CHUNK) }),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    done += await res.json();
    process.stdout.write(`\r  已匯入 ${done} / ${books.length}`);
  }
  process.stdout.write('\n');
  return done;
}

async function main() {
  const args = process.argv.slice(2);
  const latestIdx = args.indexOf('--latest');
  const latest = latestIdx >= 0 ? Number(args[latestIdx + 1]) : null;
  const files = args.filter((a, i) => a.endsWith('.csv') && i !== latestIdx + 1);

  const sources = [];
  if (files.length) {
    for (const f of files) sources.push({ name: f, buf: await readFile(f) });
  } else {
    const html = await (await fetch(LIST_URL)).text();
    let links = [...new Set(html.match(/FCKEDITOR_UploadFiles\/\d+\.csv/g) ?? [])];
    if (!links.length) throw new Error('找不到下載連結，網站可能改版；可以手動下載 CSV 再用檔案路徑匯入。');
    if (latest) links = links.slice(-latest);
    console.log(`找到 ${links.length} 個月份的檔案`);
    for (const l of links) {
      const res = await fetch(BASE + l);
      if (!res.ok) { console.warn(`略過 ${l}（${res.status}）`); continue; }
      sources.push({ name: l, buf: Buffer.from(await res.arrayBuffer()) });
    }
  }

  let total = 0;
  for (const s of sources) {
    const books = toBooks(decode(s.buf));
    console.log(`${s.name}：${books.length} 本`);
    total += await upsert(books);
  }
  console.log(`完成，共處理 ${total} 本書。`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
