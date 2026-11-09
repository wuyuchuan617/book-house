import Feather from '@expo/vector-icons/Feather';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  categoryIcon,
  categoryLabel,
  newUuid,
  PLACE_LABEL_MAX,
  PlaceSearchError,
  selectPlace,
  usePlaceSearch,
  useRecentPlaces,
  type PickedPlace,
  type PlaceSuggestion,
  type RecentPlace,
} from '@/lib/diary';
import { tr } from '@/lib/i18n';
import { approximateLocation, type Coords } from '@/lib/location';

export type PlaceChoice = { kind: 'google'; place: PickedPlace } | { kind: 'label'; label: string };

/**
 * D7 選地點：搜尋 Google 地點（偏向附近）、最近去過的地點、或直接輸入名稱（只有自己看得到）。
 * 只用 Google 的 Essentials（免費額度內）；次數用完或還沒開放時，一樣可以直接輸入。
 */
export function PlacePicker({ visible, onClose, onPick, googleOnly, title }: { visible: boolean; onClose: () => void; onPick: (choice: PlaceChoice) => void; googleOnly?: boolean; title?: string }) {
  const c = useTheme();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [token, setToken] = useState(newUuid);
  const [near, setNear] = useState<Coords | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const recent = useRecentPlaces(visible);
  const search = usePlaceSearch(query, token, near);

  useEffect(() => {
    const t = setTimeout(() => setQuery(input), 350);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    if (!visible) return;
    void approximateLocation({ ask: true }).then(setNear);
  }, [visible]);

  const close = () => {
    setToken(newUuid());
    setInput('');
    setQuery('');
    onClose();
  };
  const done = (choice: PlaceChoice) => {
    setToken(newUuid());
    setInput('');
    setQuery('');
    onPick(choice);
  };

  const pickGoogle = async (s: PlaceSuggestion | RecentPlace, key: string) => {
    setBusy(key);
    try {
      const place = await selectPlace(s, token, 'public_ok' in s ? !!s.public_ok : false);
      done({ kind: 'google', place });
    } catch (e) {
      Alert.alert(tr('沒有選成功'), (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const pickRecent = (r: RecentPlace) => {
    if (r.place_id && r.name && r.google_place_id) {
      done({ kind: 'google', place: { id: r.place_id, name: r.name, address: null, category: r.category ?? 'other', public_ok: !!r.public_ok, google_place_id: r.google_place_id } });
    } else if (r.place_label) {
      done({ kind: 'label', label: r.place_label });
    }
  };

  const typed = input.trim().slice(0, PLACE_LABEL_MAX);
  const err = search.error instanceof PlaceSearchError ? search.error : search.error ? new PlaceSearchError('other', tr('地點搜尋沒有成功，可以直接輸入地點名稱。')) : null;
  const showRecent = [...query.trim()].length < 2;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <Screen>
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
          <View style={[styles.bar, { borderBottomColor: c.divider }]}>
            <View style={{ width: 64 }} />
            <AppText variant="label" style={{ fontSize: 16 }}>{title ?? tr('選地點')}</AppText>
            <Pressable accessibilityRole="button" onPress={close} style={styles.barBtn}>
              <AppText style={{ color: c.primary, fontWeight: '600' }}>{tr('取消')}</AppText>
            </Pressable>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Feather name="search" size={18} color={c.textSecondary} />
              <TextInput
                autoFocus
                accessibilityLabel={tr('搜尋書店、圖書館、咖啡店…')}
                placeholder={tr('搜尋書店、圖書館、咖啡店…')}
                placeholderTextColor={c.textTertiary}
                value={input}
                onChangeText={setInput}
                returnKeyType="search"
                onSubmitEditing={() => setQuery(input)}
                style={[styles.input, { color: c.text }]}
              />
              {search.isFetching ? <ActivityIndicator style={{ marginRight: Spacing.md }} /> : null}
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
              {showRecent ? (
                <>
                  {recent.data?.some((r) => !googleOnly || r.place_id) ? (
                    <>
                      <AppText variant="caption" muted style={styles.section}>{tr('最近去過')}</AppText>
                      {recent.data.filter((r) => !googleOnly || r.place_id).map((r) => (
                        <Row
                          key={r.place_id ?? r.place_label ?? ''}
                          icon={r.place_id ? categoryIcon(r.category) : 'edit-3'}
                          title={r.name ?? r.place_label ?? ''}
                          sub={r.place_id ? categoryLabel(r.category) : tr('自己輸入的地點 · 只有自己看得到')}
                          onPress={() => pickRecent(r)}
                        />
                      ))}
                    </>
                  ) : null}
                  <AppText variant="caption" muted style={{ marginTop: Spacing.lg, lineHeight: 19 }}>
                    {tr('輸入兩個字以上開始搜尋。書店、圖書館、咖啡店、公園這類公開場所可以公開分享；住家地址只會留在自己的日記裡。')}
                  </AppText>
                </>
              ) : (
                <>
                  {err ? (
                    <View style={[styles.notice, { backgroundColor: c.surfaceMuted }]}>
                      <Feather name="info" size={16} color={c.textSecondary} />
                      <AppText variant="caption" style={{ flex: 1, color: c.textSecondary }}>{err.message}</AppText>
                    </View>
                  ) : null}
                  {(search.data ?? []).map((s) => (
                    <Row
                      key={s.googlePlaceId}
                      icon={categoryIcon(s.category)}
                      title={s.name}
                      sub={[s.public_ok ? categoryLabel(s.category) : tr('私人地點 · 不能公開'), s.address].filter(Boolean).join(' · ')}
                      busy={busy === s.googlePlaceId}
                      disabled={!!busy}
                      onPress={() => void pickGoogle(s, s.googlePlaceId)}
                    />
                  ))}
                  {search.data && !search.data.length && !err ? <AppText variant="caption" muted style={styles.section}>{tr('找不到符合的地點。')}</AppText> : null}
                  {typed && !googleOnly ? (
                    <Row icon="edit-3" title={tr('直接使用「{name}」', { name: typed })} sub={tr('不連到地圖 · 只有自己看得到')} onPress={() => done({ kind: 'label', label: typed })} />
                  ) : null}
                  {search.data?.length ? <AppText variant="caption" style={{ color: c.textTertiary, marginTop: Spacing.md, textAlign: 'right' }}>{tr('地點資料來自 Google')}</AppText> : null}
                </>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Screen>
    </Modal>
  );
}

function Row({ icon, title, sub, onPress, busy, disabled }: { icon: React.ComponentProps<typeof Feather>['name']; title: string; sub: string; onPress: () => void; busy?: boolean; disabled?: boolean }) {
  const c = useTheme();
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.row, { borderBottomColor: c.divider, opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.rowIcon, { backgroundColor: c.surfaceMuted }]}>
        <Feather name={icon} size={16} color={c.textSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="label" numberOfLines={1}>{title}</AppText>
        <AppText variant="caption" muted numberOfLines={1}>{sub}</AppText>
      </View>
      {busy ? <ActivityIndicator /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  barBtn: { width: 64, minHeight: MinTouch, alignItems: 'flex-end', justifyContent: 'center' },
  search: { margin: Spacing.xl, marginBottom: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.md, paddingLeft: 14, minHeight: 48 },
  input: { flex: 1, fontSize: 16, minHeight: 48 },
  section: { marginTop: Spacing.md, marginBottom: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 60, borderBottomWidth: StyleSheet.hairlineWidth },
  rowIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  notice: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', borderRadius: Radius.md, padding: Spacing.md, marginTop: Spacing.sm },
});
