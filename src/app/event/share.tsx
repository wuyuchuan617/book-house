import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AboutLink } from '@/components/about';
import { DaySheet } from '@/components/day-sheet';
import { VisibilityBadge } from '@/components/diary';
import { TimeSheet, timeLabel } from '@/components/time-sheet';
import { EventInfo, sharersLine } from '@/components/event-card';
import { Chip, chipRow, TextField, Toggle } from '@/components/form';
import { PlacePicker } from '@/components/place-picker';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dayLabel, DIARY_PHOTO_MAX, type DiaryPhoto } from '@/lib/diary';
import { EVENT_TYPE_LABEL, EVENT_TYPES, eventError, useCreateEvent, useEventDetail, useFindEvents, useShareEvent, type BookEvent, type EventType } from '@/lib/events';
import { tr } from '@/lib/i18n';
import { taipeiToday } from '@/lib/period';

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
/** 'YYYY-MM-DD' + 'HH:MM'（台北時間）→ Date */
const at = (date: string, time: string) => new Date(`${date}T${time.padStart(5, '0')}:00+08:00`);

/**
 * AE1 分享活動：先找有沒有人分享過（名稱、地點或貼連結）→ 選一個直接寫分享；都不是才新增。
 * 新增時同一個連結、同地點同一天會再問一次「是不是這個？」。AE1b 寫自己的分享（活動資料是共用的，鎖住）。
 * v1.9.1 多天的活動（書展、展覽）日期可以選開始～結束；時間是第一天開始、最後一天結束。
 */
export default function ShareEventScreen() {
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const c = useTheme();
  const preset = useEventDetail(eventId);
  const [step, setStep] = useState<'find' | 'new' | 'write'>(eventId ? 'write' : 'find');
  const [picked, setPicked] = useState<BookEvent | null>(null);
  const [query, setQuery] = useState('');
  const found = useFindEvents(query);

  // 新增活動
  const [title, setTitle] = useState('');
  const [type, setType] = useState<EventType>('market');
  const [date, setDate] = useState(taipeiToday());
  const [endDate, setEndDate] = useState(date);
  const multiDay = endDate > date;
  const [start, setStart] = useState('13:00');
  const [end, setEnd] = useState('18:00');
  const [place, setPlace] = useState<{ id: string; name: string } | null>(null);
  const [online, setOnline] = useState(false);
  const [url, setUrl] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const create = useCreateEvent();

  // 寫分享
  const [bodyEdit, setBody] = useState<string | null>(null);
  const [photos, setPhotos] = useState<DiaryPhoto[]>([]);
  const [going, setGoing] = useState(true);
  const share = useShareEvent();
  const [done, setDone] = useState(false);

  const event = picked ?? preset.data ?? null;
  // 從活動頁「我也要分享」進來、而且分享過：帶出原本寫的
  const body = bodyEdit ?? preset.data?.shares.find((x) => x.is_mine)?.body ?? '';
  const dirty = !!(body.trim() || photos.length || (step === 'new' && (title.trim() || place || url.trim())));
  usePreventRemove(dirty && !done, ({ repeat }) => {
    Alert.alert(tr('放棄這次的修改？'), tr('還沒儲存的內容會不見。'), [
      { text: tr('繼續編輯'), style: 'cancel' },
      { text: tr('放棄'), style: 'destructive', onPress: repeat },
    ]);
  });

  const pick = (e: BookEvent) => {
    setPicked(e);
    setStep('write');
  };

  const startNew = () => {
    if (/^https?:\/\//i.test(query.trim())) setUrl(query.trim());
    else setTitle(query.trim().slice(0, 40));
    setStep('new');
  };

  const timesOk = TIME.test(start) && (!end || TIME.test(end));
  const canCreate = !!title.trim() && (online || !!place) && timesOk && (!url.trim() || /^https?:\/\/\S+$/i.test(url.trim()));
  // 多天的活動沒填結束時間：算到最後一天結束
  const endsAt = () => (end ? at(endDate, end) : multiDay ? at(endDate, '23:59') : null);
  const submitNew = (force = false) =>
    create.mutate(
      { e: { title, type, startsAt: at(date, start), endsAt: endsAt(), placeId: online ? null : place?.id ?? null, online, url }, force },
      {
        onSuccess: (r) => {
          if (r.duplicate) {
            const d = r.duplicate;
            Alert.alert(tr('是不是這個活動？'), tr('{title} · {who}', { title: d.title, who: sharersLine(d) || tr('已經有人新增') }), [
              { text: tr('就是這個'), onPress: () => pick(d) },
              ...(d.url && d.url === url.trim() ? [] : [{ text: tr('不是，新增'), onPress: () => submitNew(true) }]),
              { text: tr('取消'), style: 'cancel' as const },
            ]);
            return;
          }
          if (r.id) {
            setPicked({
              id: r.id, title: title.trim(), event_type: type, starts_at: at(date, start).toISOString(), ends_at: endsAt()?.toISOString() ?? null,
              online, url: url.trim() || null, place: place && !online ? { id: place.id, name: place.name, address: null } : null,
              share_count: 0, sharers: [], latest: null, going_count: 0, i_going: false, i_shared: false, mine: true,
            });
            setStep('write');
          }
        },
        onError: (e) => Alert.alert(tr('沒有新增成功'), eventError(e.message)),
      },
    );

  const submitShare = () => {
    if (!event) return;
    share.mutate(
      { eventId: event.id, body, going, photos },
      {
        onSuccess: () => {
          setDone(true);
          setTimeout(() => router.replace({ pathname: '/event/[id]', params: { id: event.id } }), 0);
        },
        onError: (e) => Alert.alert(tr('沒有分享成功'), eventError(e.message)),
      },
    );
  };

  const addPhoto = async () => {
    const left = DIARY_PHOTO_MAX - photos.length;
    if (left <= 0) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert(tr('沒有相簿權限'), tr('可以到手機設定允許書棲使用照片。'));
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsMultipleSelection: true, selectionLimit: left });
    if (!res.canceled) setPhotos((p) => [...p, ...res.assets.slice(0, left).map((a) => ({ uri: a.uri, mimeType: a.mimeType }))]);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: step === 'new' ? tr('新增活動') : step === 'write' ? tr('分享活動') : tr('分享一個活動') }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.md, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          {step === 'find' ? (
            <>
              <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.primary }]}>
                <Feather name="search" size={17} color={c.textSecondary} />
                <TextInput
                  autoFocus
                  value={query}
                  onChangeText={setQuery}
                  placeholder={tr('活動名稱、地點，或貼上活動連結')}
                  placeholderTextColor={c.textTertiary}
                  accessibilityLabel={tr('找活動')}
                  style={{ flex: 1, fontSize: 16, color: c.text, minHeight: MinTouch }}
                />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <AppText variant="caption" muted style={{ flex: 1 }}>{tr('同一個活動只會有一筆，先找找看有沒有人分享過')}</AppText>
                <AboutLink feature="event" />
              </View>
              {query.trim().length >= 2 ? (
                found.isPending ? (
                  <ActivityIndicator style={{ marginTop: 16 }} />
                ) : found.data?.length ? (
                  <>
                    <AppText variant="label">{tr('已經有人分享的活動')}</AppText>
                    {found.data.map((e) => <EventInfo key={e.id} e={e} sub={e.i_shared ? tr('你分享過了，點了可以修改') : sharersLine(e)} onPress={() => pick(e)} />)}
                  </>
                ) : (
                  <AppText variant="caption" muted>{tr('還沒有人分享這個活動。')}</AppText>
                )
              ) : null}
              <Pressable accessibilityRole="button" onPress={startNew} style={[styles.dashed, { borderColor: c.border }]}>
                <AppText variant="label" style={{ color: c.primary }}>{query.trim().length >= 2 && found.data?.length ? tr('＋ 都不是，新增一個活動') : tr('＋ 新增一個活動')}</AppText>
              </Pressable>
            </>
          ) : step === 'new' ? (
            <>
              <TextField label={tr('活動名稱')} max={40} value={title} onChangeText={setTitle} placeholder={tr('例如：冬日舊書市集')} />
              <View style={{ gap: Spacing.sm }}>
                <AppText variant="label">{tr('類型')}</AppText>
                <View style={chipRow}>{EVENT_TYPES.map((t) => <Chip key={t} label={EVENT_TYPE_LABEL()[t]} selected={type === t} onPress={() => setType(t)} />)}</View>
              </View>
              <Card style={{ paddingVertical: 0 }}>
                <Pressable accessibilityRole="button" onPress={() => setDateOpen(true)} style={[styles.row, { borderBottomColor: c.divider }]}>
                  <Feather name="calendar" size={16} color={c.text} />
                  <AppText style={{ flex: 1 }}>{tr('日期')}</AppText>
                  <AppText numberOfLines={1} style={{ flexShrink: 1 }}>{multiDay ? `${dayLabel(date)}–${dayLabel(endDate)}` : dayLabel(date)}</AppText>
                  <Feather name="chevron-right" size={16} color={c.textTertiary} />
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setTimeOpen(true)} style={[styles.row, { borderBottomColor: c.divider }]}>
                  <Feather name="clock" size={16} color={c.text} />
                  <AppText style={{ flex: 1 }}>{tr('時間')}</AppText>
                  <AppText>{end ? `${timeLabel(start)}–${timeLabel(end)}` : timeLabel(start)}</AppText>
                  <Feather name="chevron-right" size={16} color={c.textTertiary} />
                </Pressable>
                <Pressable accessibilityRole="button" disabled={online} onPress={() => setPlaceOpen(true)} style={[styles.row, { borderBottomColor: c.divider, opacity: online ? 0.5 : 1 }]}>
                  <Feather name="map-pin" size={16} color={c.text} />
                  <AppText style={{ flex: 1 }}>{tr('地點')}</AppText>
                  <AppText numberOfLines={1} style={{ maxWidth: 170, color: place ? c.text : c.primary, fontWeight: place ? '400' : '700' }}>{place?.name ?? tr('選地點')}</AppText>
                  <Feather name="chevron-right" size={16} color={c.textTertiary} />
                </Pressable>
                <View style={[styles.row, { borderBottomWidth: 0 }]}>
                  <Feather name="monitor" size={16} color={c.text} />
                  <AppText style={{ flex: 1 }}>{tr('線上活動')}</AppText>
                  <Toggle value={online} onValueChange={setOnline} accessibilityLabel={tr('線上活動')} />
                </View>
              </Card>
              <TextField label={tr('報名或活動連結')} optional max={500} value={url} onChangeText={setUrl} placeholder="https://" autoCapitalize="none" keyboardType="url" />
              <AppText variant="caption" muted>{tr('活動資料是大家共用的；新增的人可以改到活動開始。')}</AppText>
            </>
          ) : event ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <AppText variant="caption" muted>{tr('今天 · {date} · 也會記進你的日記', { date: dayLabel(taipeiToday()) })}</AppText>
                <VisibilityBadge v={{ public: true, where: 'post' }} />
              </View>
              <EventInfo e={event} />
              <AppText variant="caption" muted>{tr('活動資料是大家共用的；資料有錯可以在活動頁按「⋯ › 回報資料有誤」。')}</AppText>
              <TextField label={tr('你想說的話')} optional multiline max={500} value={body} onChangeText={setBody} placeholder={tr('為什麼想去、聽說有什麼、要不要一起逛…')} />
              <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' }}>
                {photos.map((p, i) => (
                  <Pressable key={i} accessibilityRole="button" accessibilityLabel={tr('移除照片 {n}', { n: i + 1 })} onPress={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}>
                    <Image source={'uri' in p ? { uri: p.uri } : undefined} style={[styles.photo, { backgroundColor: c.surfaceMuted }]} contentFit="cover" />
                  </Pressable>
                ))}
                {photos.length < DIARY_PHOTO_MAX ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={tr('加入照片')} onPress={() => void addPhoto()} style={[styles.photo, styles.addPhoto, { borderColor: c.border }]}>
                    <Feather name="plus" size={22} color={c.textSecondary} />
                  </Pressable>
                ) : null}
              </View>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                <View style={{ flex: 1 }}>
                  <AppText variant="label">{tr('我會去')}</AppText>
                  <AppText variant="caption" muted>{tr('活動前一天早上提醒你')}</AppText>
                </View>
                <Toggle value={going} onValueChange={setGoing} accessibilityLabel={tr('我會去')} />
              </Card>
            </>
          ) : (
            <ActivityIndicator style={{ marginTop: 48 }} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      {step !== 'find' ? (
        <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border }]}>
          {step === 'new' ? (
            <Button label={tr('下一步：寫你的分享')} disabled={!canCreate} loading={create.isPending} onPress={() => submitNew(false)} />
          ) : (
            <Button label={tr('公開分享')} disabled={!event} loading={share.isPending} onPress={submitShare} />
          )}
        </SafeAreaView>
      ) : null}

      <TimeSheet visible={timeOpen} multiDay={multiDay} start={start} end={end} onChange={(s1, e1) => { setStart(s1); setEnd(e1); }} onClose={() => setTimeOpen(false)} />
      <DaySheet
        key={String(dateOpen)}
        visible={dateOpen}
        future
        title={tr('哪幾天？')}
        value={date}
        end={endDate}
        onRangeChange={(s1, e1) => {
          setDate(s1);
          setEndDate(e1);
          // 回到單日：結束時間要晚於開始，不然清掉
          if (s1 === e1 && end && end <= start) setEnd('');
        }}
        onClose={() => setDateOpen(false)}
      />
      <PlacePicker
        visible={placeOpen}
        googleOnly
        title={tr('活動地點')}
        onClose={() => setPlaceOpen(false)}
        onPick={(ch) => {
          setPlaceOpen(false);
          if (ch.kind !== 'google') return;
          if (!ch.place.public_ok) return Alert.alert(tr('私人地點不能用在活動'), tr('選公開場所，或選「線上活動」。'));
          setPlace({ id: ch.place.id, name: ch.place.name });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12 },
  dashed: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  photo: { width: 84, height: 84, borderRadius: 10 },
  addPhoto: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
});
