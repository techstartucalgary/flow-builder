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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign In</CardTitle>
        </CardHeader>

        <CardContent>
          {localError && <Alert variant="error" message={localError} />}

          <form onSubmit={handleSignIn} className="space-y-4">
            <Input
              id="email"
              type="email"
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />

            <Input
              id="password"
              type="password"
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isLoading={isLoading}
            >
              Sign In
            </Button>
          </form>

          <p className="mt-6 text-center text-gray-600">
            Don't have an account?{' '}
            <Link href="/auth/signup" className="text-indigo-600 hover:text-indigo-800 font-medium">
              Sign Up
            </Link>
          </p>

          <p className="mt-2 text-center">
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
              ← Back to home
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
