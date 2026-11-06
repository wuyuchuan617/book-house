import { View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { AppText, Card } from '@/components/ui';
import { Spacing, type StoreColor } from '@/constants/theme';
import type { CurationItem } from '@/lib/curations';

/** 讀者看到的一檔策展（A3 書店頁、C7 以讀者身分預覽共用） */
export function CurationView({ title, description, items, color }: {
  title: string | null;
  description: string | null;
  items: CurationItem[];
  color: StoreColor;
}) {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  return (
    <View style={{ gap: Spacing.md }}>
      <AppText variant="heading">{title || '（還沒有標題）'}</AppText>
      {description ? <AppText muted>{description}</AppText> : null}
      <AppText variant="caption" muted>{`${sorted.length} 本書`}</AppText>
      <Card style={{ gap: Spacing.lg }}>
        {sorted.map((it) => (
          <View key={it.id} style={{ flexDirection: 'row', gap: Spacing.md }}>
            <BookCover title={it.books.title} url={it.books.cover_url} color={color} />
            <View style={{ flex: 1 }}>
              <AppText variant="label">{it.books.title}</AppText>
              <AppText variant="caption" muted>{it.books.authors.join('、')}</AppText>
              {it.note ? <AppText variant="caption" style={{ marginTop: 6, lineHeight: 19 }}>{it.note}</AppText> : null}
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
}
