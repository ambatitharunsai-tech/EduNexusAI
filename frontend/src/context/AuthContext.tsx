import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { clearAuthSession, getStoredAuthSession, signInWithToken, type AuthSession, isStaffRole } from '../lib/auth';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  signInWithGooglePopup,
  signOutFromFirebase,
  subscribeToFirebaseAuth,
} from '../lib/firebase';
import { safeStorageSet } from '../lib/utils';

export interface AuthContextValue {
  session: AuthSession | null;
  isAuthenticated: boolean;
  isStaff: boolean;
  signIn: (token: string, overrides?: Partial<AuthSession>) => AuthSession;
  signOut: () => void;
  refreshSession: () => AuthSession | null;
  signInWithGoogle?: () => Promise<AuthSession | null>;
  isFirebaseSynced?: boolean;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => {
    return getStoredAuthSession();
  });
  const [isFirebaseSynced, setIsFirebaseSynced] = useState<boolean>(false);

  useEffect(() => {
    if (!session || !session.token) return;
    safeStorageSet('edunexus_auth_session', JSON.stringify(session));
  }, [session]);

  // Synchronize with Firebase Auth (Google Sign-In) when active
  useEffect(() => {
    const unsubscribe = subscribeToFirebaseAuth((fbUser) => {
      if (fbUser) {
        setIsFirebaseSynced(true);
        void fbUser.getIdToken().then((idToken) => {
          const next = signInWithToken(idToken, {
            userId: fbUser.uid,
            email: fbUser.email || 'advisor@edunexus.ai',
            role: 'advisor',
            isDemoSession: false,
          });
          setSession(next);
        });
      } else {
        setIsFirebaseSynced(false);
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Keep the API bearer token synchronized with Supabase token refresh and sign-out events.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active || !data.session?.access_token) return;
      const nextSession = signInWithToken(data.session.access_token);
      setSession(nextSession);
    }).catch(() => {
      // An unavailable auth session must not break direct-access mode.
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, authSession) => {
      if (!active) return;
      if (event === 'SIGNED_OUT' || !authSession) {
        clearAuthSession();
        setSession(null);
        return;
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        setSession(signInWithToken(authSession.access_token));
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback((token: string, overrides?: Partial<AuthSession>) => {
    const nextSession = signInWithToken(token, overrides);
    setSession(nextSession);
    return nextSession;
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<AuthSession | null> => {
    const fbUser = await signInWithGooglePopup();
    const idToken = await fbUser.getIdToken();
    const nextSession = signInWithToken(idToken, {
      userId: fbUser.uid,
      email: fbUser.email || 'advisor@edunexus.ai',
      role: 'advisor',
      isDemoSession: false,
    });
    setIsFirebaseSynced(true);
    setSession(nextSession);
    return nextSession;
  }, []);

  const signOut = useCallback(() => {
    void signOutFromFirebase().catch(() => {
      // Ignore if not signed in to Firebase
    });
    setIsFirebaseSynced(false);
    clearAuthSession();
    setSession(null);
  }, []);

  const refreshSession = useCallback(() => {
    const nextSession = getStoredAuthSession();
    setSession(nextSession);
    return nextSession;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: Boolean(session),
      isStaff: session ? isStaffRole(session.role) : true,
      signIn,
      signOut,
      refreshSession,
      signInWithGoogle,
      isFirebaseSynced,
    }),
    [session, signIn, signOut, refreshSession, signInWithGoogle, isFirebaseSynced]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
