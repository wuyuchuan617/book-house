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

export type Visibility = { public: boolean; where?: 'place' | 'store' };

/** 每一項是誰看得到：日記、想讀只有自己；打卡看有沒有公開；心得、開始讀、讀完跟著那本書 */
export function visibilityOf(item: DiaryItem): Visibility {
  switch (item.type) {
    case 'checkin':
      return item.is_public ? { public: true, where: 'place' } : { public: false };
    case 'reading_note':
    case 'started':
    case 'finished':
      return item.is_public ? { public: true, where: 'store' } : { public: false };
    default:
      return { public: false };
  }
}

/** 公開／只有自己的標籤：綠底地球＝公開，灰底鎖＝只有自己 */
export function VisibilityBadge({ v, compact }: { v: Visibility; compact?: boolean }) {
  const c = useTheme();
  const label = v.public ? (v.where === 'place' ? tr('公開・地點頁') : tr('公開・書店頁')) : tr('只有自己');
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[styles.vis, { backgroundColor: v.public ? c.successSurface : c.surfaceMuted }]}>
      <Feather name={v.public ? 'globe' : 'lock'} size={11} color={v.public ? c.success : c.textSecondary} />
      {compact ? null : <AppText variant="caption" style={{ fontSize: 11, fontWeight: '700', color: v.public ? c.success : c.textSecondary }}>{label}</AppText>}
    </View>
  );
}

const TYPE_ICON = { note: 'edit-3', checkin: 'map-pin', reading_note: 'feather', saved: 'bookmark', started: 'book-open', finished: 'check-circle' } as const;

function typeLabel(item: DiaryItem) {
  switch (item.type) {
    case 'note':
      return tr('日記');
    case 'checkin':
      return tr('打卡');
    case 'reading_note':
      return tr('心得');
    case 'saved':
      return tr('加入想讀');
    case 'started':
      return tr('開始讀');
    case 'finished':
      return tr('讀完');
  }
}

/**
 * 時間軸上的一項（D1／D4）：左邊時間＋圓點（公開實心綠點、只有自己空心點），
 * 右邊卡片：類型＋公開標籤，內容。自己寫的（日記、打卡）是白底卡片；自動帶入的（心得、想讀、開始讀、讀完）是虛線框。
 */
export function DiaryItemRow({ item, color = 'moss', last }: { item: DiaryItem; color?: StoreColor; last?: boolean }) {
  const c = useTheme();
  const v = visibilityOf(item);
  const time = item.at ? taipeiTime(item.at) : null;
  const own = item.type === 'note' || item.type === 'checkin';

  const open = () => {
    if (item.type === 'reading_note') router.push({ pathname: '/reading/note/[id]', params: { id: item.id, readingId: item.reading_id } });
    else if (item.type === 'started' || item.type === 'finished') router.push({ pathname: '/reading/manage/[id]', params: { id: item.reading_id } });
    else if (item.type === 'saved') router.push({ pathname: '/book/[id]', params: { id: item.book.id } });
  };

  return (
    <View style={styles.row}>
      <View style={styles.timeCol}>
        <AppText variant="caption" style={{ color: c.textTertiary, fontSize: 11 }}>{time ?? ''}</AppText>
      </View>
      <View style={styles.rail}>
        <View style={[styles.railDot, v.public ? { backgroundColor: c.success, borderColor: c.success } : { backgroundColor: c.background, borderColor: c.textTertiary }]} />
        {!last ? <View style={[styles.railLine, { backgroundColor: c.border }]} /> : null}
      </View>
      <View style={{ flex: 1, paddingBottom: last ? 0 : Spacing.md }}>
        <Pressable
          accessibilityRole={own ? undefined : 'link'}
          disabled={own}
          onPress={open}
          style={({ pressed }) => [
            styles.card,
            own ? { backgroundColor: c.surface } : { borderWidth: 1, borderStyle: 'dashed', borderColor: c.border },
            v.public && own ? { borderLeftWidth: 3, borderLeftColor: c.success } : null,
            { opacity: pressed ? 0.85 : 1 },
          ]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Feather name={TYPE_ICON[item.type]} size={13} color={own ? c.text : c.textSecondary} />
            <AppText variant="caption" style={{ fontWeight: '700', color: own ? c.text : c.textSecondary }}>{typeLabel(item)}</AppText>
            {item.type === 'reading_note' ? <KindChip kind={item.kind} /> : null}
            {!own ? <AppText variant="caption" style={{ color: c.textTertiary, fontSize: 11 }}>{tr('自動帶入')}</AppText> : null}
            <View style={{ flex: 1 }} />
            <VisibilityBadge v={v} />
          </View>
          <ItemBody item={item} color={color} />
        </Pressable>
      </View>
    </View>
  );
}

function ItemBody({ item, color }: { item: DiaryItem; color: StoreColor }) {
  const c = useTheme();
  if (item.type === 'note' || item.type === 'checkin') {
    const placeName = item.place_name ?? item.place_label;
    return (
      <View style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
        {item.type === 'checkin' ? (
          <Pressable
            accessibilityRole={item.place_id ? 'link' : undefined}
            disabled={!item.place_id}
            onPress={() => item.place_id && router.push({ pathname: '/place/[id]', params: { id: item.place_id } })}>
            <AppText variant="label" numberOfLines={1} style={{ color: item.place_id ? c.primary : c.text, fontSize: 16 }}>{placeName}</AppText>
          </Pressable>
        ) : null}
        {item.body ? <AppText style={{ lineHeight: 23 }}>{item.body}</AppText> : null}
        <DiaryPhotos paths={item.photo_paths} size={76} />
        {item.book ? <BookLine book={item.book} color={color} /> : null}
        {item.reading_note_id && item.reading_id ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/reading/note/[id]', params: { id: item.reading_note_id!, readingId: item.reading_id! } })}
            hitSlop={6}
            style={[styles.linked, { borderTopColor: c.divider }]}>
            <Feather name="feather" size={12} color={c.textSecondary} />
            <AppText variant="caption" muted style={{ flex: 1 }}>{tr('也存成了這本書的心得')}</AppText>
            <VisibilityBadge v={{ public: !!item.note_public, where: 'store' }} />
          </Pressable>
        ) : null}
      </View>
    );
  }
  const auto = item as Exclude<DiaryItem, { type: 'note' | 'checkin' }>;
  const text = auto.type === 'reading_note' ? auto.title || auto.body : tr('「{title}」', { title: auto.book.title });
  const sub = auto.type === 'reading_note' ? auto.book.title : auto.type === 'saved' ? auto.source : null;
  return (
    <View style={{ marginTop: 6, gap: 2 }}>
      <AppText numberOfLines={2} style={{ fontSize: 15, lineHeight: 21 }}>{text}</AppText>
      {sub ? <AppText variant="caption" muted numberOfLines={1}>{sub}</AppText> : null}
    </View>
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
          <AppText variant="caption" muted>{streak.current_streak ? tr('今天還沒記，寫一句日記就能延續。') : tr('今天寫一句日記，開始連續記錄。')}</AppText>
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
  vis: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  row: { flexDirection: 'row' },
  timeCol: { width: 40, paddingTop: 13 },
  rail: { width: 18, alignItems: 'center' },
  railDot: { width: 11, height: 11, borderRadius: 6, borderWidth: 2, marginTop: 15 },
  railLine: { width: 1.5, flex: 1, marginTop: 4 },
  card: { borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, marginLeft: 6 },
  linked: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.sm },
  dot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 56, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
