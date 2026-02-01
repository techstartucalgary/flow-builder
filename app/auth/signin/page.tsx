'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts';
import Link from 'next/link';
import Image from 'next/image';


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
    <div className="min-h-screen bg-[#030712] text-white selection:bg-blue-500/30">
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden px-6">
        <div className="absolute top-0 left-1/2 w-full -translate-x-1/2 h-full z-0 pointer-events-none">
          <div className="absolute top-1/4 left-10 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] opacity-50"></div>
          <div className="absolute bottom-1/4 right-10 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px] opacity-50"></div>
        </div>

        <div className="relative z-10 w-full max-w-5xl grid lg:grid-cols-[500px_300px] gap-12 items-center justify-center">
          <div className="w-full">
            <div className="w-full h-[400px] bg-[#d9d9d9] rounded-xl relative">
              <div className="absolute left-[50px] top-[75px] text-[#192027] text-xl font-semibold">
                Start designing
              </div>
              <div className="absolute left-0 right-0 top-[200px] h-[200px] bg-[#b91c1c] rounded-b-xl flex items-center justify-center">
                <Image
                  src="/images/FlowBuildr%20Icon.png"
                  alt="FlowBuildr icon"
                  width={120}
                  height={120}
                  className="h-24 w-24"
                />
              </div>
            </div>
          </div>

          <div className="w-full h-[400px] bg-white text-black rounded-xl border border-[#d9d9d9] p-6 flex flex-col">
            <h2 className="text-2xl font-bold mb-6">Login</h2>

            {localError && (
              <div className="mb-4 p-3 rounded-md bg-red-100 border border-red-200 text-red-700 text-sm text-center">
                {localError}
              </div>
            )}

            <form onSubmit={handleSignIn} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="designerOne@flowbuildr.com"
                  className="w-full h-10 border border-[#d9d9d9] rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#0099FC]"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="*******"
                  className="w-full h-10 border border-[#d9d9d9] rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#0099FC]"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="mt-4 inline-flex rounded-md bg-gradient-to-r from-[#4DD0FF] to-[#118CD9] p-[1px] disabled:opacity-60"
              >
                <span className="flex h-10 w-full items-center justify-center rounded-md bg-[#0099FC] text-sm font-semibold text-white">
                  {isLoading ? 'Signing In...' : 'Login'}
                </span>
              </button>
            </form>

            <button className="mt-3 text-sm text-[#0099FC]">Forgot password?</button>

            <div className="mt-auto pt-6 text-sm">
              <span className="text-black/60">Need an account?</span>{' '}
              <Link href="/auth/signup" className="text-[#0099FC] font-semibold">
                Sign Up
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}