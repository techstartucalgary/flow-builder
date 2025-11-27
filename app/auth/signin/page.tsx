'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts';
import { Button, Input, Card, CardHeader, CardContent, CardTitle } from '@/components/ui';
import { Alert } from '@/components/ui/Alert';
import Link from 'next/link';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const router = useRouter();
  const { signIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

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

  return (
    <div className="min-h-screen bg-[#0b1016] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Card className="bg-[#111827]/90 border border-[#1f2937] text-slate-100 shadow-xl backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold tracking-tight text-slate-100 text-center">
              Sign In
            </CardTitle>
            <p className="text-xs text-slate-400 tracking-wide uppercase text-center">
              Welcome back to FlowBuildr
            </p>
          </CardHeader>

          <CardContent className="pt-2">
            {localError && (
              <div className="mb-4">
                <Alert variant="error" message={localError} />
              </div>
            )}

            <form onSubmit={handleSignIn} className="space-y-4 text-white">
              {/* Email */}
              <div className="space-y-1">
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-slate-100"
                >
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-slate-100"
                >
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full !bg-[#297fd7] !hover:bg-[#2f8af0] !border-0"
                isLoading={isLoading}
              >
                Sign In
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-400">
              Don&apos;t have an account?{' '}
              <Link
                href="/auth/signup"
                className="text-[#4fa2ff] hover:text-[#76b7ff] font-medium"
              >
                Sign Up
              </Link>
            </p>

            <p className="mt-3 text-center">
              <Link
                href="/"
                className="text-xs text-slate-500 hover:text-slate-300"
              >
                ← Back to home
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
