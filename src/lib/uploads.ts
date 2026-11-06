/** M2 書店頭貼、背景圖：從相簿選圖 → 上傳到 Supabase Storage → 寫回書店 */
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

export type ImageKind = 'avatar' | 'banner';
const BUCKET: Record<ImageKind, string> = { avatar: 'store-avatars', banner: 'store-banners' };
const MAX_BYTES = 5 * 1024 * 1024;

export function storageUrl(kind: ImageKind, path: string | null | undefined) {
  if (!path) return null;
  return `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET[kind]}/${path}`;
}

export class UploadError extends Error {}

/** 回傳新的路徑；使用者取消時回傳 null */
export async function pickAndUpload(kind: ImageKind, storeId: string): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new UploadError('需要讀取照片的權限，才能更換圖片。可以到手機設定開啟。');
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: kind === 'avatar' ? [1, 1] : [3, 1],
    quality: 0.8,
  });
  if (res.canceled || !res.assets[0]) return null;
  const asset = res.assets[0];
  if (asset.fileSize && asset.fileSize > MAX_BYTES) throw new UploadError('圖片超過 5MB，請選一張小一點的。');
  const type = asset.mimeType && ['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType) ? asset.mimeType : 'image/jpeg';
  const ext = type.split('/')[1].replace('jpeg', 'jpg');
  const body = await (await fetch(asset.uri)).arrayBuffer();
  if (body.byteLength > MAX_BYTES) throw new UploadError('圖片超過 5MB，請選一張小一點的。');
  const path = `${storeId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET[kind]).upload(path, body, { contentType: type, upsert: false });
  if (error) throw new UploadError(`上傳沒有成功：${error.message}`);
  const col = kind === 'avatar' ? 'avatar_path' : 'banner_path';
  const upd = await supabase.from('bookstores').update({ [col]: path }).eq('id', storeId);
  if (upd.error) throw new UploadError(upd.error.message);
  return path;
}
