import Feather from '@expo/vector-icons/Feather';
import { Pressable, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { SaveButton } from '@/components/social';
import { AppText, Card } from '@/components/ui';
import { MinTouch, Spacing, type StoreColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CurationItem } from '@/lib/curations';
import { bookTitle, tr } from '@/lib/i18n';

/** 讀者看到的一檔策展（A3 書店頁、C7 以讀者身分預覽共用）。interactive：可點書看書籍視角、可收藏 */
export function CurationView({ title, description, items, color, interactive }: {
  title: string | null;
  description: string | null;
  items: CurationItem[];
  color: StoreColor;
  interactive?: { curationId: string; bookstoreId: string; onOpenBook: (bookId: string) => void };
}) {
  const c = useTheme();
  const sorted = [...items].sort((a, b) => a.position - b.position);
  return (
    <View style={{ gap: Spacing.md }}>
      <AppText variant="heading">{title || tr('（還沒有標題）')}</AppText>
      {description ? <AppText muted style={{ lineHeight: 23 }}>{description}</AppText> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <AppText variant="label">{tr('書架 · {length} 本', { length: sorted.length })}</AppText>
        <AppText variant="caption" muted>{tr('依店主排序')}</AppText>
      </View>
      <Card style={{ gap: Spacing.lg }}>
        {sorted.map((it) => {
          const body = (
            <>
              <BookCover title={it.books.title} url={it.books.cover_url} color={color} />
              <View style={{ flex: 1 }}>
                <AppText variant="label">{bookTitle(it.books.title)}</AppText>
                <AppText variant="caption" muted>{it.books.authors.join(tr('、'))}</AppText>
                {it.note ? <AppText variant="caption" style={{ marginTop: 6, lineHeight: 19 }}>{it.note}</AppText> : null}
              </View>
            </>
          );
          if (!interactive) return <View key={it.id} style={{ flexDirection: 'row', gap: Spacing.md }}>{body}</View>;
          return (
            <View key={it.id} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <Pressable
                accessibilityRole="link"
                accessibilityHint={tr('看看還有哪些書店推薦這本書')}
                onPress={() => interactive.onOpenBook(it.books.id)}
                style={({ pressed }) => ({ flex: 1, flexDirection: 'row', gap: Spacing.md, opacity: pressed ? 0.7 : 1, minHeight: MinTouch })}>
                {body}
              </Pressable>
              <View style={{ alignItems: 'center' }}>
                <SaveButton bookId={it.books.id} title={it.books.title} curationId={interactive.curationId} bookstoreId={interactive.bookstoreId} />
                <Feather name="chevron-right" size={16} color={c.textTertiary} accessible={false} />
              </View>
            </View>
          );
        })}
      </Card>
    </View>
  );
}
