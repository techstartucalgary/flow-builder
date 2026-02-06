export default function DashboardPage() {
  return (
    <>
      <header className="mb-10">
        <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard</h1>
        <p className="text-gray-400 mt-1">
          Welcome back — your projects and reports will appear here.
        </p>
      </header>

      <div className="text-center py-24 border border-dashed border-gray-800 rounded-2xl bg-white/5">
        <p className="text-gray-300 font-medium">Nothing to show yet.</p>
      </div>
    </>
  );
}
