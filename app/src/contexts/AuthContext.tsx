import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { httpClient } from '../services/api';

// ==========================================
// Types
// ==========================================
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role?: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  kycStatus: string;
  twoFactorEnabled: boolean;
  referralCode: string;
  avatar?: string;
  wallet?: any;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string, twoFactorCode?: string) => Promise<{ requires2FA?: boolean; authenticated?: boolean }>;
  register: (data: RegisterData) => Promise<{ authenticated: boolean; message?: string }>;
  logout: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
}

interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  referralCode?: string;
}

// ==========================================
// Constants
// ==========================================
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ==========================================
// Provider
// ==========================================
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // Helper to fetch user profile via API using the given token
  const fetchProfile = useCallback(async (token: string): Promise<User> => {
    // Set token on httpClient temporarily for this request
    httpClient.setToken(token);
    const response = await httpClient.get<{ user: User }>('/auth/profile');
    if (response.error || !response.data?.user) {
      throw new Error(response.error || 'Failed to fetch user profile');
    }
    return response.data.user;
  }, []);

  // Restore session from Supabase Client
  useEffect(() => {
    const clearAuthState = async () => {
      await supabase.auth.signOut().catch(() => undefined);
      httpClient.clearToken();
      setState({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
    };

    const restoreSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          await clearAuthState();
          return;
        }

        const userProfile = await fetchProfile(session.access_token);
        setState({
          user: userProfile,
          token: session.access_token,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch (error) {
        console.error('Failed to restore auth session:', error);
        await clearAuthState();
      }
    };

    restoreSession();

    // Listen to Auth State changes (including token auto-refreshes)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        httpClient.setToken(session.access_token);
        
        // Update state token
        setState(prev => {
          // If we already have the correct user and same token, do nothing to prevent infinite loops
          if (prev.token === session.access_token && prev.user) {
            return prev;
          }
          
          // If token refreshed, try fetching profile if not loaded, otherwise just update token
          return {
            ...prev,
            token: session.access_token,
            isAuthenticated: true,
            isLoading: false,
          };
        });

        // Trigger a profile fetch in the background to ensure data stays in sync
        try {
          const userProfile = await fetchProfile(session.access_token);
          setState(prev => ({
            ...prev,
            user: userProfile,
            token: session.access_token,
            isAuthenticated: true,
            isLoading: false,
          }));
        } catch (err) {
          console.error("Error updating profile on auth state change:", err);
          await clearAuthState();
        }
      } else {
        await clearAuthState();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const login = useCallback(async (email: string, password: string, twoFactorCode?: string) => {
    const response = await httpClient.post<{ requires2FA?: boolean; token: string; refreshToken: string; user: User }>(
      '/auth/login',
      { email, password, twoFactorCode }
    );

    if (response.error) {
      throw new Error(response.error);
    }

    if (response.data?.requires2FA) {
      return { requires2FA: true };
    }

    if (response.data?.token) {
      // Set the session in Supabase client to sync session state
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: response.data.token,
        refresh_token: response.data.refreshToken || response.data.token,
      });

      if (sessionError) {
        await supabase.auth.signOut().catch(() => undefined);
        httpClient.clearToken();
        throw new Error(sessionError.message);
      }

      return { authenticated: true };
    }

    return { authenticated: false };
  }, []);

  const register = useCallback(async (registerData: RegisterData) => {
    const response = await httpClient.post<{ token?: string; refreshToken?: string; user: User; message?: string }>(
      '/auth/register',
      registerData
    );

    if (response.error) {
      throw new Error(response.error);
    }

    if (response.data?.token) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: response.data.token,
        refresh_token: response.data.refreshToken || response.data.token,
      });

      if (sessionError) {
        await supabase.auth.signOut().catch(() => undefined);
        httpClient.clearToken();
        throw new Error(sessionError.message);
      }

      return { authenticated: true };
    }

    return {
      authenticated: false,
      message: response.data?.message || 'Registration successful. Please login.',
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await httpClient.post('/auth/logout', {});
    } catch {
      // Ignore backend errors
    } finally {
      await supabase.auth.signOut();
      httpClient.clearToken();
      setState({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setState(prev => ({
      ...prev,
      user: prev.user ? { ...prev.user, ...updates } : null,
    }));
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// ==========================================
// Hook
// ==========================================
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
