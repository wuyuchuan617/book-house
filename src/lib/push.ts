/**
 * 推播通知：登入後取得 Expo push token 存到 Supabase；點通知會打開對應畫面（data.url）。
 * 需要 development build／正式版。Expo Go 與模擬器拿不到 token，會自動略過。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';
import { tr } from '@/lib/i18n';

const TOKEN_KEY = 'bookhaus.push-token';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

async function register() {
  if (Platform.OS === 'web' || !Device.isDevice || Constants.executionEnvironment === 'storeClient') return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return;
  if (Platform.OS === 'android') {
    // eslint-disable-next-line import/namespace -- expo-notifications 用 export * 匯出，TS 型別正確
    await Notifications.setNotificationChannelAsync('default', { name: tr('書棲通知'), importance: Notifications.AndroidImportance.DEFAULT });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== 'granted') return;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

/** 登出前呼叫：這支手機不再收到原帳號的通知 */
export async function unregisterPush() {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) await supabase.rpc('unregister_push_token', { p_token: token });
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // 忽略
  }
}

function openFrom(response: Notifications.NotificationResponse | null) {
  const url = response?.notification.request.content.data?.url;
  if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
}

/** 放在根元件：登入後登記 token、處理點通知 */
export function usePushNotifications(userId: string | undefined) {
  useEffect(() => {
    if (userId) register().catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    Notifications.getLastNotificationResponseAsync().then(openFrom).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(openFrom);
    return () => sub.remove();
  }, []);
}
