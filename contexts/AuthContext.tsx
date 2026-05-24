'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { getSupabaseConfigErrorMessage, supabase } from '@/lib/supabase';
import { AuthContextType } from '@/types/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

const getFriendlyAuthErrorMessage = (error: unknown, fallback: string): string => {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : fallback;

  if (/invalid login credentials/i.test(rawMessage)) {
    return 'Invalid email or password. If this continues, use Forgot password to reset it.';
  }

  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(rawMessage)) {
    return (
      'Unable to reach Supabase Auth. Check your internet connection, verify NEXT_PUBLIC_SUPABASE_URL, ' +
      'and ensure the Supabase project is online.'
    );
  }

  return rawMessage || fallback;
};

const assertSupabaseConfigured = () => {
  const configError = getSupabaseConfigErrorMessage();
  if (configError) {
    throw new Error(configError);
  }
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check active session
    checkUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkUser = async () => {
    try {
      assertSupabaseConfigured();
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      setUser(user);
    } catch (error: unknown) {
      setError(getFriendlyAuthErrorMessage(error, 'Unable to read authentication state.'));
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      assertSupabaseConfigured();
      setError(null);
      setLoading(true);
      const normalizedEmail = email.trim().toLowerCase();

      const passwordCandidates = [password];
      const trimmedPassword = password.trim();
      if (trimmedPassword !== password) {
        passwordCandidates.push(trimmedPassword);
      }

      let lastError: any = null;
      for (const passwordCandidate of passwordCandidates) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: passwordCandidate,
        });

        if (!error) {
          setUser(data.user);
          return;
        }

        lastError = error;
      }

      throw lastError;
    } catch (error: unknown) {
      const normalizedMessage = getFriendlyAuthErrorMessage(error, 'An error occurred during sign in.');
      setError(normalizedMessage);
      throw new Error(normalizedMessage);
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      assertSupabaseConfigured();
      setError(null);
      setLoading(true);
      const normalizedEmail = email.trim().toLowerCase();

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      });

      if (error) throw error;
      // Only treat the user as signed in when Supabase returns a session.
      // If email confirmation is required, session is null.
      setUser(data.session?.user ?? null);

      const identities = (data.user as any)?.identities;
      const userAlreadyExists = Array.isArray(identities) && identities.length === 0;

      return {
        requiresEmailConfirmation: !data.session,
        userAlreadyExists,
      };
    } catch (error: unknown) {
      const normalizedMessage = getFriendlyAuthErrorMessage(error, 'An error occurred during sign up.');
      setError(normalizedMessage);
      throw new Error(normalizedMessage);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setError(null);
      assertSupabaseConfigured();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
    } catch (error: unknown) {
      const normalizedMessage = getFriendlyAuthErrorMessage(error, 'An error occurred during sign out.');
      setError(normalizedMessage);
      throw new Error(normalizedMessage);
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    error,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
