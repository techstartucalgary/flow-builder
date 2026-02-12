import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft } from 'lucide-react';

/*
 * ── Shared Auth Layout ───────────────────────────────────────────────
 *
 * Desktop : two-column (42 / 58 split)  — brand panel + form panel
 * Mobile  : single column with compact dark header, then form
 *
 * The left panel re-uses the same gradient orbs + grid texture as the
 * landing page so the brand feels continuous.
 *
 * Tweak points:
 *   - Column split   → change lg:grid-cols-[42%_1fr]
 *   - Panel padding   → p-10 xl:p-14
 *   - Right-panel bg  → var(--auth-surface) in globals.css
 *   - Card max-width  → max-w-[420px] on the wrapper below
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col lg:grid lg:grid-cols-[42%_1fr]">
      {/* ── Mobile header (< lg) ─────────────────────────────────── */}
      <header className="lg:hidden flex items-center justify-between px-5 py-3.5 bg-[#030712] border-b border-white/5">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Link>

        <Image
          src="/images/FlowBuildr Primary Logo.png"
          alt="FlowBuildr"
          width={180}
          height={40}
          className="h-10 w-auto object-contain"
        />

        {/* Spacer so logo stays centered */}
        <div className="w-14" aria-hidden />
      </header>

      {/* ── Left brand panel (desktop) ───────────────────────────── */}
      <div className="hidden lg:flex flex-col relative overflow-hidden bg-[#030712] selection:bg-blue-500/30">
        {/* Decorative gradient orbs — same as landing page */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-16 left-8 w-[420px] h-[420px] bg-blue-600/10 rounded-full blur-[120px] opacity-50" />
          <div className="absolute bottom-16 right-0 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] opacity-50" />
          {/* Grid texture — same as landing page */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:48px_48px]" />
        </div>

        <div className="relative z-10 flex flex-col h-full p-10 xl:p-14">
          {/* Back link */}
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors w-fit"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>

          

          {/* Headline — vertically centred in remaining space */}
          <div className="mt-auto mb-auto">
            <h1 className="text-3xl xl:text-[2.5rem] font-bold text-white leading-snug tracking-tight">
              Precision takeoffs,
              <br />
              powered by AI.
            </h1>
            <p className="mt-5 text-[15px] text-white/45 leading-relaxed max-w-[340px]">
              Upload your blueprints, get accurate material quantities,
              and streamline your construction workflow.
            </p>
          </div>

          {/* Bottom tag */}
          <p className="text-[11px] text-white/25 tracking-[0.15em] uppercase">
            AI Integrated Takeoff for Builders
          </p>
        </div>
      </div>

      {/* ── Right auth panel ─────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center bg-[var(--auth-surface)] px-5 py-10 sm:px-8 lg:px-12 min-h-[calc(100vh-52px)] lg:min-h-screen">
        <div className="w-full max-w-[420px]">{children}</div>
      </div>
    </div>
  );
}
