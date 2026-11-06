import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CurationView } from '@/components/curation-view';
import { AppText, Button, EmptyState, Screen } from '@/components/ui';
import { Radius, Spacing, StoreColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { recordVisit, usePublicStore, useToggleFollow } from '@/lib/queries';

/** A3 書店頁（策展）。TODO(M3)：A4 店主閱讀分頁、⋯ 檢舉／封鎖、書籍視角、收藏書 */
export default function StoreScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const c = useTheme();
  const { requireAuth } = useAuth();
  const follow = useToggleFollow();
  const { data, isLoading } = usePublicStore(slug);
  const [index, setIndex] = useState(0);
  const current = data?.curations[index];

  useEffect(() => {
    if (current) void recordVisit(current.id);
  }, [current]);

  if (isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (!data) return <EmptyState title="找不到這間書店" body="它可能暫停營業或已經關閉。" />;

  const { store, curations } = data;
  const color = StoreColors[store.color].hex;

  return (
    <Screen>
      <Stack.Screen options={{ title: store.name }} />
      <ScrollView>
        <View style={[styles.hero, { backgroundColor: color }]}>
          <AppText variant="title" style={{ color: '#FFFFFF' }}>{store.name}</AppText>
          <AppText variant="caption" style={{ color: '#FFFFFF' }}>{`店主 ${store.owner_name} · ${store.follower_count} 人追蹤`}</AppText>
          {store.tagline ? <AppText style={{ color: '#FFFFFF', marginTop: Spacing.sm }}>{store.tagline}</AppText> : null}
          <Button
            kind="secondary"
            label="＋ 追蹤"
            style={{ marginTop: Spacing.md, alignSelf: 'flex-start', minHeight: 44 }}
            onPress={() => requireAuth(() => follow.mutate({ bookstoreId: store.id, follow: true }))}
          />
        </View>

        {curations.length === 0 ? (
          <EmptyState title="這間書店還沒有策展" body="追蹤後，新策展上架時會通知你。" />
        ) : (
          <View style={{ padding: Spacing.xl, gap: Spacing.md }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
              {curations.map((cur, i) => (
                <Pressable
                  key={cur.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: i === index }}
                  onPress={() => setIndex(i)}
                  style={[styles.pill, { backgroundColor: i === index ? c.primary : c.surface, borderColor: c.border }]}>
                  <AppText variant="caption" style={{ color: i === index ? c.onPrimary : c.text, fontWeight: '700' }}>
                    {`${Number(cur.period.slice(5, 7))} 月`}
                  </AppText>
                </Pressable>
              ))}
            </ScrollView>
            {current ? (
              <CurationView title={current.title} description={current.description} items={current.curation_items} color={store.color} />
            ) : null}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { padding: Spacing.xl, gap: 2 },
  pill: { minHeight: 44, paddingHorizontal: 14, borderRadius: Radius.pill, borderWidth: 1, justifyContent: 'center' },
});
