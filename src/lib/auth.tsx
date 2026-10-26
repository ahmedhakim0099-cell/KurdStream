import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export interface UserProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  is_admin?: boolean;
}

const ADMIN_EMAIL = 'ahmed.hakim0099@gmail.com';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isLocalUser: boolean;
  isAdmin: boolean;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithEmail: (email: string, password: string, username: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const LOCAL_USER_KEY = 'kurdstream_local_user';

function createLocalUser(): { user: User; profile: UserProfile } {
  const id = 'local-' + Math.random().toString(36).slice(2, 11);
  const profile: UserProfile = {
    id,
    username: 'کارهێنەری کورد ستریم',
    avatar_url: null,
    bio: '',
  };
  const user = {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'user@kurdstream.com',
    app_metadata: { provider: 'local' },
    user_metadata: {},
    identities: [],
    created_at: new Date().toISOString(),
  } as unknown as User;
  return { user, profile };
}

function loadLocalUser(): { user: User; profile: UserProfile } | null {
  try {
    const raw = localStorage.getItem(LOCAL_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveLocalUser(data: { user: User; profile: UserProfile }) {
  localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(data));
}

function clearLocalUser() {
  localStorage.removeItem(LOCAL_USER_KEY);
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [localUser, setLocalUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dbIsAdmin, setDbIsAdmin] = useState(false);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.error('Error fetching profile:', error);
      return;
    }
    if (data) {
      setProfile(data as UserProfile);
    }
    // Check admin status via RPC function (created by migration)
    try {
      const { data: adminResult } = await supabase.rpc('is_user_admin', { check_user_id: userId });
      setDbIsAdmin(!!adminResult);
    } catch {
      // RPC function may not exist yet — fallback to email check
      setDbIsAdmin(false);
    }
  };

  useEffect(() => {
    // Load local demo user first for instant UI
    const saved = loadLocalUser();
    if (saved) {
      setLocalUser(saved.user);
      setProfile(saved.profile);
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        fetchProfile(data.session.user.id);
        // Real session takes priority over local demo
        if (saved) { clearLocalUser(); setLocalUser(null); }
      }
      setLoading(false);
    });

    supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        if (saved) { clearLocalUser(); setLocalUser(null); }
        (async () => {
          const { data: existing } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('id', newSession.user.id)
            .maybeSingle();
          if (!existing) {
            const username = newSession.user.email?.split('@')[0] || 'بەکارهێنەر';
            await supabase.from('user_profiles').insert({
              id: newSession.user.id,
              username,
              avatar_url: newSession.user.user_metadata?.avatar_url || null,
              bio: '',
            });
          }
          fetchProfile(newSession.user.id);
        })();
      } else if (!localUser) {
        setProfile(null);
      }
      setLoading(false);
    });
  }, []);

  const signInWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) {
        // Provider not enabled — fall back to local demo user so the user can still use the app
        if (error.message.includes('unsupported provider') || error.message.includes('not enabled')) {
          const local = createLocalUser();
          saveLocalUser(local);
          setLocalUser(local.user);
          setProfile(local.profile);
          return { error: null };
        }
        return { error: error.message };
      }
      return { error: null };
    } catch {
      return { error: 'هەڵەیەک ڕوویدا لە کاتی چوونەژوورەوە بە گووگڵ' };
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    // Clear local user on real sign-in
    clearLocalUser();
    setLocalUser(null);
    return { error: null };
  };

  const signUpWithEmail = async (email: string, password: string, username: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    if (data.user) {
      await supabase.from('user_profiles').insert({
        id: data.user.id,
        username,
        avatar_url: null,
        bio: '',
      });
    }
    clearLocalUser();
    setLocalUser(null);
    return { error: null };
  };

  const signOut = async () => {
    clearLocalUser();
    setLocalUser(null);
    await supabase.auth.signOut();
    setProfile(null);
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    const activeUser = session?.user || localUser;
    if (!activeUser) return;
    if (localUser && !session) {
      // Update local profile
      setProfile(prev => prev ? { ...prev, ...updates } : prev);
      const saved = loadLocalUser();
      if (saved) {
        saved.profile = { ...saved.profile, ...updates };
        saveLocalUser(saved);
      }
      return;
    }
    const { error } = await supabase
      .from('user_profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', activeUser.id);
    if (error) {
      console.error('Error updating profile:', error);
      return;
    }
    setProfile(prev => prev ? { ...prev, ...updates } : prev);
  };

  const refreshProfile = async () => {
    if (session?.user) fetchProfile(session.user.id);
  };

  const effectiveUser = session?.user || localUser;
  const emailIsAdmin = effectiveUser?.email?.toLowerCase() === ADMIN_EMAIL;
  const isAdmin = emailIsAdmin || dbIsAdmin || (profile?.is_admin === true);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: effectiveUser || null,
        profile,
        loading,
        isLocalUser: !session && !!localUser,
        isAdmin,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        updateProfile,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
