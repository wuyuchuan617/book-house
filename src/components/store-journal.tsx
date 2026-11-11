import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { BookLine, VisibilityBadge } from '@/components/diary';
import { Chip, chipRow } from '@/components/form';
import { AppText, Card } from '@/components/ui';
import { Radius, Spacing, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { track } from '@/lib/analytics';
import { categoryLabel, diaryError, useDiaryImageUrls, useSetJournalPublic, useStoreJournal, type JournalItem } from '@/lib/diary';
import { taipeiDate } from '@/lib/period';
import { tr } from '@/lib/i18n';

type Filter = 'all' | 'want' | 'place' | 'post';

/**
 * 店主手記：想讀、想去、日記貼文依時間混在一起。
 * mine（G2）：自己看全部，每一則標出書店頁看不看得到，點標籤可以切換；讀者（G4）：只看公開的。
 */
export function StoreJournal({ bookstoreId, color, mine }: { bookstoreId: string; color: StoreColor; mine?: boolean }) {
  const c = useTheme();
  const { data, isLoading } = useStoreJournal(bookstoreId);
  const [filter, setFilter] = useState<Filter>('all');
  const setPublic = useSetJournalPublic();

  if (isLoading || !data) return <ActivityIndicator style={{ marginTop: 32 }} />;
  const items = data.filter((i) => filter === 'all' || i.type === filter);

  const toggle = (item: JournalItem) => {
    const value = !item.is_public;
    if (value && item.type === 'place' && !item.public_ok) return Alert.alert(tr('私人地點不能公開'), tr('住家等私人地點只會留在自己的書櫃裡。'));
    track('journal_visibility_changed', { type: item.type, value });
    setPublic.mutate(
      { item, value },
      {
        onError: (e) =>
          Alert.alert(
            tr('沒有成功'),
            e.message.includes('only be written for today') ? tr('過了當天的日記只能改成只有自己，不能再公開。') : diaryError(e.message),
          ),
      },
    );
  };

  const FILTERS: [Filter, string][] = [
    ['all', tr('全部')],
    ['want', tr('想讀')],
    ['place', tr('想去')],
    ['post', tr('日記')],
  ];

  return (
    <View style={{ gap: Spacing.md }}>
      <View style={chipRow}>
        {FILTERS.map(([f, label]) => <Chip key={f} label={label} selected={filter === f} onPress={() => setFilter(f)} />)}
      </View>
      {items.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 24 }}>
          <AppText variant="label">{mine ? tr('這裡還沒有東西') : tr('店主還沒有公開的手記')}</AppText>
          <AppText variant="caption" muted style={{ textAlign: 'center' }}>
            {mine ? tr('按右下角的＋記想讀的書、想去的地點或寫日記，設成公開就會出現在書店頁。') : tr('店主公開的想讀、想去和日記會出現在這裡。')}
          </AppText>
        </Card>
      ) : (
        items.map((item) => <JournalCard key={`${item.type}-${item.id}`} item={item} color={color} mine={mine} onToggle={() => toggle(item)} />)
      )}
      {mine && items.length ? (
        <AppText variant="caption" style={{ color: c.textTertiary }}>{tr('點右上角的標籤可以切換「書店頁／只有自己」。哪幾類會顯示，看上方的「公開設定」。')}</AppText>
      ) : null}
    </View>
  );
}

function JournalCard({ item, color, mine, onToggle }: { item: JournalItem; color: StoreColor; mine?: boolean; onToggle: () => void }) {
  const c = useTheme();
  const kind = item.type === 'want' ? { label: tr('想讀'), fg: c.primary, icon: 'bookmark' as const } : item.type === 'place' ? { label: tr('想去'), fg: '#2F5D6B', icon: 'map-pin' as const } : item.book ? { label: tr('正在讀'), fg: c.success, icon: 'play' as const } : item.kind === 'checkin' ? { label: tr('打卡'), fg: '#5A4B8A', icon: 'map-pin' as const } : { label: tr('日記'), fg: '#5A4B8A', icon: 'edit-3' as const };
  const date = item.type === 'post' ? taipeiDate(`${item.entry_date}T04:00:00Z`).md : taipeiDate(item.at).md;

  return (
    <View style={[styles.card, { backgroundColor: c.surface }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Feather name={kind.icon} size={13} color={kind.fg} />
        <AppText variant="caption" style={{ fontWeight: '700', color: kind.fg }}>{kind.label}</AppText>
        <AppText variant="caption" muted style={{ flex: 1 }}>{`· ${date}`}</AppText>
        {mine ? (
          <Pressable accessibilityRole="button" accessibilityLabel={item.shown ? tr('改成只有自己') : tr('顯示在書店頁')} hitSlop={8} onPress={onToggle}>
            {item.shown ? (
              <VisibilityBadge v={{ public: true, where: 'store' }} />
            ) : item.is_public ? (
              <AppText variant="caption" style={{ fontSize: 11, color: c.textTertiary }}>{tr('公開・這類沒開')}</AppText>
            ) : (
              <VisibilityBadge v={{ public: false }} />
            )}
          </Pressable>
        ) : null}
      </View>

      {item.type === 'want' ? (
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/book/[id]', params: { id: item.book.id } })} style={{ flexDirection: 'row', gap: Spacing.md }}>
          <BookCover title={item.book.title} url={item.book.cover_url} color={color} size="sm" />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="label">{item.book.title}</AppText>
            {item.note ? <AppText style={{ lineHeight: 21 }}>{item.note}</AppText> : null}
            {item.source_text ? <AppText variant="caption" muted>{tr('在哪看到：{s}', { s: item.source_text })}</AppText> : null}
          </View>
        </Pressable>
      ) : item.type === 'place' ? (
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/place/[id]', params: { id: item.place.id } })} style={{ gap: 2 }}>
          <AppText style={{ fontSize: 16, fontWeight: '700', color: c.primary }}>{`${item.place.name} ›`}</AppText>
          {item.place.category ? <AppText variant="caption" muted>{categoryLabel(item.place.category)}</AppText> : null}
          {item.note ? <AppText style={{ lineHeight: 21, marginTop: 2 }}>{item.note}</AppText> : null}
        </Pressable>
      ) : (
        <PostBody item={item} color={color} />
      )}
    </View>
  );
}

function PostBody({ item, color }: { item: Extract<JournalItem, { type: 'post' }>; color: StoreColor }) {
  const c = useTheme();
  const photos = useDiaryImageUrls(item.photo_paths);
  const placeName = item.place?.name ?? item.place_label;
  return (
    <View style={{ gap: Spacing.sm }}>
      {placeName ? (
        <Pressable accessibilityRole={item.place ? 'link' : undefined} disabled={!item.place} onPress={() => item.place && router.push({ pathname: '/place/[id]', params: { id: item.place.id } })}>
          <AppText style={{ fontWeight: '700', color: item.place ? c.primary : c.text }}>{item.place ? `⌖ ${placeName} ›` : `⌖ ${placeName}`}</AppText>
        </Pressable>
      ) : null}
      {item.body ? <AppText style={{ fontSize: 15, lineHeight: 23 }}>{item.body}</AppText> : null}
      {item.photo_paths.length ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {item.photo_paths.map((p, i) => (
            <Image key={p} source={photos.data?.[i] ? { uri: photos.data[i]! } : undefined} style={[styles.photo, { backgroundColor: c.surfaceMuted }]} contentFit="cover" accessibilityLabel={tr('日記的照片 {n}', { n: i + 1 })} />
          ))}
        </View>
      ) : null}
      {item.book ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <View style={{ flex: 1 }}>
            <BookLine book={item.book} color={color} />
          </View>
          {item.page_ref ? <AppText variant="caption" muted>{item.page_ref}</AppText> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.sm },
  photo: { width: 96, height: 72, borderRadius: 10 },
});
