import { useAuth } from '@/contexts';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ROUTES } from '@/config/constants';

/**
 * Hook to protect routes that require authentication
 * Redirects to sign-in if user is not authenticated
 */
export const useRequireAuth = () => {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push(ROUTES.SIGN_IN);
    }
  }, [user, loading, router]);

  return { user, loading };
};

/**
 * Hook to redirect authenticated users away from auth pages
 * Useful for sign-in/sign-up pages
 */
export const useRedirectIfAuthenticated = (redirectTo: string = ROUTES.DASHBOARD) => {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push(redirectTo);
    }
  }, [user, loading, router, redirectTo]);

  return { user, loading };
};
