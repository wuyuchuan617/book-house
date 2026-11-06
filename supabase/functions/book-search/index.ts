// S1 選書元件的搜尋：本機書庫（含自己手動新增的書）＋ Google Books
// 部署：supabase functions deploy book-search
// 金鑰：supabase secrets set GOOGLE_BOOKS_API_KEY=...（選填；沒填也能查，但配額較低）
import { createClient } from 'npm:@supabase/supabase-js@2';

type Book = {
  id: string;
  source: 'google_books' | 'open_library' | 'manual';
  title: string;
  authors: string[];
  cover_url: string | null;
  published_year: number | null;
};

type GoogleVolume = {
  id: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publishedDate?: string;
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

  const url = Deno.env.get('SUPABASE_URL')!;
  // 以使用者身分查本機書庫（手動新增的書只看得到自己的）
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: me } = await userClient.auth.getUser();
  if (!me.user) return json({ error: 'sign in required' }, 401);

  const [local, remote] = await Promise.all([
    userClient.rpc('search_local_books', { p_query: q, p_limit: LIMIT }),
    searchGoogle(q),
  ]);

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
    });
    if (books.length >= LIMIT) break;
  }
  return json({ books, partial: remote.length === 0 && !!local.error });
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
      console.error('google books', res.status);
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
        };
      });
  } catch (e) {
    console.error('google books', e);
    return [];
  }
}
