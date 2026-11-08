import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { AppText, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { CONTACT, PRIVACY, TERMS, UPDATED } from '@/lib/legal';

/** 服務條款、隱私權政策（App 內，離線也能看；網頁版在 /terms、/privacy） */
export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: 'terms' | 'privacy' }>();
  const isTerms = doc === 'terms';
  const sections = isTerms ? TERMS : PRIVACY;
  const title = isTerms ? '服務條款' : '隱私權政策';

  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.sm, paddingBottom: 48 }}>
        <AppText variant="title">{title}</AppText>
        <AppText variant="caption" muted>{`最後更新：${UPDATED}`}</AppText>
        {sections.map(([h, ps]) => (
          <ScrollSection key={h} heading={h} paragraphs={ps} />
        ))}
        <AppText variant="caption" muted style={{ marginTop: Spacing.xl }}>{`有任何問題，請寫信到 ${CONTACT}。`}</AppText>
      </ScrollView>
    </Screen>
  );
}

function ScrollSection({ heading, paragraphs }: { heading: string; paragraphs: string[] }) {
  return (
    <>
      <AppText variant="heading" style={{ fontSize: 18, marginTop: Spacing.lg }} accessibilityRole="header">{heading}</AppText>
      {paragraphs.map((p) => <AppText key={p} style={{ lineHeight: 24 }}>{p}</AppText>)}
    </>
  );
}
