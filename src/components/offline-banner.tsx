import NetInfo, { useNetInfo } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { tr } from '@/lib/i18n';

// TanStack Query 跟著網路狀態：斷線時暫停請求，連上後自動重新載入
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false && state.isInternetReachable !== false)),
);

/** S2 整頁：沒有網路（橫幅版，不擋住已載入的內容） */
export function OfflineBanner() {
  const net = useNetInfo();
  const insets = useSafeAreaInsets();
  if (net.isConnected !== false && net.isInternetReachable !== false) return null;
  return (
    <View pointerEvents="none" style={[styles.bar, { paddingTop: insets.top + 6 }]} accessibilityLiveRegion="assertive">
      <AppText variant="caption" style={{ color: '#FFFFFF', fontWeight: '700' }}>{tr('目前沒有網路連線')}</AppText>
      <AppText variant="caption" style={{ color: '#FFFFFF' }}>{tr('連上網路後會自動重新載入，你填的內容不會遺失')}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: '#1F1B16', paddingBottom: 8, paddingHorizontal: Spacing.xl, alignItems: 'center' },
});
