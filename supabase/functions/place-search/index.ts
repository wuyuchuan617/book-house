// 打卡選地點：代理 Google Places API (New)，只用 Essentials（每月免費額度內）
// 部署：supabase functions deploy place-search
// 金鑰：supabase secrets set GOOGLE_PLACES_API_KEY=...（在 Google Cloud 只開 Places API (New)，並設每日配額）
//
// POST { action: 'autocomplete', input, sessionToken, lat?, lng? }
//   → { suggestions: [{ googlePlaceId, name, address, types }] }   （Autocomplete Requests，Essentials）
// POST { action: 'select', googlePlaceId, name, address, types, sessionToken, needLocation? }
//   → { place: { id, name, address, category, public_ok } }          （needLocation 時加叫 Place Details Essentials）
// 用量：每人每天 50 次、全站每天 300 次（autocomplete 才算）；超過回 429 quota_exceeded
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const PER_USER_DAY = Number(Deno.env.get('PLACE_SEARCH_PER_USER_DAY') ?? 50);
const PER_DAY = Number(Deno.env.get('PLACE_SEARCH_PER_DAY') ?? 300);

/** Google types → 書棲的分類；公開場所才可以公開打卡 */
function classify(types: string[]) {
  const t = new Set(types);
  const category = t.has('book_store')
    ? 'bookstore'
    : t.has('library')
      ? 'library'
      : t.has('cafe') || t.has('coffee_shop') || t.has('tea_house')
        ? 'cafe'
        : t.has('park')
          ? 'park'
          : t.has('museum') || t.has('art_gallery')
            ? 'museum'
            : 'other';
  const residential = ['street_address', 'premise', 'subpremise', 'route', 'intersection', 'postal_code', 'apartment_building', 'apartment_complex', 'housing_complex'].some((x) => t.has(x));
  const poi = t.has('establishment') || t.has('point_of_interest') || category !== 'other';
  return { category, public_ok: poi && !residential };
}

const taipeiToday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const key = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!key) return json({ error: 'not_configured' }, 503);

  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return json({ error: 'sign in required' }, 401);
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad request' }, 400);
  }

  if (body.action === 'autocomplete') {
    const input = String(body.input ?? '').trim().slice(0, 80);
    if ([...input].length < 2) return json({ suggestions: [] });

    // 用量：每人每天、全站每天
    const day = taipeiToday();
    const { data: mine } = await admin.from('place_search_usage').select('count').eq('day', day).eq('user_id', auth.user.id).maybeSingle();
    const { data: all } = await admin.from('place_search_usage').select('count').eq('day', day);
    const total = (all ?? []).reduce((s, r) => s + (r.count as number), 0);
    if ((mine?.count ?? 0) >= PER_USER_DAY || total >= PER_DAY) return json({ error: 'quota_exceeded' }, 429);
    await admin.from('place_search_usage').upsert({ day, user_id: auth.user.id, count: (mine?.count ?? 0) + 1 });

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
      body: JSON.stringify({
        input,
        sessionToken: String(body.sessionToken ?? ''),
        languageCode: String(body.language ?? 'zh-TW'),
        regionCode: 'TW',
        ...(Number.isFinite(lat) && Number.isFinite(lng) && body.lat != null
          ? { locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 5000 } } }
          : {}),
      }),
    });
    if (res.status === 429) return json({ error: 'quota_exceeded' }, 429);
    if (!res.ok) return json({ error: `google ${res.status}` }, 502);
    const data = (await res.json()) as {
      suggestions?: { placePrediction?: { placeId: string; types?: string[]; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }; text?: { text: string } } }[];
    };
    const suggestions = (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
      .map((p) => {
        const types = p.types ?? [];
        return {
          googlePlaceId: p.placeId,
          name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
          address: p.structuredFormat?.secondaryText?.text ?? null,
          types,
          ...classify(types),
        };
      });
    return json({ suggestions });
  }

  if (body.action === 'select') {
    const googlePlaceId = String(body.googlePlaceId ?? '');
    if (!googlePlaceId) return json({ error: 'bad request' }, 400);
    let types = Array.isArray(body.types) ? (body.types as string[]).slice(0, 20) : [];
    let address = body.address ? String(body.address).slice(0, 300) : null;
    let lat: number | null = null;
    let lng: number | null = null;

    if (body.needLocation) {
      const res = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(googlePlaceId)}?languageCode=zh-TW${body.sessionToken ? `&sessionToken=${encodeURIComponent(String(body.sessionToken))}` : ''}`,
        { headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'id,location,types,formattedAddress' } },
      );
      if (res.ok) {
        const d = (await res.json()) as { location?: { latitude: number; longitude: number }; types?: string[]; formattedAddress?: string };
        lat = d.location?.latitude ?? null;
        lng = d.location?.longitude ?? null;
        types = d.types ?? types;
        address = d.formattedAddress ?? address;
      }
    }

    const { category, public_ok } = classify(types);
    const row = {
      google_place_id: googlePlaceId,
      name: String(body.name ?? '').slice(0, 120) || '—',
      address,
      types,
      category,
      public_ok,
      refreshed_at: new Date().toISOString(),
      ...(lat != null && lng != null ? { lat, lng } : {}),
    };
    const { data: place, error } = await admin
      .from('places')
      .upsert(row, { onConflict: 'google_place_id' })
      .select('id, name, address, category, public_ok, google_place_id')
      .single();
    if (error) return json({ error: error.message }, 500);
    return json({ place });
  }

  return json({ error: 'unknown action' }, 400);
});
