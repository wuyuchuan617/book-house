// v1.8.4 AK22 日記連結：抓連結的標題（YouTube、Spotify 用官方 oEmbed；其他抓 og:title／<title>）。不存任何東西。
// 部署：supabase functions deploy link-preview
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Platform = 'youtube' | 'spotify' | 'apple_podcasts' | 'podcast' | 'web';

export function platformOf(u: URL): Platform {
  const h = u.hostname.replace(/^www\./, '').toLowerCase();
  if (h === 'youtube.com' || h === 'm.youtube.com' || h === 'youtu.be' || h === 'music.youtube.com') return 'youtube';
  if (h === 'open.spotify.com') return 'spotify';
  if (h === 'podcasts.apple.com') return 'apple_podcasts';
  if (/(^|\.)(soundon\.fm|firstory\.me|kkbox\.com|podcasts\.google\.com|anchor\.fm|castbox\.fm|player\.soundon\.fm)$/.test(h)) return 'podcast';
  return 'web';
}

// 不讓函式去打內網（SSRF）
function blocked(u: URL) {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return true;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h === '0.0.0.0' || h.startsWith('[')) return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return true;
  }
  return false;
}

async function get(url: string, accept: string) {
  let u = new URL(url);
  for (let i = 0; i < 4; i++) {
    if (blocked(u)) throw new Error('blocked');
    const res = await fetch(u, { redirect: 'manual', headers: { Accept: accept, 'User-Agent': 'BookhausLinkPreview/1.0' }, signal: AbortSignal.timeout(4000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      u = new URL(res.headers.get('location')!, u);
      continue;
    }
    return res;
  }
  throw new Error('too many redirects');
}

async function readText(res: Response, max = 200_000) {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let n = 0;
  while (n < max) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    n += value.length;
  }
  void reader.cancel().catch(() => {});
  const all = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) {
    all.set(c.subarray(0, Math.min(c.length, n - o)), o);
    o += c.length;
    if (o >= n) break;
  }
  return new TextDecoder().decode(all);
}

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
const clean = (s: string | null | undefined) => (s ? decode(s).replace(/\s+/g, ' ').trim().slice(0, 200) || null : null);

async function titleOf(u: URL, platform: Platform): Promise<string | null> {
  const oembed = platform === 'youtube' ? 'https://www.youtube.com/oembed?format=json&url=' : platform === 'spotify' ? 'https://open.spotify.com/oembed?url=' : null;
  if (oembed) {
    const res = await fetch(oembed + encodeURIComponent(u.toString()), { signal: AbortSignal.timeout(4000) });
    if (res.ok) return clean(((await res.json()) as { title?: string }).title);
  }
  const res = await get(u.toString(), 'text/html,application/xhtml+xml');
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return null;
  const html = await readText(res);
  const og = /<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]*content=["']([^"']+)["']/i.exec(html) ?? /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:title["']/i.exec(html);
  if (og) return clean(og[1]);
  const t = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return t ? clean(t[1]) : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'sign in required' }, 401);
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: me } = await userClient.auth.getUser();
  if (!me?.user) return json({ error: 'sign in required' }, 401);

  let u: URL;
  try {
    u = new URL(String((await req.json())?.url ?? '').trim());
  } catch {
    return json({ error: 'invalid url' }, 400);
  }
  if (blocked(u) || u.toString().length > 500) return json({ error: 'invalid url' }, 400);
  const platform = platformOf(u);
  let title: string | null = null;
  try {
    title = await titleOf(u, platform);
  } catch {
    title = null;
  }
  return json({ title, platform });
});
