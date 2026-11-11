import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { ActionSheet, Dialog } from '@/components/sheet';
import { AppText, Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { track } from '@/lib/analytics';
import { shareStore, storeUrl } from '@/lib/links';
import { safetyError, useBlockStore } from '@/lib/safety';
import { tr } from '@/lib/i18n';

type Store = { id: string; slug: string; name: string; owner_name: string };

/** A6 書店頁・更多操作＋A8 封鎖確認 */
export function StoreMenu({ store, visible, onClose, isMine }: { store: Store; visible: boolean; onClose: () => void; isMine: boolean }) {
  const { requireAuth } = useAuth();
  const block = useBlockStore();
  const [confirmBlock, setConfirmBlock] = useState(false);

  const report = () =>
    requireAuth(() => router.push({ pathname: '/report/[id]', params: { id: store.id, name: store.name } }));

  const doBlock = (thenReport: boolean) =>
    block.mutate(store.id, {
      onSuccess: () => {
        setConfirmBlock(false);
        if (thenReport) {
          router.replace({ pathname: '/report/[id]', params: { id: store.id, name: store.name, blocked: '1' } });
        } else {
          Alert.alert(tr('已封鎖{owner_name}', { owner_name: store.owner_name }), tr('可以在「設定 › 已封鎖的帳號」解除。'));
          router.back();
        }
      },
      onError: (e) => Alert.alert(tr('沒有封鎖成功'), safetyError(e.message)),
    });

  return (
    <>
      <ActionSheet
        visible={visible}
        title={store.name}
        subtitle={tr('店主 {owner_name}', { owner_name: store.owner_name })}
        onClose={onClose}
        actions={[
          { label: tr('分享書店'), icon: 'share' as const, onPress: () => shareStore(store.name, store.slug, { afterModal: true }) },
          {
            label: tr('複製連結'),
            icon: 'link' as const,
            onPress: async () => {
              await Clipboard.setStringAsync(storeUrl(store.slug));
              track('share_link_copied', { channel: 'copy' });
              Alert.alert(tr('已複製連結'), storeUrl(store.slug));
            },
          },
          ...(isMine
            ? []
            : [
                { label: tr('檢舉這間書店'), icon: 'flag' as const, sub: tr('不當內容、侵權、垃圾訊息等'), destructive: true, onPress: report },
                { label: tr('封鎖{owner_name}', { owner_name: store.owner_name }), icon: 'slash' as const, sub: tr('你將不會再看到他的書店與內容'), destructive: true, onPress: () => requireAuth(() => setConfirmBlock(true)) },
              ]),
        ]}
      />
      <Dialog visible={confirmBlock} onClose={() => setConfirmBlock(false)}>
        <AppText variant="heading">{tr('封鎖{owner_name}？', { owner_name: store.owner_name })}</AppText>
        <View style={{ gap: 4 }}>
          <AppText>{tr('• 你不會再看到「{name}」的書店、策展與心得', { name: store.name })}</AppText>
          <AppText>{tr('• 會自動取消追蹤，對方不會收到通知')}</AppText>
          <AppText>{tr('• 之後可以在「設定 › 已封鎖的帳號」解除')}</AppText>
        </View>
        <Button kind="danger" label={tr('封鎖')} loading={block.isPending} onPress={() => doBlock(false)} style={{ marginTop: Spacing.sm }} />
        <Button kind="secondary" label={tr('封鎖並檢舉')} disabled={block.isPending} onPress={() => doBlock(true)} />
        <Button kind="link" label={tr('取消')} onPress={() => setConfirmBlock(false)} />
      </Dialog>
    </>
  );
}
