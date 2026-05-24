'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>('checking');
  const [localError, setLocalError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkRecoverySession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (data.session) {
        setStatus('ready');
        return;
      }

      // Supabase can take a brief moment to parse hash tokens.
      setTimeout(async () => {
        const { data: retryData } = await supabase.auth.getSession();
        if (!mounted) return;
        setStatus(retryData.session ? 'ready' : 'invalid');
      }, 400);
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY' || session) {
        setStatus('ready');
      }
    });

    checkRecoverySession();

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters long.');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      router.push('/auth/signin?reset=success');
    } catch (error: any) {
      setLocalError(error?.message || 'Failed to update password.');
    } finally {
      setIsLoading(false);
    }
  };

  const inputBase =
    'w-full h-12 rounded-xl border border-[var(--auth-border)] bg-white text-sm text-gray-900 ' +
    'placeholder:text-gray-400 focus:outline-none focus:border-[#0099FC] focus:ring-2 focus:ring-[var(--auth-ring)] ' +
    'transition-all duration-150';

  return (
    <>
      <div className="mb-8">
        <h2 className="text-[1.65rem] font-bold text-gray-900 tracking-tight leading-tight">
          Reset password
        </h2>
        <p className="mt-1.5 text-sm text-gray-500">
          Choose a new password for your account
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-[var(--auth-border)] shadow-sm p-7 sm:p-8">
        {status === 'checking' && (
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-blue-700 text-sm text-center">
            Verifying your reset link...
          </div>
        )}

        {status === 'invalid' && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm text-center">
              This reset link is invalid or expired. Please request a new one.
            </div>
            <Link
              href="/auth/signin"
              className="block text-center w-full h-11 leading-[44px] rounded-xl font-semibold text-sm text-white bg-[#0099FC] hover:bg-[#0088e0] transition-colors"
            >
              Back to Sign In
            </Link>
          </div>
        )}

        {status === 'ready' && (
          <form onSubmit={handleUpdatePassword} className="space-y-5">
            {localError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm text-center">
                {localError}
              </div>
            )}

            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1.5">
                New password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-400 pointer-events-none" />
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  className={`${inputBase} pl-11 pr-12`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirm-new-password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Confirm new password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-400 pointer-events-none" />
                <input
                  id="confirm-new-password"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className={`${inputBase} pl-11 pr-12`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 rounded-xl font-semibold text-sm text-white
                         bg-gradient-to-r from-blue-600 to-indigo-600
                         hover:from-blue-500 hover:to-indigo-500
                         shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30
                         disabled:opacity-60 disabled:cursor-not-allowed
                         active:scale-[0.98]
                         transition-all duration-150
                         flex items-center justify-center gap-2"
            >
              {isLoading ? 'Updating password...' : (
                <>
                  Update Password
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </>
  );
}
