export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">
          Welcome to Flow Builder
        </h1>
        <p className="text-gray-600 mb-8">
          Get started by signing in or creating an account
        </p>
        <div className="space-x-4">
          <a
            href="/auth/signin"
            className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            Sign In
          </a>
          <a
            href="/auth/signup"
            className="inline-block px-6 py-3 bg-white text-indigo-600 border border-indigo-600 rounded-lg hover:bg-indigo-50 transition"
          >
            Sign Up
          </a>
        </div>
      </div>
    </main>
  );
}
