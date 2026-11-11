// S1 選書元件的搜尋：本機書庫（含自己手動新增的書）＋ Google Books
// 部署：supabase functions deploy book-search
// 金鑰：supabase secrets set GOOGLE_BOOKS_API_KEY=...（選填；沒填也能查，但配額較低）
import { createClient } from 'npm:@supabase/supabase-js@2';

type Book = {
  id: string;
  source: 'google_books' | 'open_library' | 'manual' | 'ncl';
  title: string;
  authors: string[];
  cover_url: string | null;
  published_year: number | null;
  publisher: string | null;
};

type GoogleVolume = {
  id: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publishedDate?: string;
    publisher?: string;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    industryIdentifiers?: { type: string; identifier: string }[];
  };
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const LIMIT = 20;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'sign in required' }, 401);

  let q = '';
  try {
    q = String((await req.json())?.q ?? '').trim();
  } catch {
    return json({ error: 'invalid body' }, 400);
  }
  if ([...q].length < 2) return json({ books: [] }); // S1：輸入 2 個字後才查詢
  q = q.slice(0, 60);
  // 掃條碼或貼上的 ISBN（可含 -）：用 ISBN 精準查
  const digits = q.replace(/[^0-9Xx]/g, '');
  const isbn = /^97[89][0-9]{10}$/.test(digits) ? digits : null;

  const url = Deno.env.get('SUPABASE_URL')!;
  // 以使用者身分查本機書庫（手動新增的書只看得到自己的）
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: me } = await userClient.auth.getUser();
  if (!me.user) return json({ error: 'sign in required' }, 401);

  const [local, google] = await Promise.all([
    userClient.rpc('search_local_books', { p_query: q, p_limit: LIMIT }),
    searchGoogle(isbn ? `isbn:${isbn}` : q),
  ]);
  if (local.error) console.error('search_local_books', local.error.message);
  // Google 失敗（沒金鑰時常見 429 配額用完）或查無結果 → 改查 Open Library
  const remote = google.length > 0 ? google : await searchOpenLibrary(isbn ? `isbn:${isbn}` : q);

  let saved: Book[] = [];
  if (remote.length > 0) {
    const { data, error } = await admin.rpc('upsert_api_books', { p_books: remote });
    if (error) console.error('upsert_api_books', error.message);
    saved = (data ?? []) as Book[];
  }

  // 本機結果在前（已經有人用過的書），API 結果補在後面，依 id 去重
  const seen = new Set<string>();
  const books: Book[] = [];
  for (const b of [...((local.data ?? []) as Book[]), ...saved]) {
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    books.push({
      id: b.id,
      source: b.source,
      title: b.title,
      authors: b.authors,
      cover_url: b.cover_url,
      published_year: b.published_year,
      publisher: b.publisher ?? null,
    });
    if (books.length >= LIMIT) break;
  }
  return json({ books, source: google.length > 0 ? 'google_books' : remote.length > 0 ? 'open_library' : 'local' });
});

async function searchGoogle(q: string) {
  const params = new URLSearchParams({ q, maxResults: String(LIMIT), printType: 'books', country: 'TW' });
  const key = Deno.env.get('GOOGLE_BOOKS_API_KEY');
  if (key) params.set('key', key);
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      // 400 = 金鑰無效；429 = 配額用完（沒設金鑰時，共用 IP 很快就會用完）
      console.error('google books', res.status, (await res.text()).slice(0, 300));
      return [];
    }
    const body = (await res.json()) as { items?: GoogleVolume[] };
    return (body.items ?? [])
      .filter((v) => v.volumeInfo?.title)
      .map((v) => {
        const info = v.volumeInfo!;
        const isbn = info.industryIdentifiers?.find((i) => i.type === 'ISBN_13')?.identifier ?? null;
        const year = Number.parseInt(info.publishedDate?.slice(0, 4) ?? '', 10);
        const cover = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null;
        return {
          source: 'google_books',
          external_id: v.id,
          isbn13: isbn,
          title: info.subtitle ? `${info.title}：${info.subtitle}` : info.title,
          authors: info.authors?.length ? info.authors : ['佚名'],
          cover_url: cover ? cover.replace(/^http:/, 'https:') : null,
          published_year: Number.isFinite(year) ? String(year) : null,
          publisher: info.publisher ?? null,
        };
      });
  } catch (e) {
    console.error('google books', e);
    return [];
  }
}

type OpenLibraryDoc = {
  key: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  isbn?: string[];
  cover_i?: number;
  publisher?: string[];
};

async function searchOpenLibrary(q: string) {
  const params = new URLSearchParams({
    q,
    limit: String(LIMIT),
    fields: 'key,title,author_name,first_publish_year,isbn,cover_i,publisher',
  });
  try {
    const res = await fetch(`https://openlibrary.org/search.json?${params}`, {
      headers: { 'User-Agent': 'Bookhaus/1.0 (book-search edge function)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      console.error('open library', res.status);
      return [];
    }
    const body = (await res.json()) as { docs?: OpenLibraryDoc[] };
    return (body.docs ?? [])
      .filter((d) => d.title)
      .map((d) => ({
        source: 'open_library',
        external_id: d.key,
        isbn13: d.isbn?.find((i) => /^[0-9]{13}$/.test(i)) ?? null,
        title: d.title!,
        authors: d.author_name?.length ? d.author_name.slice(0, 5) : ['佚名'],
        cover_url: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
        published_year: d.first_publish_year ? String(d.first_publish_year) : null,
        publisher: d.publisher?.[0] ?? null,
      }));
  } catch (e) {
    console.error('open library', e);
    return [];
  }
}
