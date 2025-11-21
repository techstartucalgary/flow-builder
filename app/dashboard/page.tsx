'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts';
import { Button, Card, CardContent } from '@/components/ui';

export default function Dashboard() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/signin');
    }
  }, [user, loading, router]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-bold text-gray-800">Flow Builder</h1>
            <Button onClick={handleSignOut} variant="primary">
              Sign Out
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card>
          <CardContent className="p-8">
            <h2 className="text-3xl font-bold text-gray-800 mb-4">
              Welcome to your Dashboard!
            </h2>
            
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-indigo-900 mb-2">
                User Information
              </h3>
              <p className="text-gray-700">
                <span className="font-medium">Email:</span> {user.email}
              </p>
              <p className="text-gray-700">
                <span className="font-medium">User ID:</span> {user.id}
              </p>
              <p className="text-gray-700">
                <span className="font-medium">Created:</span>{' '}
                {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
              </p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-green-900 mb-2">
                🎉 Success!
              </h3>
              <p className="text-gray-700">
                You're successfully authenticated with Supabase. This is a protected page
                that only authenticated users can access.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
