'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts';
import Link from 'next/link';
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';

/*
 * ── Sign Up Page ─────────────────────────────────────────────────────
 *
 * Same visual system as Sign In (shared inputBase, card, button styles).
 * Fields: Email, Password, Confirm Password — no OTP / verification.
 */
export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [localError, setLocalError] = useState('');
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const { signUp } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    setIsLoading(true);
    setSuccess(false);

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters long');
      setIsLoading(false);
      return;
    }

    try {
      const result = await signUp(email, password);

      if (result.userAlreadyExists) {
        setLocalError('An account with this email already exists. Please sign in.');
        return;
      }

      if (result.requiresEmailConfirmation) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/auth/signin');
        }, 2000);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    } catch (error: any) {
      setLocalError(error.message || 'An error occurred during sign up');
    } finally {
      setIsLoading(false);
    }
  };

  /* ── shared input classes (identical to Sign In) ── */
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
          Create an account
        </h2>
        <p className="mt-1.5 text-sm text-gray-500">
          Get started with your FlowBuildr workspace
        </p>
      </div>

      {/* ── Card ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-[var(--auth-border)] shadow-sm p-7 sm:p-8">
        {/* Error */}
        {localError && (
          <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm text-center auth-fade-in">
            {localError}
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="mb-5 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 text-sm text-center auth-fade-in">
            Account created! Redirecting…
          </div>
        )}

        <form onSubmit={handleSignUp} className="space-y-5">
          {/* ── Email ── */}
          <div>
            <label
              htmlFor="signup-email"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Email address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-400 pointer-events-none" />
              <input
                id="signup-email"
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
              htmlFor="signup-password"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-400 pointer-events-none" />
              <input
                id="signup-password"
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
                {showPassword ? (
                  <EyeOff className="h-[18px] w-[18px]" />
                ) : (
                  <Eye className="h-[18px] w-[18px]" />
                )}
              </button>
            </div>
          </div>

          {/* ── Confirm Password ── */}
          <div>
            <label
              htmlFor="signup-confirm"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Confirm password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-gray-400 pointer-events-none" />
              <input
                id="signup-confirm"
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
                {showConfirm ? (
                  <EyeOff className="h-[18px] w-[18px]" />
                ) : (
                  <Eye className="h-[18px] w-[18px]" />
                )}
              </button>
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
                Creating account…
              </>
            ) : (
              <>
                Create Account
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* ── Footer link ─────────────────────────────────────────── */}
      <p className="mt-7 text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link
          href="/auth/signin"
          className="text-[#0099FC] hover:text-[#0077cc] font-semibold transition-colors"
        >
          Sign In
        </Link>
      </p>
    </>
  );
}
