import Feather from '@expo/vector-icons/Feather';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookCover } from '@/components/book-cover';
import { BookPicker } from '@/components/book-picker';
import { TextField } from '@/components/form';
import { RX_PURPLE } from '@/components/rx-explore';
import { AppText, Button, Card, EmptyState, Screen } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { bookTitle, tr } from '@/lib/i18n';
import { useMyStore } from '@/lib/queries';
import { RX_REASON_MAX, RX_REASON_MIN, rxError, useRx, useRxReply, useRxWithdraw, type RxDetail } from '@/lib/rx';

type PickedBook = { id: string; title: string; cover_url: string | null; authors: string[] };

/** X4 開一張處方：一本書＋為什麼適合（10–200 字）；每人每張一次，開了可以修改或撤回 */
export default function RxReplyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useRx(id);
  if (isLoading) return <ActivityIndicator style={{ marginTop: 48 }} />;
  if (!data) return <EmptyState title={tr('找不到這張處方簽')} body={tr('它可能已經被刪除了。')} />;
  if (data.is_mine) return <EmptyState title={tr('不能開處方給自己')} body={tr('等大家幫你開吧。')} />;
  if (!data.is_open) return <EmptyState title={tr('這張處方簽已經結案了')} body={tr('結案後只能看，不能再開處方。')} />;
  return <ReplyForm rx={data} />;
}

function ReplyForm({ rx }: { rx: RxDetail }) {
  const c = useTheme();
  const { data: mine } = useMyStore();
  const reply = useRxReply();
  const withdraw = useRxWithdraw();
  const editing = !!rx.my_reply;
  const [book, setBook] = useState<PickedBook | null>(rx.my_reply ? rx.my_reply.book : null);
  const [reason, setReason] = useState(rx.my_reply?.reason ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const others = book ? rx.books.find((g) => g.book.id === book.id)?.reasons.filter((r) => !r.is_mine).length ?? 0 : 0;
  const len = [...reason.trim()].length;
  const ready = !!book && len >= RX_REASON_MIN && len <= RX_REASON_MAX;

  const submit = () =>
    book &&
    reply.mutate(
      { rxId: rx.id, bookId: book.id, reason: reason.trim(), editing },
      { onSuccess: () => router.back(), onError: (e) => Alert.alert(tr('沒有送出'), rxError(e.message)) },
    );
  const remove = () =>
    Alert.alert(tr('撤回這張處方？'), tr('撤回後可以再開一次。'), [
      { text: tr('取消'), style: 'cancel' },
      { text: tr('撤回'), style: 'destructive', onPress: () => withdraw.mutate(rx.id, { onSuccess: () => router.back(), onError: (e) => Alert.alert(tr('沒有成功'), rxError(e.message)) }) },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: editing ? tr('修改處方') : tr('開一張處方') }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }} keyboardShouldPersistTaps="handled">
          <View style={[styles.quote, { borderLeftColor: RX_PURPLE }]}>
            <AppText style={{ lineHeight: 22, color: c.textSecondary }}>{rx.title}</AppText>
          </View>
          <View style={{ gap: 6 }}>
            <AppText variant="label">{tr('開哪一本（只能一本）')}</AppText>
            <Pressable accessibilityRole="button" onPress={() => setPickerOpen(true)} style={[styles.bookField, { borderColor: book ? c.border : c.primary, backgroundColor: c.surface }]}>
              {book ? (
                <>
                  <BookCover title={book.title} url={book.cover_url} color={mine?.store.color ?? 'moss'} size="sm" />
                  <View style={{ flex: 1 }}>
                    <AppText variant="label">{bookTitle(book.title)}</AppText>
                    <AppText variant="caption" muted>{book.authors.join(tr('、'))}</AppText>
                  </View>
                  <AppText variant="caption" style={{ color: c.primary, fontWeight: '700' }}>{tr('換一本')}</AppText>
                </>
              ) : (
                <>
                  <Feather name="search" size={18} color={c.primary} />
                  <AppText style={{ flex: 1, color: c.primary, fontWeight: '700' }}>{tr('搜尋書名或作者')}</AppText>
                </>
              )}
            </Pressable>
            <AppText variant="caption" muted>{tr('搜尋或掃條碼；找不到可以手動新增。')}</AppText>
          </View>
          {others ? (
            <Card style={{ backgroundColor: c.surfaceMuted }}>
              <AppText variant="caption" muted style={{ lineHeight: 19 }}>{tr('這本已經有 {n} 人開出，你的理由會放在同一本書下面。', { n: others })}</AppText>
            </Card>
          ) : null}
          <TextField
            label={tr('為什麼適合')}
            multiline
            max={RX_REASON_MAX}
            value={reason}
            onChangeText={setReason}
            placeholder={tr('這本書哪裡適合他現在的狀況？')}
            hint={len > 0 && len < RX_REASON_MIN ? tr('再多寫幾個字（至少 {n} 字）', { n: RX_REASON_MIN }) : undefined}
          />
          <AppText variant="caption" muted>{tr('以「{name}」開出，大家可以點進你的書店。', { name: mine?.store.name ?? tr('我的書店') })}</AppText>
          <AppText variant="caption" style={{ color: c.textTertiary, lineHeight: 19 }}>{tr('每張處方簽每人只能開一次、一本書。開了之後可以修改書或理由、也可以撤回，但不能再開第二本。')}</AppText>
          {editing ? <Button kind="link" label={tr('撤回這張處方')} onPress={remove} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        <Button label={editing ? tr('儲存') : tr('送出處方')} disabled={!ready} loading={reply.isPending} onPress={submit} />
      </SafeAreaView>
      <BookPicker
        visible={pickerOpen}
        mode="single"
        storeColor={mine?.store.color ?? 'moss'}
        pickedIds={new Set()}
        onClose={() => setPickerOpen(false)}
        onAdd={async (b) => setBook({ id: b.id, title: b.title, cover_url: b.cover_url, authors: b.authors })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  quote: { borderLeftWidth: 3, paddingLeft: Spacing.md },
  bookField: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, minHeight: 56 },
  footer: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
});
