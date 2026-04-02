'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';

/*
 * ── Sign In Page ─────────────────────────────────────────────────────
 *
 * Tweak points:
 *   - Input height      → h-12  (48 px)
 *   - Input radius      → rounded-xl  (12 px)
 *   - Card radius       → rounded-2xl (16 px)
 *   - Card shadow       → shadow-sm
 *   - Button gradient   → from-blue-600 to-indigo-600 (matches landing CTA)
 *   - Focus ring color  → var(--auth-ring)  /  border-[#0099FC]
 */
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState('');
  const [forgotMsg, setForgotMsg] = useState<string>('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const resetSuccess = searchParams.get('reset') === 'success';

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    setIsLoading(true);

    try {
      await signIn(email, password);
      router.push('/dashboard');
    } catch (error: any) {
      setLocalError(error.message || 'An error occurred during sign in');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setLocalError('');
    setForgotMsg('');

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setLocalError('Enter your email first, then click Forgot password.');
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (error) throw error;
      setForgotMsg('Password reset email sent. Check your inbox.');
    } catch (error: any) {
      setLocalError(error?.message || 'Failed to send password reset email.');
    }
  };

  /* ── shared input classes ── */
  const inputBase =
    'w-full h-12 rounded-xl border border-[var(--auth-border)] bg-white text-sm text-gray-900 ' +
    'placeholder:text-gray-400 ' +
    'focus:outline-none focus:border-[#0099FC] focus:ring-2 focus:ring-[var(--auth-ring)] ' +
    'transition-all duration-150';

  return (
    <>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="mb-8">
        <h2 className="text-[1.65rem] font-bold text-gray-900 tracking-tight leading-tight">
          Welcome back
        </h2>
        <p className="mt-1.5 text-sm text-gray-500">
          Sign in to your FlowBuildr account
        </p>
      </div>

      {/* ── Card ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-[var(--auth-border)] shadow-sm p-7 sm:p-8">
        {resetSuccess && (
          <div className="mb-5 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm text-center auth-fade-in">
            Password updated successfully. Please sign in.
          </div>
        )}

        {/* Error banner */}
        {localError && (
          <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm text-center auth-fade-in">
            {localError}
          </div>
        )}

        <form onSubmit={handleSignIn} className="space-y-5">
          {/* ── Email ── */}
          <div>
            <label
              htmlFor="signin-email"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Email address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-400 pointer-events-none" />
              <input
                id="signin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className={`${inputBase} pl-11 pr-4`}
                required
              />
            </div>
          </div>

          {/* ── Password ── */}
          <div>
            <label
              htmlFor="signin-password"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-400 pointer-events-none" />
              <input
                id="signin-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className={`${inputBase} pl-11 pr-12`}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="h-[18px] w-[18px]" />
                ) : (
                  <Eye className="h-[18px] w-[18px]" />
                )}
              </button>
            </div>

            {/* Forgot password stub */}
            <div className="mt-2 flex items-center justify-end min-h-[20px]">
              {forgotMsg ? (
                <span className="text-xs text-gray-500 auth-fade-in">
                  {forgotMsg}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs font-medium text-[#0099FC] hover:text-[#0077cc] transition-colors"
                >
                  Forgot password?
                </button>
              )}
            </div>
          </div>

          {/* ── Submit ── */}
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
            {isLoading ? (
              <>
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Signing in…
              </>
            ) : (
              <>
                Sign In
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* ── Footer link ─────────────────────────────────────────── */}
      <p className="mt-7 text-center text-sm text-gray-500">
        Don&apos;t have an account?{' '}
        <Link
          href="/auth/signup"
          className="text-[#0099FC] hover:text-[#0077cc] font-semibold transition-colors"
        >
          Sign Up
        </Link>
      </p>
    </>
  );
}
