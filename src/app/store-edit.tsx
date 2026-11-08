import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { TextField } from '@/components/form';
import { StoreAvatar } from '@/components/social';
import { AppText, Button, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing, StoreColors, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMyStore, type MyStore } from '@/lib/queries';
import { readingError, SLUG_PATTERN, useSlugAvailability, useUpdateStore } from '@/lib/readings';
import { pickAndUpload, storageUrl, UploadError, type ImageKind } from '@/lib/uploads';
import { WEB_URL } from '@/lib/links';

/** M2 編輯書店資料：頭貼、背景圖、店名、介紹、網址、顏色 */
export default function StoreEditScreen() {
  const { data } = useMyStore();
  if (!data) return <ActivityIndicator style={{ marginTop: 48 }} />;
  return <StoreEditForm store={data.store} />;
}

function StoreEditForm({ store }: { store: MyStore }) {
  const c = useTheme();
  const update = useUpdateStore();
  const [name, setName] = useState(store.name);
  const [ownerName, setOwnerName] = useState(store.owner_name);
  const [tagline, setTagline] = useState(store.tagline ?? '');
  const [slugInput, setSlugInput] = useState(store.slug);
  const [slug, setSlug] = useState(store.slug);
  const [color, setColor] = useState<StoreColor>(store.color);
  const [uploading, setUploading] = useState<ImageKind | null>(null);
  const qc = useQueryClient();
  const bannerUri = storageUrl('banner', store.banner_path);

  const upload = async (kind: ImageKind) => {
    setUploading(kind);
    try {
      const path = await pickAndUpload(kind, store.id, kind === 'avatar' ? store.avatar_path : store.banner_path);
      if (path) {
        qc.invalidateQueries({ queryKey: ['my-store'] });
        qc.invalidateQueries({ queryKey: ['store'] });
        qc.invalidateQueries({ queryKey: ['explore'] });
      }
    } catch (e) {
      Alert.alert(kind === 'avatar' ? '頭貼沒有更新' : '背景圖沒有更新', e instanceof UploadError ? e.message : '請檢查網路後再試一次。');
    } finally {
      setUploading(null);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setSlug(slugInput.trim().toLowerCase()), 400);
    return () => clearTimeout(t);
  }, [slugInput]);

  const slugChanged = slug !== store.slug;
  const slugValid = SLUG_PATTERN.test(slug);
  const avail = useSlugAvailability(slugValid ? slug : '', store.slug);
  const slugOk = !slugChanged || (slugValid && avail.data?.available === true);
  const dirty =
    name.trim() !== store.name || ownerName.trim() !== store.owner_name || (tagline.trim() || null) !== store.tagline || slugChanged || color !== store.color;
  const canSave = dirty && name.trim().length > 0 && ownerName.trim().length > 0 && slugOk && slugInput.trim().toLowerCase() === slug;

  const slugHint = !slugChanged
    ? null
    : !slugValid
      ? { ok: false, text: '只能用小寫英文、數字和「-」，3–30 個字，開頭結尾不能是「-」' }
      : avail.isFetching
        ? { ok: true, text: '檢查中…' }
        : avail.data?.available
          ? { ok: true, text: '✓ 可以使用' }
          : { ok: false, text: `已經有人用了${avail.data?.suggestions.length ? `，試試 ${avail.data.suggestions.slice(0, 2).join('、')}` : ''}` };

  const save = () =>
    update.mutate(
      { name: name.trim(), owner_name: ownerName.trim(), tagline: tagline.trim() || null, slug, color },
      { onSuccess: () => router.back(), onError: (e) => Alert.alert('沒有儲存成功', readingError(e.message)) },
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: '編輯書店資料' }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.xl }} keyboardShouldPersistTaps="handled">
          <View style={[styles.banner, { backgroundColor: StoreColors[color].hex }]}>
            {bannerUri ? <Image source={{ uri: bannerUri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
            {bannerUri ? <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(31,27,22,0.45)' }]} /> : null}
            <StoreAvatar name={name || store.name} color={color} size={56} path={store.avatar_path} />
            <View style={{ flex: 1 }}>
              <AppText variant="heading" style={{ color: '#FFFFFF' }}>{name || '書店名稱'}</AppText>
              {tagline ? <AppText variant="caption" style={{ color: '#FFFFFF' }} numberOfLines={2}>{tagline}</AppText> : null}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: Spacing.md }}>
            <Button kind="secondary" label="更換頭貼" style={{ flex: 1 }} loading={uploading === 'avatar'} disabled={!!uploading} onPress={() => upload('avatar')} />
            <Button kind="secondary" label="更換背景圖" style={{ flex: 1 }} loading={uploading === 'banner'} disabled={!!uploading} onPress={() => upload('banner')} />
          </View>
          <AppText variant="caption" muted>頭貼 400×400、背景圖 1500×500，5MB 以內。沒有上傳時使用店面顏色。</AppText>

          <TextField label="書店名稱" max={20} value={name} onChangeText={setName} />
          <TextField label="店主名稱" max={20} value={ownerName} onChangeText={setOwnerName} />
          <TextField label="一句話介紹" optional max={60} value={tagline} onChangeText={setTagline} placeholder="例如：喜歡看星星的人，書櫃也是一片夜空。" />

          <View style={{ gap: 6 }}>
            <AppText variant="label">書店網址</AppText>
            <View style={[styles.slugBox, { borderColor: slugHint && !slugHint.ok ? c.danger : c.border, backgroundColor: c.surface }]}>
              <AppText muted>{`${WEB_URL.replace(/^https?:\/\//, '')}/s/`}</AppText>
              <TextInput
                accessibilityLabel="書店網址"
                value={slugInput}
                onChangeText={(t) => setSlugInput(t.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={30}
                style={[styles.slugInput, { color: c.text }]}
              />
            </View>
            {slugHint ? (
              <AppText variant="caption" style={{ color: slugHint.ok ? c.success : c.danger }} accessibilityLiveRegion="polite">{slugHint.text}</AppText>
            ) : (
              <AppText variant="caption" muted>改網址後，舊的分享連結會失效。</AppText>
            )}
          </View>

          <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
            <AppText variant="label">店面顏色</AppText>
            <View style={styles.swatches}>
              {(Object.keys(StoreColors) as StoreColor[]).map((key) => {
                const selected = key === color;
                return (
                  <Pressable key={key} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={StoreColors[key].label} onPress={() => setColor(key)} style={styles.swatch}>
                    <View style={[styles.dot, { backgroundColor: StoreColors[key].hex, borderColor: selected ? c.text : 'transparent' }]} />
                    <AppText variant="caption" style={{ fontWeight: selected ? '700' : '400' }}>{StoreColors[key].label}</AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        <Button kind="secondary" label="取消" style={{ flex: 1 }} onPress={() => router.back()} />
        <Button label="儲存變更" style={{ flex: 2 }} disabled={!canSave} loading={update.isPending} onPress={save} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: Radius.xl, padding: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 110, overflow: 'hidden' },
  slugBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.md, paddingLeft: 14, minHeight: 48 },
  slugInput: { flex: 1, fontSize: 16, minHeight: 48, outlineWidth: 0 },
  swatches: { flexDirection: 'row', justifyContent: 'space-between' },
  swatch: { alignItems: 'center', gap: 4, minWidth: MinTouch, minHeight: MinTouch },
  dot: { width: 40, height: 40, borderRadius: 20, borderWidth: 3 },
  footer: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.xl, paddingBottom: 34, borderTopWidth: StyleSheet.hairlineWidth },
});
