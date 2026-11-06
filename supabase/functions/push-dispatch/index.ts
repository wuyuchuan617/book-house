// 把 notification_outbox 裡還沒送的通知送到 Expo Push（每分鐘由 pg_cron 呼叫一次）
// 部署：supabase functions deploy push-dispatch --no-verify-jwt
// 保護：只接受帶 CRON_SECRET 的請求（supabase secrets set CRON_SECRET=<隨機字串>）
import { createClient } from 'npm:@supabase/supabase-js@2';

type Row = { id: string; user_id: string; title: string; body: string; data: Record<string, unknown> };
type Ticket = { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } };

const BATCH = 500;

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return new Response('forbidden', { status: 403 });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: rows, error } = await admin
    .from('notification_outbox')
    .select('id, user_id, title, body, data')
    .is('sent_at', null)
    .order('created_at')
    .limit(BATCH);
  if (error) return new Response(error.message, { status: 500 });
  if (!rows?.length) return Response.json({ sent: 0 });

  const userIds = [...new Set((rows as Row[]).map((r) => r.user_id))];
  const { data: tokens } = await admin.from('push_tokens').select('user_id, token').in('user_id', userIds);
  const byUser = new Map<string, string[]>();
  for (const t of tokens ?? []) byUser.set(t.user_id, [...(byUser.get(t.user_id) ?? []), t.token]);

  const messages: { to: string; title: string; body: string; data: Record<string, unknown>; sound: 'default'; rowId: string }[] = [];
  for (const r of rows as Row[]) {
    for (const to of byUser.get(r.user_id) ?? []) messages.push({ to, title: r.title, body: r.body, data: r.data, sound: 'default', rowId: r.id });
  }

  const dead = new Set<string>();
  const failed = new Map<string, string>();
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(Deno.env.get('EXPO_ACCESS_TOKEN') ? { Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` } : {}) },
        body: JSON.stringify(chunk.map(({ rowId: _r, ...m }) => m)),
      });
      const body = (await res.json()) as { data?: Ticket[] };
      (body.data ?? []).forEach((t, j) => {
        if (t.status === 'error') {
          if (t.details?.error === 'DeviceNotRegistered') dead.add(chunk[j].to);
          else failed.set(chunk[j].rowId, t.message ?? 'error');
        }
      });
    } catch (e) {
      for (const m of chunk) failed.set(m.rowId, String(e));
    }
  }

  // 全部標記為已處理（沒有 token 的使用者沒有裝置可送；失敗的記下原因，不重送避免洗版）
  const now = new Date().toISOString();
  const ok = (rows as Row[]).filter((r) => !failed.has(r.id)).map((r) => r.id);
  if (ok.length) await admin.from('notification_outbox').update({ sent_at: now }).in('id', ok);
  for (const [id, msg] of failed) await admin.from('notification_outbox').update({ sent_at: now, error: msg.slice(0, 300) }).eq('id', id);
  if (dead.size) await admin.from('push_tokens').delete().in('token', [...dead]);

  return Response.json({ sent: ok.length, failed: failed.size, removedTokens: dead.size });
});
