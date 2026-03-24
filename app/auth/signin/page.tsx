'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';

import { useAuth } from '@/contexts';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { signIn } = useAuth();

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
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

  const inputBase =
    'h-14 w-full rounded-2xl border border-slate-200 bg-white/90 text-sm text-slate-900 ' +
    'placeholder:text-slate-400 focus:outline-none focus:border-[#0099FC] focus:ring-2 focus:ring-[var(--auth-ring)] ' +
    'transition-all duration-150';

  return (
    <div>
      <div className="mb-8">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
          Sign in
        </div>
        <h2 className="mt-4 font-[family:var(--font-display)] text-[clamp(2.6rem,5vw,4rem)] font-semibold leading-[0.94] tracking-[-0.05em] text-slate-950">
          Welcome back.
        </h2>
        <p className="mt-3 max-w-[30rem] text-base leading-7 text-slate-600">
          Sign in to continue reviewing plans, fixing geometry, and generating takeoffs from the latest saved revision.
        </p>
      </div>

      <div className="rounded-[2rem] border border-white/70 bg-white/72 p-6 shadow-[0_32px_80px_-52px_rgba(15,23,42,0.4)] backdrop-blur-md sm:p-8">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 pb-5">
          <div>
            <div className="text-sm font-semibold text-slate-900">Workspace access</div>
            <div className="mt-1 text-sm text-slate-500">Use the email tied to your FlowBuildr workspace.</div>
          </div>
          <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">
            Secure
          </span>
        </div>

        {localError ? (
          <div className="auth-fade-in mt-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {localError}
          </div>
        ) : null}

        <form onSubmit={handleSignIn} className="mt-6 space-y-5">
          <div>
            <label htmlFor="signin-email" className="mb-2 block text-sm font-medium text-slate-700">
              Email address
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
              <input
                id="signin-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                className={`${inputBase} pl-12 pr-4`}
                required
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor="signin-password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <span className="text-xs text-slate-400">Minimum 6 characters</span>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
              <input
                id="signin-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                className={`${inputBase} pl-12 pr-14`}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <EyeOff className="h-[18px] w-[18px]" />
                ) : (
                  <Eye className="h-[18px] w-[18px]" />
                )}
              </button>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Need password help? Reach out to your workspace admin or support until self-serve reset is enabled.
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#0099FC] text-sm font-semibold text-white shadow-[0_20px_48px_-24px_rgba(0,153,252,0.95)] transition hover:bg-[#1aa4ff] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin text-white"
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
                Signing in...
              </>
            ) : (
              <>
                Enter workspace
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </div>

      <p className="mt-7 text-sm text-slate-500">
        Don&apos;t have an account?{' '}
        <Link href="/auth/signup" className="font-semibold text-[#008ae6] transition-colors hover:text-[#0073c2]">
          Create one
        </Link>
      </p>
    </div>
  );
}
