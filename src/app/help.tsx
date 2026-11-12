import Constants from 'expo-constants';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Chip, chipRow, TextField } from '@/components/form';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { tr } from '@/lib/i18n';
import Feather from '@expo/vector-icons/Feather';
import { openAbout } from '@/components/about';
import { about, ABOUT_KEYS } from '@/lib/about';

const FAQ = () => [
  [tr('為什麼讀者看不到我的書店？'), tr('發布第一檔策展後，書店才會出現在探索頁。草稿與預約中的策展讀者看不到。')],
  [tr('可以預約下個月的策展嗎？'), tr('可以。下個月的策展按「預約發布」，會在月初自動上架，上架前都能修改。')],
  [tr('店主閱讀是公開的嗎？'), tr('預設公開，每一本都能改成只有自己看得到；在「設定 › 店主閱讀預設公開」可以改預設值。')],
  [tr('怎麼刪除書店或帳號？'), tr('在「設定 › 危險區」。刪除帳號後 30 天內重新登入可以取消。')],
];

type Kind = 'suggestion' | 'bug' | 'other';
const CONTACT = process.env.EXPO_PUBLIC_CONTACT_EMAIL ?? '';

/** M7 說明與意見回饋 */
export default function HelpScreen() {
  const c = useTheme();
  const { session } = useAuth();
  const [open, setOpen] = useState<number | null>(0);
  const [kind, setKind] = useState<Kind>('suggestion');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    const { error } = await supabase.from('feedback').insert({
      user_id: session?.user.id ?? null,
      kind,
      body: body.trim(),
      app_version: `${Constants.expoConfig?.version ?? '?'} ${Platform.OS}`,
    });
    setSending(false);
    if (error) return Alert.alert(tr('沒有送出'), tr('請檢查網路後再試一次，內容還在。'));
    Alert.alert(tr('謝謝你的回饋'), tr('我們會仔細看每一則。'));
    router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: tr('說明與意見回饋') }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }} keyboardShouldPersistTaps="handled">
          <AppText variant="label">{tr('功能說明')}</AppText>
          <Card style={{ paddingVertical: 0 }}>
            {ABOUT_KEYS.map((k, i) => {
              const a = about(k);
              return (
                <Pressable key={k} accessibilityRole="link" onPress={() => openAbout(k, 'settings')} style={[styles.about, i < ABOUT_KEYS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider }]}>
                  <View style={[styles.aboutIcon, { backgroundColor: a.color }]}><Feather name={a.icon} size={16} color="#FFFFFF" /></View>
                  <View style={{ flex: 1 }}>
                    <AppText style={{ fontWeight: '700' }}>{tr('什麼是{name}？', { name: a.name })}</AppText>
                    <AppText variant="caption" muted numberOfLines={1}>{a.one}</AppText>
                  </View>
                  <Feather name="chevron-right" size={16} color={c.textTertiary} />
                </Pressable>
              );
            })}
          </Card>
          <AppText variant="label">{tr('常見問題')}</AppText>
          <Card style={{ paddingVertical: 0 }}>
            {FAQ().map(([q, a], i) => (
              <View key={q} style={[styles.faq, i < FAQ().length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.divider }]}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: open === i }} onPress={() => setOpen(open === i ? null : i)} style={styles.q}>
                  <AppText style={{ flex: 1, fontWeight: '600' }}>{q}</AppText>
                  <AppText muted>{open === i ? tr('－') : tr('＋')}</AppText>
                </Pressable>
                {open === i ? <AppText muted style={{ paddingBottom: Spacing.md, lineHeight: 22 }}>{a}</AppText> : null}
              </View>
            ))}
          </Card>

          {CONTACT ? (
            <Card style={{ gap: 4 }}>
              <AppText variant="label">{tr('聯絡我們')}</AppText>
              <AppText muted>{tr('遇到問題、想檢舉或刪除資料，都可以寫信給我們。')}</AppText>
              <Button kind="link" label={CONTACT} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} onPress={() => void Linking.openURL(`mailto:${CONTACT}`)} />
            </Card>
          ) : null}

          <AppText variant="label" style={{ marginTop: Spacing.md }}>{tr('意見回饋')}</AppText>
          <View style={chipRow} accessibilityRole="radiogroup">
            <Chip label={tr('建議')} selected={kind === 'suggestion'} onPress={() => setKind('suggestion')} />
            <Chip label={tr('問題回報')} selected={kind === 'bug'} onPress={() => setKind('bug')} />
            <Chip label={tr('其他')} selected={kind === 'other'} onPress={() => setKind('other')} />
          </View>
          <TextField
            label={tr('想跟我們說什麼？')}
            multiline
            max={2000}
            value={body}
            onChangeText={setBody}
            placeholder={kind === 'bug' ? tr('在哪個畫面、做了什麼、發生什麼事？') : tr('任何想法都歡迎')}
          />
          <Button label={tr('送出')} disabled={!body.trim()} loading={sending} onPress={send} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  about: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, minHeight: 56 },
  aboutIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  faq: { gap: 2 },
  q: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
});
