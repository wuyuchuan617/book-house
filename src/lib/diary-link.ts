/**
 * v1.8.4 AK22 日記連結：認平台、整理網址、抓標題（伺服器的 link-preview；還沒部署就只顯示網域）。
 */
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type LinkPlatform = 'youtube' | 'spotify' | 'apple_podcasts' | 'podcast' | 'web';

/** 使用者貼的字 → 網址（沒寫 https:// 就補上）；不像網址就回 null */
export function normalizeLink(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : /^[\w-]+(\.[\w-]+)+(\/|$)/.test(t) ? `https://${t}` : null;
  if (!withScheme || withScheme.length > 500 || /\s/.test(withScheme)) return null;
  try {
    const u = new URL(withScheme);
    return u.hostname.includes('.') ? u.toString() : null;
  } catch {
    return null;
  }
}

export function linkHost(url: string) {
  const m = /^https?:\/\/(?:www\.|m\.)?([^/?#]+)/i.exec(url);
  return m ? m[1] : url;
}

export function linkPlatform(url: string): LinkPlatform {
  const h = linkHost(url).toLowerCase();
  if (h === 'youtube.com' || h === 'youtu.be' || h === 'music.youtube.com') return 'youtube';
  if (h === 'open.spotify.com') return 'spotify';
  if (h === 'podcasts.apple.com') return 'apple_podcasts';
  if (/(^|\.)(soundon\.fm|firstory\.me|kkbox\.com|podcasts\.google\.com|anchor\.fm|castbox\.fm)$/.test(h)) return 'podcast';
  return 'web';
}

/** 抓標題：同一個網址只抓一次；抓不到回 null */
export function useLinkTitle(url: string | null) {
  return useQuery({
    queryKey: ['link-title', url],
    enabled: !!url,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('link-preview', { body: { url } });
      if (error) return null;
      return ((data as { title?: string | null })?.title ?? null) as string | null;
    },
  });
}
