import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, View } from 'react-native';

import { ActionSheet, Dialog } from '@/components/sheet';
import { AppText, Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { shareStoreMessage, storeUrl } from '@/lib/links';
import { safetyError, useBlockStore } from '@/lib/safety';

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
          Alert.alert(`已封鎖${store.owner_name}`, '可以在「設定 › 已封鎖的帳號」解除。');
          router.back();
        }
      },
      onError: (e) => Alert.alert('沒有封鎖成功', safetyError(e.message)),
    });

  return (
    <>
      <ActionSheet
        visible={visible}
        title={store.name}
        subtitle={`店主 ${store.owner_name}`}
        onClose={onClose}
        actions={[
          { label: '分享書店', onPress: () => void Share.share({ message: shareStoreMessage(store.name, store.slug) }) },
          {
            label: '複製連結',
            onPress: async () => {
              await Clipboard.setStringAsync(storeUrl(store.slug));
              Alert.alert('已複製連結', storeUrl(store.slug));
            },
          },
          ...(isMine
            ? []
            : [
                { label: '檢舉這間書店', sub: '不當內容、侵權、垃圾訊息等', destructive: true, onPress: report },
                { label: `封鎖${store.owner_name}`, sub: '你將不會再看到他的書店與內容', destructive: true, onPress: () => requireAuth(() => setConfirmBlock(true)) },
              ]),
        ]}
      />
      <Dialog visible={confirmBlock} onClose={() => setConfirmBlock(false)}>
        <AppText variant="heading">{`封鎖${store.owner_name}？`}</AppText>
        <View style={{ gap: 4 }}>
          <AppText>{`• 你不會再看到「${store.name}」的書店、策展與心得`}</AppText>
          <AppText>• 會自動取消追蹤，對方不會收到通知</AppText>
          <AppText>• 之後可以在「設定 › 已封鎖的帳號」解除</AppText>
        </View>
        <Button kind="danger" label="封鎖" loading={block.isPending} onPress={() => doBlock(false)} style={{ marginTop: Spacing.sm }} />
        <Button kind="secondary" label="封鎖並檢舉" disabled={block.isPending} onPress={() => doBlock(true)} />
        <Button kind="link" label="取消" onPress={() => setConfirmBlock(false)} />
      </Dialog>
    </>
  );
}
