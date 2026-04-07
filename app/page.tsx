'use client';
import Navbar from '../components/ui/Navbar';
import FloorPlanReveal from '../components/ui/FloorPlanReveal';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-[#030712] text-white selection:bg-blue-500/30">
      <Navbar />

      {/* ── HERO SECTION ─────────────────────────────────────────── */}
      <section className="relative min-h-[calc(100vh-80px)] overflow-hidden flex items-center py-24 lg:py-32">
        {/* Background: mesh glows (blue left, indigo right) + grid texture */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          {/* Soft blue glow behind animation (left) */}
          <div className="absolute top-1/2 left-0 w-[80vw] max-w-[900px] h-[70vh] -translate-y-1/2 -translate-x-1/4 bg-blue-500/15 rounded-full blur-[140px]" />
          {/* Deep indigo glow behind text (right) */}
          <div className="absolute top-1/2 right-0 w-[70vw] max-w-[800px] h-[65vh] -translate-y-1/2 translate-x-1/4 bg-indigo-600/12 rounded-full blur-[140px]" />
          {/* Grid texture */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:50px_50px]" />
        </div>

        {/* ── Two-column grid: equal height so animation matches text block ── */}
        <div className="relative z-10 w-full max-w-[1400px] mx-auto px-8 sm:px-12 lg:px-16 xl:px-20
                        grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-20 xl:gap-24 items-stretch">

          {/* ── Left: Blueprint animation — fills column height, same as text ── */}
          <div className="order-2 lg:order-1 flex items-center justify-center min-w-0 h-full min-h-[320px] lg:min-h-0">
            <div className="w-full h-full max-w-[90vw] lg:max-w-full flex items-center justify-center">
              <FloorPlanReveal />
            </div>
          </div>

          {/* ── Right: Text stack ─────────────────────────────── */}
          <div className="order-1 lg:order-2 flex flex-col justify-center items-center lg:items-start text-center lg:text-left">
            {/* Headline — larger, bolder, tight leading */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white tracking-tight leading-[0.95]">
              Analyzing
              <br />
              House Costs
              <br />
              with Ease
            </h1>

            {/* Sub-headline */}
            <div className="mt-8 flex items-center gap-2.5">
              <Image
                src="/images/AI Icon.png"
                alt="AI Icon"
                width={18}
                height={18}
                className="h-[18px] w-[18px] flex-shrink-0"
                priority
              />
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0099FC]">
                AI Integrated Takeoff for Builders
              </p>
            </div>

            {/* Supporting copy — slightly larger, max-w-md */}
            <p className="mt-5 text-[17px] leading-relaxed text-white/55 max-w-md">
              Upload your blueprints, get accurate material quantities,
              and streamline your construction workflow all powered by AI.
            </p>

            {/* CTA — larger, more padding, blue glow */}
            <Link
              href="/auth/signup"
              className="mt-10 inline-flex items-center gap-2.5 px-10 py-4 rounded-full
                         font-bold text-base text-white
                         bg-[#0099FC] hover:bg-[#0088e0]
                         shadow-[0_0_32px_-4px_rgba(0,153,252,0.4)]
                         hover:shadow-[0_0_40px_-2px_rgba(0,153,252,0.5)]
                         transition-all duration-200 transform hover:-translate-y-0.5"
            >
              Start Building
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
