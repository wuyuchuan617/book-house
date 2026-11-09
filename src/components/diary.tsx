import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { KindChip } from '@/components/note-card';
import { StoreAvatar } from '@/components/social';
import { AppText, Card } from '@/components/ui';
import { Radius, Spacing, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  addDays,
  categoryIcon,
  categoryLabel,
  formatDistance,
  useDiaryImageUrls,
  type DiaryEntry,
  type DiaryItem,
  type PublicCheckin,
  type Streak,
} from '@/lib/diary';
import { tr } from '@/lib/i18n';

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO → 台北 'HH:mm' */
export function taipeiTime(iso: string) {
  const d = new Date(new Date(iso).getTime() + 8 * 3600e3);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

/** 日記／打卡的照片（非公開 bucket，短效網址） */
export function DiaryPhotos({ paths, size = 84, full }: { paths: string[]; size?: number; full?: boolean }) {
  const c = useTheme();
  const { data: urls } = useDiaryImageUrls(paths);
  if (!paths.length) return null;
  return (
    <View style={{ flexDirection: full ? 'column' : 'row', gap: 6 }}>
      {paths.map((p, i) => (
        <Image
          key={p}
          source={urls?.[i] ? { uri: urls[i]! } : undefined}
          style={full ? { width: '100%', aspectRatio: 4 / 3, borderRadius: Radius.md, backgroundColor: c.surfaceMuted } : { width: size, height: size, borderRadius: 10, backgroundColor: c.surfaceMuted }}
          contentFit="cover"
          accessibilityLabel={tr('日記的照片 {n}', { n: i + 1 })}
        />
      ))}
    </View>
  );
}

function BookLine({ book, color }: { book: { id: string; title: string; cover_url: string | null }; color: StoreColor }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
      <BookCover title={book.title} url={book.cover_url} color={color} size="sm" />
      <AppText variant="caption" muted numberOfLines={1} style={{ flex: 1 }}>{book.title}</AppText>
    </View>
  );
}

/** 時間軸上的一項：自己記的（筆記、打卡）是卡片；自動帶入的（心得、想讀、開始讀、讀完）是一行 */
export function DiaryItemRow({ item, color = 'moss' }: { item: DiaryItem; color?: StoreColor }) {
  const c = useTheme();
  const time = item.at ? taipeiTime(item.at) : null;

  if (item.type === 'note' || item.type === 'checkin') {
    const placeName = item.place_name ?? item.place_label;
    return (
      <Card style={{ gap: Spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Feather name={item.type === 'checkin' ? 'map-pin' : 'edit-3'} size={14} color={item.type === 'checkin' ? c.primary : c.textSecondary} />
          {item.type === 'checkin' ? (
            <Pressable
              accessibilityRole={item.place_id ? 'link' : undefined}
              disabled={!item.place_id}
              onPress={() => item.place_id && router.push({ pathname: '/place/[id]', params: { id: item.place_id } })}
              style={{ flexShrink: 1 }}>
              <AppText variant="label" numberOfLines={1} style={{ color: item.place_id ? c.primary : c.text }}>{placeName}</AppText>
            </Pressable>
          ) : (
            <AppText variant="caption" muted>{tr('筆記')}</AppText>
          )}
          <View style={{ flex: 1 }} />
          {item.is_public ? (
            <View style={[styles.badge, { backgroundColor: c.successSurface }]}>
              <AppText variant="caption" style={{ color: c.success, fontWeight: '700', fontSize: 11 }}>{tr('公開')}</AppText>
            </View>
          ) : null}
          {time ? <AppText variant="caption" style={{ color: c.textTertiary }}>{time}</AppText> : null}
        </View>
        {item.body ? <AppText style={{ lineHeight: 23 }}>{item.body}</AppText> : null}
        <DiaryPhotos paths={item.photo_paths} />
        {item.book ? <BookLine book={item.book} color={color} /> : null}
        {item.reading_note_id && item.reading_id ? (
          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/reading/note/[id]', params: { id: item.reading_note_id!, readingId: item.reading_id! } })} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Feather name="feather" size={12} color={c.primary} />
            <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('也存成了這本書的心得')}</AppText>
          </Pressable>
        ) : null}
      </Card>
    );
  }

  const auto = item as Exclude<DiaryItem, DiaryEntry>;
  const open = () => {
    if (auto.type === 'reading_note') router.push({ pathname: '/reading/note/[id]', params: { id: auto.id, readingId: auto.reading_id } });
    else if (auto.type === 'started' || auto.type === 'finished') router.push({ pathname: '/reading/manage/[id]', params: { id: auto.reading_id } });
    else router.push({ pathname: '/book/[id]', params: { id: auto.book.id } });
  };
  const icon = auto.type === 'reading_note' ? 'feather' : auto.type === 'saved' ? 'bookmark' : auto.type === 'started' ? 'book-open' : 'check-circle';
  const text =
    auto.type === 'reading_note'
      ? auto.title || auto.body
      : auto.type === 'saved'
        ? tr('加入想讀「{title}」', { title: auto.book.title })
        : auto.type === 'started'
          ? tr('開始讀「{title}」', { title: auto.book.title })
          : tr('讀完「{title}」', { title: auto.book.title });
  const sub = auto.type === 'reading_note' ? auto.book.title : auto.type === 'saved' ? auto.source : null;
  return (
    <Pressable accessibilityRole="link" onPress={open} style={({ pressed }) => [styles.auto, { borderColor: c.border, opacity: pressed ? 0.8 : 1 }]}>
      <Feather name={icon} size={16} color={c.textSecondary} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {auto.type === 'reading_note' ? <KindChip kind={auto.kind} /> : null}
          <AppText numberOfLines={2} style={{ flex: 1, fontSize: 15 }}>{text}</AppText>
        </View>
        {sub ? <AppText variant="caption" muted numberOfLines={1}>{sub}</AppText> : null}
      </View>
      {time ? <AppText variant="caption" style={{ color: c.textTertiary }}>{time}</AppText> : null}
    </Pressable>
  );
}

/** D1 連續記錄＋本週七格 */
export function StreakCard({ streak, today, activeDays, onPress }: { streak: Streak; today: string; activeDays: Set<string>; onPress?: () => void }) {
  const c = useTheme();
  // 本週一～週日
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDays(today, -dow);
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const names = [tr('一'), tr('二'), tr('三'), tr('四'), tr('五'), tr('六'), tr('日')];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={tr('連續記錄 {n} 天，打開月曆', { n: streak.current_streak })} onPress={onPress}>
      <Card style={{ gap: Spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm }}>
          <AppText style={{ fontSize: 34, fontWeight: '800', color: c.primary, lineHeight: 38 }}>{streak.current_streak}</AppText>
          <AppText variant="label" style={{ marginBottom: 4 }}>{tr('天連續記錄')}</AppText>
          <View style={{ flex: 1 }} />
          <AppText variant="caption" muted style={{ marginBottom: 4 }}>{tr('本月 {m} 天 · 最長 {l} 天', { m: streak.month_days, l: streak.longest_streak })}</AppText>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {week.map((d, i) => {
            const on = activeDays.has(d);
            const isToday = d === today;
            const future = d > today;
            return (
              <View key={d} style={{ alignItems: 'center', gap: 4 }}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: on ? c.primary : 'transparent', borderColor: on ? c.primary : isToday ? c.primary : c.border, borderStyle: future ? 'dashed' : 'solid' },
                  ]}>
                  {on ? <Feather name="check" size={14} color={c.onPrimary} /> : null}
                </View>
                <AppText variant="caption" style={{ fontSize: 11, color: isToday ? c.primary : c.textTertiary, fontWeight: isToday ? '700' : '500' }}>{names[i]}</AppText>
              </View>
            );
          })}
        </View>
        {!streak.today_done ? (
          <AppText variant="caption" muted>{streak.current_streak ? tr('今天還沒記，記一筆就能延續。') : tr('今天記一筆，開始連續記錄。')}</AppText>
        ) : null}
      </Card>
    </Pressable>
  );
}

/** 書的地方列表的一列（L2 探索、L3 書櫃） */
export function PlaceRow({
  place,
  meta,
  onPress,
  isIndie,
}: {
  place: { id: string; name: string; address: string | null; category: string; photo_paths: string[]; distance_m?: number | null; saved?: boolean; is_indie?: boolean };
  meta: string;
  onPress?: () => void;
  isIndie?: boolean;
}) {
  const c = useTheme();
  const { data: urls } = useDiaryImageUrls(place.photo_paths.slice(0, 1));
  const distance = formatDistance(place.distance_m ?? null);
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress ?? (() => router.push({ pathname: '/place/[id]', params: { id: place.id } }))}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <Card style={{ flexDirection: 'row', gap: Spacing.md, alignItems: 'center' }}>
        <View style={[styles.thumb, { backgroundColor: c.surfaceMuted }]}>
          {urls?.[0] ? <Image source={{ uri: urls[0] }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Feather name={categoryIcon(place.category)} size={22} color={c.textSecondary} />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppText variant="label" numberOfLines={1} style={{ flexShrink: 1, fontSize: 16 }}>{place.name}</AppText>
            {place.saved ? <Feather name="bookmark" size={14} color={c.primary} /> : null}
          </View>
          <AppText variant="caption" muted numberOfLines={1}>{[categoryLabel(place.category, isIndie ?? place.is_indie), distance, place.address].filter(Boolean).join(' · ')}</AppText>
          <AppText variant="caption" style={{ color: c.textTertiary }}>{meta}</AppText>
        </View>
        <Feather name="chevron-right" size={18} color={c.textTertiary} />
      </Card>
    </Pressable>
  );
}

/** L1 地點頁上的一則公開打卡：只顯示日期 */
export function CheckinCard({ checkin, onMore }: { checkin: PublicCheckin; onMore?: () => void }) {
  const c = useTheme();
  const color = (checkin.author_store_color ?? 'moss') as StoreColor;
  return (
    <Card style={{ gap: Spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
        <Pressable
          accessibilityRole={checkin.author_store_slug ? 'link' : undefined}
          disabled={!checkin.author_store_slug}
          onPress={() => checkin.author_store_slug && router.push({ pathname: '/store/[slug]', params: { slug: checkin.author_store_slug } })}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <StoreAvatar name={checkin.author_name} color={color} size={28} path={checkin.author_avatar_path} />
          <AppText variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>{checkin.author_name}</AppText>
        </Pressable>
        <AppText variant="caption" style={{ color: c.textTertiary }}>{md(checkin.entry_date)}</AppText>
        {onMore ? (
          <Pressable accessibilityRole="button" accessibilityLabel={tr('更多操作')} hitSlop={10} onPress={onMore} style={{ paddingLeft: 4 }}>
            <Feather name="more-horizontal" size={18} color={c.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      {checkin.body ? <AppText style={{ lineHeight: 23 }}>{checkin.body}</AppText> : null}
      <DiaryPhotos paths={checkin.photo_paths} />
      {checkin.book_id && checkin.book_title ? (
        <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/book/[id]', params: { id: checkin.book_id! } })}>
          <BookLine book={{ id: checkin.book_id, title: checkin.book_title, cover_url: checkin.book_cover_url }} color={color} />
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  auto: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, minHeight: 52 },
  dot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 56, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
