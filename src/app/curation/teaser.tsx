import Feather from '@expo/vector-icons/Feather';
import { router, Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { TextField, Toggle } from '@/components/form';
import { AppText, Button, Card, EmptyState, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { sortedItems, useCuration } from '@/lib/curations';
import { bookTitle, tr } from '@/lib/i18n';
import { currentPeriod, monthOf } from '@/lib/period';
import { useMyStore } from '@/lib/queries';
import { teaserError, useSetTeaser, useTeaserSettings } from '@/lib/teaser';

const MAX = 3;

/** AD2 預告這檔策展：開關、一句話、先公開哪幾本（最多 3 本，只公開書不含理由）；按儲存才送出 */
export default function TeaserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const { data: cur, isLoading } = useCuration(id);
  const { data: settings, isLoading: loadingSettings } = useTeaserSettings(id);
  const { data: mine } = useMyStore();
  const save = useSetTeaser();
  const [on, setOn] = useState(true);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current || !settings) return;
    loaded.current = true;
    setOn(true); // 從「預告這檔策展」進來，預設就是要開
    setText(settings.teaser_text ?? '');
    setPicked(settings.curation_items.filter((i) => i.teaser).map((i) => i.id));
  }, [settings]);

  const dirty = !!settings && (on !== true || text.trim() !== (settings.teaser_text ?? '') || picked.join() !== settings.curation_items.filter((i) => i.teaser).map((i) => i.id).join());
  usePreventRemove(dirty && !done, ({ repeat }) => {
    Alert.alert(tr('放棄這次的修改？'), tr('還沒儲存的內容會不見。'), [
      { text: tr('繼續編輯'), style: 'cancel' },
      { text: tr('放棄'), style: 'destructive', onPress: repeat },
    ]);
  });

  if (isLoading || loadingSettings) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (!cur) return <EmptyState title={tr('找不到這檔策展')} body={tr('它可能已經被刪除了。')} />;
  if (!settings) return <EmptyState title={tr('預告還不能用')} body={tr('伺服器還沒更新，稍後再試。')} />;
  if (cur.period <= currentPeriod() || cur.status === 'published') return <EmptyState title={tr('這檔不能預告')} body={tr('只能預告下個月以後、還沒上架的策展。')} />;

  const items = sortedItems(cur);
  const toggle = (itemId: string) =>
    setPicked((p) => (p.includes(itemId) ? p.filter((x) => x !== itemId) : p.length >= MAX ? p : [...p, itemId]));
  const submit = () =>
    save.mutate(
      { id: cur.id, on, text, itemIds: on ? picked : [] },
      {
        onSuccess: () => {
          setDone(true);
          setTimeout(() => router.back(), 0);
        },
        onError: (e) => Alert.alert(tr('沒有儲存成功'), teaserError(e.message)),
      },
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('預告 {m} 月策展', { m: monthOf(cur.period) }) }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }} keyboardShouldPersistTaps="handled">
          <Card style={styles.row}>
            <View style={{ flex: 1 }}>
              <AppText variant="label">{tr('在書店頁預告')}</AppText>
              <AppText variant="caption" muted>{tr('追蹤者和逛到書店頁的人會看到預告卡，可以按「上架提醒我」')}</AppText>
            </View>
            <Toggle value={on} onValueChange={setOn} accessibilityLabel={tr('在書店頁預告')} />
          </Card>
          {on ? (
            <>
              <TextField label={tr('預告一句話')} optional multiline max={80} value={text} onChangeText={setText} placeholder={tr('沒寫就用策展說明的第一句')} />
              <View style={{ gap: Spacing.sm }}>
                <AppText variant="label">
                  {tr('先公開哪幾本')} <AppText variant="caption" muted>{tr('· 最多 3 本，只公開書，不公開推薦理由')}</AppText>
                </AppText>
                <Card style={{ paddingVertical: 0 }}>
                  {items.length === 0 ? (
                    <AppText variant="caption" muted style={{ paddingVertical: Spacing.lg }}>{tr('書架還沒有書；也可以都不公開，只放一句話。')}</AppText>
                  ) : (
                    items.map((it, i) => {
                      const sel = picked.includes(it.id);
                      return (
                        <Pressable
                          key={it.id}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: sel, disabled: !sel && picked.length >= MAX }}
                          onPress={() => toggle(it.id)}
                          style={[styles.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }]}>
                          <BookCover title={it.books.title} url={it.books.cover_url} color={mine?.store.color ?? 'moss'} size="sm" />
                          <AppText style={{ flex: 1 }} numberOfLines={2}>{bookTitle(it.books.title)}</AppText>
                          <View style={[styles.box, { borderColor: sel ? c.primary : c.border, backgroundColor: sel ? c.primary : 'transparent' }]}>
                            {sel ? <Feather name="check" size={14} color={c.onPrimary} /> : null}
                          </View>
                        </Pressable>
                      );
                    })
                  )}
                </Card>
              </View>
            </>
          ) : null}
          <AppText variant="caption" muted>{tr('上架那天預告卡自動換成正式策展，按過提醒的人會收到通知。同時只能有一檔預告，開新的會關掉舊的。')}</AppText>
        </ScrollView>
      </KeyboardAvoidingView>
      <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        <Button label={on ? tr('儲存預告') : tr('關掉預告')} loading={save.isPending} disabled={settings.teaser_on && !dirty} onPress={submit} />
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
});
