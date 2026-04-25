'use client';

import Navbar from '@/components/ui/Navbar';
import FloorPlanReveal from '@/components/ui/FloorPlanReveal';
import Link from 'next/link';
import Image from 'next/image';
import { useInViewOnce } from '@/hooks/useInViewOnce';
import {
  ArrowRight,
  Ruler,
  ScanLine,
  Layers,
  FileDown,
  ShieldCheck,
  Check,
  Crosshair,
  Eye,
  Box,
  Star,
} from 'lucide-react';

function ScrollReveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const [ref, seen] = useInViewOnce<HTMLDivElement>(0.08);
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        seen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      } ${className}`}
    >
      {children}
    </div>
  );
}

/* ===================================================================
   HOME PAGE — mirrors the original design section-by-section
   =================================================================== */

export default function Home() {
  return (
    <div className="min-h-screen bg-[#030712] text-white selection:bg-blue-500/30">
      <Navbar />

      {/* ─── HERO ──────────────────────────────────────────────────── */}
      <section className="relative min-h-[calc(100vh-80px)] overflow-hidden flex items-center py-3 sm:py-4 lg:py-5 xl:py-6">
        {/* Background glows + grid */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-1/2 left-0 w-[80vw] max-w-[900px] h-[70vh] -translate-y-1/2 -translate-x-1/4 bg-blue-500/[0.12] rounded-full blur-[140px]" />
          <div className="absolute top-1/2 right-0 w-[70vw] max-w-[800px] h-[65vh] -translate-y-1/2 translate-x-1/4 bg-indigo-600/[0.08] rounded-full blur-[140px]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:50px_50px]" />
        </div>

        <div className="relative z-10 w-full max-w-[1220px] mx-auto px-6 sm:px-8 lg:px-10 xl:px-12
                        grid grid-cols-1 lg:grid-cols-[minmax(0,auto)_minmax(0,auto)] gap-4 lg:gap-0 xl:gap-0 items-center justify-center lg:place-items-center lg:-translate-y-3 xl:-translate-y-4">

          {/* Right — Blueprint animation (large, prominent) */}
          <div className="order-2 flex items-center justify-center min-w-0 w-full hero-scale-in lg:justify-self-start lg:-translate-x-6 xl:-translate-x-8">
            <div className="w-full h-[clamp(420px,55vh,680px)] max-w-[98vw] lg:max-w-[900px] xl:max-w-[960px] flex items-center justify-center origin-center">
              <FloorPlanReveal />
            </div>
          </div>

          {/* Left — Text stack */}
          <div className="order-1 flex flex-col justify-center items-center lg:items-start text-center lg:text-left w-full max-w-[32rem] lg:max-w-[34rem] lg:justify-self-end lg:translate-x-5 xl:translate-x-6">
            <h1 className="text-[clamp(2.6rem,5vw,4.8rem)] font-bold text-white tracking-tight leading-[0.9] hero-headline-in">
              Analyzing
              <br />
              House Costs
              <br />
              with Ease
            </h1>

            <div className="mt-1 flex items-center hero-kicker-in">
              <p className="text-[0.88rem] sm:text-[0.95rem] font-semibold uppercase tracking-[0.18em] text-[#0099FC]">
                AI Integrated Takeoff for Builders
              </p>
            </div>

            <p className="mt-1.5 text-[clamp(1rem,1.35vw,1.24rem)] leading-[1.5] text-white/55 max-w-[34rem] hero-copy-in">
              Upload your blueprints, get accurate material quantities,
              and streamline your construction workflow all powered by AI.
            </p>

            <Link
              href="/auth/signup"
              className="mt-3 inline-flex items-center gap-2.5 px-10 py-4 rounded-full
                         font-bold text-base sm:text-lg text-white
                         bg-[#297FD6] hover:bg-[#2473C2]
                         shadow-[0_0_32px_-4px_rgba(41,127,214,0.4)]
                         hover:shadow-[0_0_40px_-2px_rgba(41,127,214,0.5)]
                         transition-all duration-200 transform hover:-translate-y-0.5
                         hero-cta-in"
            >
              Start Building
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── TRUSTED BY ────────────────────────────────────────────── */}
      <section id="about" className="border-t border-white/[0.04] py-10">
        <ScrollReveal>
          <div className="max-w-[1200px] mx-auto px-6 lg:px-10 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-600 mb-8">
              Trusted By
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-14 gap-y-5 text-gray-500">
              {TRUSTED_BY.map((name) => (
                <span key={name} className="text-sm font-semibold tracking-wide opacity-60">{name}</span>
              ))}
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* ─── AI TAKEOFF TOOLS ──────────────────────────────────────── */}
      <section id="features" className="py-14 lg:py-16 border-t border-white/[0.04]">
        <ScrollReveal>
          <div className="max-w-[980px] mx-auto px-6 lg:px-8">
            <div className="text-center max-w-[640px] mx-auto mb-6 lg:mb-7">
              <h2 className="text-[clamp(2rem,3.8vw,3rem)] font-bold tracking-tight leading-[1.04]">
                AI Takeoff Tools That Handle
                <br />
                the Hard Part
              </h2>
              <p className="mt-2.5 text-gray-500 text-[13px] leading-relaxed">
                Build smarter takeoffs and reduce manual measuring and data entry technologies.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 lg:gap-3">
              {TAKEOFF_TOOLS.map((f) => (
                <div
                  key={f.title}
                  className="h-full min-h-[148px] rounded-[10px] border border-white/[0.06] bg-[#0a1225] p-4 hover:border-white/[0.10] transition"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-500/[0.08] border border-blue-500/[0.15] flex items-center justify-center mb-3">
                    <f.icon size={15} className="text-blue-400" />
                  </div>
                  <h3 className="text-[15px] font-semibold text-white mb-1.5">{f.title}</h3>
                  <p className="text-[12.5px] text-gray-500 leading-[1.5]">{f.description}</p>
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* ─── DRAWING INTELLIGENCE ──────────────────────────────────── */}
      <section className="py-14 lg:py-16 border-t border-white/[0.04]">
        <ScrollReveal>
          <div className="max-w-[1060px] mx-auto px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-7">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-[1.05]">
                Drawing Intelligence Built for
                <br />
                Takeoff Teams
              </h2>
              <p className="mt-2.5 text-gray-500 text-[13px] leading-relaxed">
                Built as a collaborative document analysis tool built for Takeoff Teams.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-3">
              {/* Large blueprint panel */}
              <div className="relative rounded-[10px] border border-white/[0.06] bg-[#060d1b] p-3 min-h-[220px] lg:min-h-[240px] shadow-[inset_0_0_80px_rgba(0,0,0,0.35)] overflow-hidden">
                <MathFloorplan />
                <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.06)_1px,transparent_1px)] bg-[size:44px_44px] pointer-events-none" />
              </div>

              {/* Stacked feature cards */}
              <div className="flex flex-col gap-3">
                <div className="rounded-[10px] border border-white/[0.06] bg-[#0a1225] p-3.5 min-h-[114px]">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/[0.08] border border-blue-500/[0.15] flex items-center justify-center flex-shrink-0">
                      <FileDown size={14} className="text-blue-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-white">PDF Export</h3>
                  </div>
                  <p className="text-[12px] text-gray-500 leading-relaxed">
                    Generate standardized reports and create downloadable PDF export formats.
                  </p>
                </div>
                <div className="rounded-[10px] border border-white/[0.06] bg-[#0a1225] p-3.5 min-h-[114px]">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/[0.08] border border-blue-500/[0.15] flex items-center justify-center flex-shrink-0">
                      <Box size={14} className="text-blue-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-white">3D View</h3>
                  </div>
                  <p className="text-[12px] text-gray-500 leading-relaxed">
                    Flat PDF floor plans extracted to convert to 3D model representations.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* ─── AUTO-DETECT ROOMS SHOWCASE ────────────────────────────── */}
      <section className="py-12 lg:py-14 border-t border-white/[0.04]">
        <ScrollReveal>
          <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
            <div className="rounded-2xl border border-white/[0.06] bg-[radial-gradient(100%_120%_at_10%_10%,rgba(30,65,120,0.32),rgba(10,18,37,1))] overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-[1.65fr_3.35fr] gap-0 min-h-[400px]">
                <div className="p-8 lg:p-12 flex flex-col justify-center">
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
                    Auto-detect Rooms
                  </h2>
                  <p className="text-sm text-gray-400 leading-relaxed max-w-sm">
                    Reads raw raster or vectorized floor plan images, parses
                    room/hall functions, discovers room extent from the
                    boundaries, determined wall teams, and an assignment of
                    panel grades.
                  </p>
                </div>
                <div className="p-3 lg:p-4">
                  <MockAppScreen variant="rooms" />
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* ─── CROSS-REFERENCE INTELLIGENCE ──────────────────────────── */}
      <section className="py-6 lg:py-8">
        <ScrollReveal>
          <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
            <div className="rounded-2xl border border-white/[0.06] bg-[radial-gradient(100%_120%_at_10%_10%,rgba(30,65,120,0.32),rgba(10,18,37,1))] overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-0 min-h-[250px]">
                <div className="p-8 lg:p-10 flex flex-col justify-center">
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
                    Cross-Reference
                    <br />
                    Intelligence
                  </h2>
                  <p className="text-sm text-gray-400 leading-relaxed max-w-sm">
                    Analyze cabinet/report strips, equipment schedules, and sizing
                    values. Matches bid coverage requirements, sale rates, or totals
                    to current/historical output, detect/link at factor threshold.
                  </p>
                </div>
                <div className="p-4 lg:p-5">
                  <MockAppScreen variant="cross-ref" />
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* ─── CREATE REPORTS ────────────────────────────────────────── */}
      <section className="py-14 lg:py-16 border-t border-white/[0.04]">
        <ScrollReveal>
          <div className="max-w-[1200px] mx-auto px-6 lg:px-10 text-center">
            <h2 className="text-3xl sm:text-4xl lg:text-[2.5rem] font-bold tracking-tight leading-tight mb-3">
              Create Powerful, Flexible
              <br />
              Project Reports
            </h2>
            <p className="text-gray-500 text-sm leading-relaxed mb-8">
              Make detailed export tasks and tabbing your tasks quick work.
            </p>

            <div className="rounded-xl border border-white/[0.05] bg-[#0a1225] p-5 lg:p-6 min-h-[360px]">
              <MockAppScreen variant="reports" />
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* ─── PRICING ───────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 lg:py-24 border-t border-white/[0.04]">
        <ScrollReveal>
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Pricing</h2>
            <p className="mt-3 text-gray-400 text-[15px]">
              Pick a plan that works and starting your tasks quick work.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Lite */}
            <div className="rounded-xl border border-blue-500/20 bg-[#0a1225] p-8">
              <div className="flex items-baseline gap-2 mb-1">
                <p className="text-sm font-semibold text-blue-400">Lite</p>
                <span className="text-xs text-gray-600">/ lite license</span>
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-4xl font-bold text-white">$35</span>
                <span className="text-sm text-gray-500">/mo</span>
              </div>
              <p className="text-xs text-gray-500 mb-8">
                For solo estimators and independent contractors looking to automate.
              </p>
              <ul className="space-y-3 mb-8">
                {LITE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-gray-300">
                    <Check size={14} className="text-blue-400 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/signup"
                className="block text-center w-full py-3 rounded-lg bg-[#0099FC] hover:bg-[#0088e0] text-sm font-semibold text-white transition"
              >
                Get Started
              </Link>
            </div>

            {/* Plus */}
            <div className="rounded-xl border border-blue-500/20 bg-[#0a1225] p-8">
              <div className="flex items-baseline gap-2 mb-1">
                <p className="text-sm font-semibold text-blue-400">Plus</p>
                <span className="text-xs text-gray-600">/ per license</span>
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-4xl font-bold text-white">$70</span>
                <span className="text-sm text-gray-500">/mo</span>
              </div>
              <p className="text-xs text-gray-500 mb-8">
                For teams and growing companies that need unlimited projects and efficiency.
              </p>
              <ul className="space-y-3 mb-8">
                {PLUS_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-gray-300">
                    <Check size={14} className="text-blue-400 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/auth/signup"
                className="block text-center w-full py-3 rounded-lg bg-[#0099FC] hover:bg-[#0088e0] text-sm font-semibold text-white transition"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
        </ScrollReveal>
      </section>

      {/* ─── TESTIMONIAL ───────────────────────────────────────────── */}
      <section className="py-20 lg:py-24 border-t border-white/[0.04]">
        <ScrollReveal>
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
          <div className="max-w-2xl mx-auto text-center">
            <div className="flex items-center justify-center gap-1 mb-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={20} className="text-yellow-400 fill-yellow-400" />
              ))}
            </div>
            <blockquote className="text-[15px] text-gray-300 leading-relaxed mb-8">
              &ldquo;Their app is tailored to our contracting needs! Calculating quantities for 6-inch versus 8-inch walls and
              providing detailed material breakdowns has saved our team significant estimation time and
              helped us bid more confidently. We recommend it to other contractors for its
              practical simplicity.&rdquo;
            </blockquote>
            <div className="flex items-center justify-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-xs font-bold">
                JD
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">James Dasher</p>
                <p className="text-xs text-gray-500">Renovation Planner</p>
              </div>
            </div>
          </div>
        </div>
        </ScrollReveal>
      </section>

      {/* ─── CONTACT ───────────────────────────────────────────────── */}

      {/* ─── FOOTER ────────────────────────────────────────────────── */}
      <footer id="contact" className="border-t border-white/[0.06] pt-16 pb-10">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
          <div className="grid grid-cols-2 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr] gap-10 mb-14">
            {/* Brand column */}
            <div className="col-span-2 md:col-span-1">
              <Image
                src="/images/FlowBuildrCroppedLogo.png"
                alt="FlowBuildr"
                width={265}
                height={46}
                className="h-[2.75rem] lg:h-[2.85rem] w-auto object-contain mb-5"
              />
              <p className="text-xs text-gray-600 leading-relaxed max-w-[220px]">
                AI-powered construction takeoff and material estimation for residential builders.
              </p>
            </div>

            {/* Link columns */}
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.title}>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 mb-4">
                  {col.title}
                </p>
                <ul className="space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link}>
                      <a href="#" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="border-t border-white/[0.06] pt-6 text-center">
            <p className="text-xs text-gray-600">
              Copyright &copy; {new Date().getFullYear()} FlowBuildr
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ===================================================================
   MOCK APP SCREEN — placeholder product UI for showcase sections
   =================================================================== */

function MockAppScreen({ variant }: { variant: 'rooms' | 'cross-ref' | 'reports' }) {
  if (variant === 'rooms') {
    return (
      <div className="relative h-full min-h-[210px] rounded-xl border border-white/[0.05] bg-[#060d1b] overflow-hidden">
        <Image
          src="/images/auto-detect-rooms-preview.png"
          alt="Auto-detect Rooms UI preview"
          fill
          className="object-contain object-center"
          sizes="(min-width: 1024px) 700px, 100vw"
        />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-transparent to-[#060d1b]/10" />
      </div>
    );
  }

  if (variant === 'cross-ref') {
    return (
      <div className="h-full min-h-[210px] rounded-xl border border-white/[0.05] bg-[#060d1b] overflow-hidden">
        <div className="flex items-center px-4 py-2 border-b border-white/[0.05]">
          <span className="text-[10px] text-gray-600 tracking-wide">Estimate Board — LIVE</span>
        </div>
        <div className="p-3.5 grid grid-cols-[1fr_128px] gap-3">
          <div className="rounded-md border border-white/[0.05] bg-[#0a1428] p-2.5 space-y-2">
            <div className="h-2.5 w-1/2 rounded-sm bg-white/[0.05]" />
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[1fr_56px] gap-2 items-center py-1 border-b border-white/[0.03]">
                <div className="h-2 rounded-sm bg-white/[0.05]" style={{ width: `${75 - (i % 3) * 9}%` }} />
                <div className="h-2 rounded-sm bg-blue-500/[0.10]" />
              </div>
            ))}
          </div>
          <div className="rounded-md border border-white/[0.05] bg-[#0a1428] p-2.5">
            <div className="h-2.5 w-2/3 rounded-sm bg-white/[0.05] mb-2.5" />
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-4 rounded-sm bg-white/[0.04]" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
      <div className="h-full min-h-[300px] rounded-lg border border-white/[0.04] bg-[#060d1b] overflow-hidden">
      <div className="flex items-center px-4 py-2 border-b border-white/[0.04]">
        <span className="text-[10px] text-gray-600 tracking-wide">Project Report — Export Preview</span>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-7 w-24 rounded-md bg-blue-500/[0.08] border border-blue-500/[0.12]" />
          <div className="h-7 w-24 rounded-md bg-white/[0.03]" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-md border border-white/[0.05] bg-white/[0.015] p-3">
              <div className="h-2 w-3/4 rounded-sm bg-white/[0.05] mb-2.5" />
              <div className="h-6 w-1/2 rounded-sm bg-white/[0.03]" />
              <div className="h-1.5 w-full rounded-sm bg-white/[0.025] mt-2.5" />
            </div>
          ))}
        </div>
        <div className="space-y-1.5 pt-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-2.5 rounded-sm bg-white/[0.03]" style={{ width: `${80 - i * 10}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MathFloorplan() {
  return (
    <svg
      viewBox="0 0 1200 520"
      className="h-full w-full"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Generated blueprint floorplan"
      role="img"
    >
      <defs>
        <linearGradient id="bpStroke" x1="0" y1="0" x2="1200" y2="520" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgba(125,211,252,0.62)" />
          <stop offset="1" stopColor="rgba(96,165,250,0.42)" />
        </linearGradient>
        <linearGradient id="bpSoft" x1="0" y1="0" x2="1200" y2="520" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgba(147,197,253,0.26)" />
          <stop offset="1" stopColor="rgba(125,211,252,0.14)" />
        </linearGradient>
      </defs>

      <rect x="40" y="40" width="1120" height="440" stroke="url(#bpStroke)" strokeWidth="4" />
      <rect x="54" y="54" width="1092" height="412" stroke="rgba(125,211,252,0.25)" strokeWidth="1.5" />

      <line x1="280" y1="40" x2="280" y2="260" stroke="url(#bpStroke)" strokeWidth="3" />
      <line x1="520" y1="40" x2="520" y2="260" stroke="url(#bpStroke)" strokeWidth="3" />
      <line x1="760" y1="40" x2="760" y2="260" stroke="url(#bpStroke)" strokeWidth="3" />
      <line x1="920" y1="40" x2="920" y2="260" stroke="url(#bpStroke)" strokeWidth="3" />
      <line x1="40" y1="260" x2="760" y2="260" stroke="url(#bpStroke)" strokeWidth="3" />
      <line x1="760" y1="260" x2="1160" y2="260" stroke="url(#bpStroke)" strokeWidth="3" />
      <line x1="440" y1="260" x2="440" y2="480" stroke="url(#bpStroke)" strokeWidth="3" />
      <line x1="680" y1="260" x2="680" y2="480" stroke="url(#bpStroke)" strokeWidth="3" />
      <line x1="880" y1="260" x2="880" y2="480" stroke="url(#bpStroke)" strokeWidth="3" />
      <line x1="40" y1="360" x2="440" y2="360" stroke="url(#bpStroke)" strokeWidth="2.5" />
      <line x1="440" y1="360" x2="880" y2="360" stroke="url(#bpStroke)" strokeWidth="2.5" />

      <line x1="150" y1="120" x2="150" y2="260" stroke="url(#bpSoft)" strokeWidth="2" />
      <line x1="360" y1="120" x2="360" y2="260" stroke="url(#bpSoft)" strokeWidth="2" />
      <line x1="610" y1="120" x2="610" y2="260" stroke="url(#bpSoft)" strokeWidth="2" />
      <line x1="1030" y1="120" x2="1030" y2="260" stroke="url(#bpSoft)" strokeWidth="2" />
      <line x1="40" y1="140" x2="360" y2="140" stroke="url(#bpSoft)" strokeWidth="2" />
      <line x1="360" y1="140" x2="760" y2="140" stroke="url(#bpSoft)" strokeWidth="2" />
      <line x1="760" y1="140" x2="1160" y2="140" stroke="url(#bpSoft)" strokeWidth="2" />
      <line x1="220" y1="360" x2="220" y2="480" stroke="url(#bpSoft)" strokeWidth="2" />
      <line x1="1000" y1="260" x2="1000" y2="480" stroke="url(#bpSoft)" strokeWidth="2" />
      <line x1="680" y1="430" x2="1000" y2="430" stroke="url(#bpSoft)" strokeWidth="2" />

      <path d="M280 178 A42 42 0 0 1 322 220" stroke="rgba(147,197,253,0.42)" strokeWidth="2" />
      <path d="M520 178 A42 42 0 0 0 478 220" stroke="rgba(147,197,253,0.42)" strokeWidth="2" />
      <path d="M760 304 A40 40 0 0 1 800 344" stroke="rgba(147,197,253,0.38)" strokeWidth="2" />
      <path d="M440 310 A38 38 0 0 1 478 348" stroke="rgba(147,197,253,0.35)" strokeWidth="1.8" />
      <path d="M920 94 A34 34 0 0 1 954 128" stroke="rgba(147,197,253,0.35)" strokeWidth="1.8" />
      <path d="M220 405 A30 30 0 0 1 250 435" stroke="rgba(147,197,253,0.35)" strokeWidth="1.6" />

      {[
        [90, 54], [120, 54], [450, 54], [480, 54], [830, 54], [860, 54], [1090, 54], [1120, 54],
        [54, 120], [54, 170], [54, 330], [54, 380], [1146, 120], [1146, 170], [1146, 330], [1146, 380],
      ].map(([x, y], i) => (
        <line
          key={`w-${i}`}
          x1={x}
          y1={y}
          x2={x + (y === 54 ? 0 : 16)}
          y2={y + (y === 54 ? 16 : 0)}
          stroke="rgba(147,197,253,0.45)"
          strokeWidth="1.4"
        />
      ))}

      <rect x="560" y="74" width="36" height="28" rx="3" stroke="rgba(147,197,253,0.32)" strokeWidth="1.2" />
      <rect x="610" y="74" width="36" height="28" rx="3" stroke="rgba(147,197,253,0.32)" strokeWidth="1.2" />
      <circle cx="565" cy="186" r="8" stroke="rgba(147,197,253,0.26)" strokeWidth="1.2" />
      <rect x="555" y="200" width="20" height="22" rx="2" stroke="rgba(147,197,253,0.26)" strokeWidth="1.1" />
      <rect x="165" y="382" width="120" height="70" rx="2" stroke="rgba(147,197,253,0.22)" strokeWidth="1.1" />
      {Array.from({ length: 5 }).map((_, i) => (
        <line
          key={`stair-${i}`}
          x1={170}
          y1={392 + i * 12}
          x2={280}
          y2={392 + i * 12}
          stroke="rgba(147,197,253,0.18)"
          strokeWidth="1"
        />
      ))}

      <text x="95" y="105" fill="rgba(148,163,184,0.45)" fontSize="10" fontFamily="monospace">BEDROOM 1</text>
      <text x="310" y="105" fill="rgba(148,163,184,0.45)" fontSize="10" fontFamily="monospace">BEDROOM 2</text>
      <text x="550" y="105" fill="rgba(148,163,184,0.45)" fontSize="10" fontFamily="monospace">BATH</text>
      <text x="790" y="105" fill="rgba(148,163,184,0.45)" fontSize="10" fontFamily="monospace">LIVING</text>
      <text x="970" y="105" fill="rgba(148,163,184,0.45)" fontSize="10" fontFamily="monospace">KITCHEN</text>
      <text x="95" y="315" fill="rgba(148,163,184,0.45)" fontSize="10" fontFamily="monospace">DINING</text>
      <text x="470" y="315" fill="rgba(148,163,184,0.45)" fontSize="10" fontFamily="monospace">FAMILY ROOM</text>
      <text x="710" y="315" fill="rgba(148,163,184,0.45)" fontSize="10" fontFamily="monospace">HALL</text>
      <text x="915" y="315" fill="rgba(148,163,184,0.45)" fontSize="10" fontFamily="monospace">ENTRY</text>

      <line x1="40" y1="500" x2="1160" y2="500" stroke="rgba(148,163,184,0.18)" strokeWidth="0.9" />
      <line x1="40" y1="496" x2="40" y2="504" stroke="rgba(148,163,184,0.22)" strokeWidth="0.9" />
      <line x1="1160" y1="496" x2="1160" y2="504" stroke="rgba(148,163,184,0.22)" strokeWidth="0.9" />
      <text x="600" y="510" fill="rgba(148,163,184,0.30)" fontSize="9" fontFamily="monospace" textAnchor="middle">
        42&apos;-10&quot;
      </text>
      <line x1="20" y1="40" x2="20" y2="480" stroke="rgba(148,163,184,0.18)" strokeWidth="0.9" />
      <line x1="16" y1="40" x2="24" y2="40" stroke="rgba(148,163,184,0.22)" strokeWidth="0.9" />
      <line x1="16" y1="480" x2="24" y2="480" stroke="rgba(148,163,184,0.22)" strokeWidth="0.9" />

      {Array.from({ length: 14 }).map((_, i) => (
        <line
          key={`h-${i}`}
          x1={80}
          y1={88 + i * 28}
          x2={1120}
          y2={88 + i * 28}
          stroke="rgba(125,211,252,0.05)"
          strokeWidth="1"
        />
      ))}
      {Array.from({ length: 22 }).map((_, i) => (
        <line
          key={`v-${i}`}
          x1={88 + i * 48}
          y1={76}
          x2={88 + i * 48}
          y2={470}
          stroke="rgba(125,211,252,0.05)"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

/* ===================================================================
   DATA
   =================================================================== */

const TRUSTED_BY = [
  'FounderBuild',
  'CalcAZ',
  'FrameworkBoom',
  'DAVIS SCOUT',
  'JOSLYN LOFTS',
  'WealthyBoards',
];

const TAKEOFF_TOOLS = [
  {
    icon: Crosshair,
    title: 'Auto-Count',
    description: 'Auto-detect/scan all estimator-target wall, door, and outlet elements across plan sets.',
  },
  {
    icon: ScanLine,
    title: 'Vector Detection',
    description: 'Trace directional floor plan vectors, routes, paths, and geometries and intersections.',
  },
  {
    icon: Layers,
    title: 'Auto Count',
    description: 'Monitors and counts material types/categories needed for accurate takeoff quantities.',
  },
  {
    icon: Ruler,
    title: 'Vector Deduction',
    description: 'Determine opening deductions for doors, windows, and cutouts from wall surfaces.',
  },
  {
    icon: Eye,
    title: 'View Detections',
    description: 'Intelligent scan and detection across multiple plan views and scales.',
  },
  {
    icon: ShieldCheck,
    title: 'Accuracy & Reliability',
    description: 'AI-assisted cross-checks for measurement precision and complete coverage.',
  },
];

const LITE_FEATURES = [
  '3 AI Candidate Restrictions',
  'Viewer/Filter Features',
  'Connected Strategies',
  'Exports',
  'Scheduling Dashboards',
  'PDF Reports',
];

const PLUS_FEATURES = [
  'Unlimited projects',
  'Single-trade/multi-trade estimating',
  'Managed Activity/Operations',
  'Report Features',
  'Subscription/Support',
  'Production/Priority Support',
];

const FOOTER_COLUMNS = [
  {
    title: 'Support',
    links: ['Docs', 'Guides', 'API Reference', 'FAQ', 'Community'],
  },
  {
    title: 'Product',
    links: ['Features', 'Integrations', 'Enterprise', 'Changelog', 'Pricing'],
  },
  {
    title: 'About',
    links: ['Company', 'Blog', 'Careers', 'Press', 'Partners'],
  },
  {
    title: 'Contact',
    links: ['Talk to us + request a demo for FREE', 'Partnerships', 'Custom solutions', 'Customer support with response under covers', 'All requests'],
  },
];
