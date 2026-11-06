import type { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

type PendingAction = () => void | Promise<void>;

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  /** 訪客做需要登入的動作時呼叫：已登入就直接執行，否則記住動作、打開登入引導（A9） */
  requireAuth: (action: PendingAction) => boolean;
  pendingAction: PendingAction | null;
  /** 使用者在登入引導按「繼續逛逛」 */
  cancelPending: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const pendingRef = useRef<PendingAction | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, next) => {
      setSession(next);
      if (event === 'SIGNED_IN') {
        // 30 天內重新登入 = 取消刪除帳號申請（M10）
        await supabase.rpc('cancel_account_deletion');
        // 登入後自動完成剛才的動作（A9）
        const action = pendingRef.current;
        pendingRef.current = null;
        setPendingAction(null);
        if (action) await action();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const requireAuth = useCallback(
    (action: PendingAction) => {
      if (session) {
        void action();
        return true;
      }
      pendingRef.current = action;
      setPendingAction(() => action);
      return false;
    },
    [session],
  );

  const cancelPending = useCallback(() => {
    pendingRef.current = null;
    setPendingAction(null);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const redirectTo = Linking.createURL('auth/callback');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return;
    const code = new URL(result.url).searchParams.get('code');
    if (!code) throw new Error('Google 登入沒有回傳授權碼');
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
  }, []);

  const signInWithApple = useCallback(async () => {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) throw new Error('Apple 登入沒有回傳 identity token');
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) throw error;
    // Apple 只在第一次登入時給名字
    const fullName = [credential.fullName?.familyName, credential.fullName?.givenName]
      .filter(Boolean)
      .join('');
    if (fullName && data.user) {
      await supabase.from('profiles').update({ display_name: fullName }).eq('id', data.user.id);
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({
      session,
      isLoading,
      requireAuth,
      pendingAction,
      cancelPending,
      signInWithGoogle,
      signInWithApple,
      signOut,
    }),
    [session, isLoading, requireAuth, pendingAction, cancelPending, signInWithGoogle, signInWithApple, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
