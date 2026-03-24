import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

const AUTH_NOTES = [
  'Upload and calibrate plans without leaving the workspace.',
  'Review walls, openings, and room closure before takeoff.',
  'Keep generated quantities tied to the saved geometry revision.',
];

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--auth-surface)] lg:grid lg:grid-cols-[46%_54%]">
      <header className="flex items-center justify-between border-b border-white/5 bg-[#030712] px-5 py-3.5 lg:hidden">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-white/65 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <Image
          src="/images/FlowBuildr Primary Logo.png"
          alt="FlowBuildr"
          width={172}
          height={40}
          className="h-10 w-auto object-contain"
        />

        <div className="w-14" aria-hidden />
      </header>

      <aside className="relative hidden overflow-hidden bg-[#030712] text-white selection:bg-blue-500/30 lg:flex">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[-12%] top-[14%] h-[28rem] w-[28rem] rounded-full bg-cyan-500/12 blur-[130px]" />
          <div className="absolute bottom-[-8%] right-[-8%] h-[24rem] w-[24rem] rounded-full bg-indigo-600/10 blur-[120px]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.032)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.032)_1px,transparent_1px)] bg-[size:54px_54px]" />
        </div>

        <div className="relative z-10 flex h-full w-full flex-col px-10 py-10 xl:px-14 xl:py-12">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-white/55 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to home
            </Link>
            <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-100">
              Builder workflow
            </span>
          </div>

          <div className="my-auto max-w-[32rem]">
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/34">
              FlowBuildr
            </p>
            <h1 className="mt-6 font-[family:var(--font-display)] text-[clamp(3rem,5vw,4.75rem)] font-semibold leading-[0.92] tracking-[-0.05em] text-white">
              Precision takeoffs, grounded in the plan.
            </h1>
            <p className="mt-6 max-w-[26rem] text-lg leading-relaxed text-white/58">
              Bring drawings, geometry review, and material output into one operational surface instead of bouncing between markup tools and spreadsheets.
            </p>

            <div className="mt-10 border-t border-white/10 pt-6">
              <div className="text-[11px] uppercase tracking-[0.22em] text-white/34">
                What operators do here
              </div>
              <div className="mt-4 grid gap-3">
                {AUTH_NOTES.map((note, index) => (
                  <div key={note} className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-[11px] font-semibold text-white/68">
                      0{index + 1}
                    </span>
                    <p className="text-sm leading-6 text-white/56">{note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="text-[11px] uppercase tracking-[0.18em] text-white/28">
            AI integrated takeoff for builders
          </div>
        </div>
      </aside>

      <main className="relative flex min-h-[calc(100vh-52px)] items-center justify-center overflow-hidden px-5 py-10 sm:px-8 lg:min-h-screen lg:px-12 xl:px-16">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-y-0 left-0 hidden w-px bg-gradient-to-b from-transparent via-slate-300/25 to-transparent lg:block" />
          <div className="absolute right-0 top-0 h-[22rem] w-[22rem] rounded-full bg-cyan-400/10 blur-[120px]" />
          <div className="absolute bottom-0 left-[20%] h-[18rem] w-[18rem] rounded-full bg-blue-500/10 blur-[120px]" />
        </div>

        <div className="relative z-10 w-full max-w-[34rem]">{children}</div>
      </main>
    </div>
  );
}
