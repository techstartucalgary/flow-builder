'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts';
import { Button, Input, Card, CardHeader, CardContent, CardTitle } from '@/components/ui';
import { Alert } from '@/components/ui/Alert';
import Link from 'next/link';

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

    // Validation
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
      await signUp(email, password);
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign Up</CardTitle>
        </CardHeader>

        <CardContent>
          {localError && <Alert variant="error" message={localError} />}
          {success && (
            <Alert variant="success" message="Account created successfully! Redirecting..." />
          )}

          <form onSubmit={handleSignUp} className="space-y-4">
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

            <Input
              id="confirmPassword"
              type="password"
              label="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isLoading={isLoading}
            >
              Sign Up
            </Button>
          </form>

          <p className="mt-6 text-center text-gray-600">
            Already have an account?{' '}
            <Link href="/auth/signin" className="text-indigo-600 hover:text-indigo-800 font-medium">
              Sign In
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
