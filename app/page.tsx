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

      {/* --- HERO SECTION --- */}
      <div className="relative min-h-[calc(100vh-80px)] overflow-hidden flex flex-col items-center justify-center text-center">
        {/* Background Gradients */}
        <div className="absolute top-0 left-1/2 w-full -translate-x-1/2 h-full z-0 pointer-events-none">
          <div className="absolute top-20 left-10 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] opacity-50"></div>
          <div className="absolute bottom-0 right-10 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px] opacity-50"></div>
          {/* Grid Texture */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center">
          {/* Main Headline */}
          <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight leading-tight whitespace-nowrap">
            Analyzing House Costs with Ease
          </h1>

          {/* AI Line */}
          <div className="mt-4 flex items-center gap-2">
            <Image
              src="/images/AI Icon.png"
              alt="AI Icon"
              width={18}
              height={18}
              className="h-[18px] w-[18px]"
              priority
            />
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/80">
              AI INTEGRATED TAKEOFF FOR BUILDERS
            </p>
          </div>

          {/* Animated floor plan reveal */}
          <div className="mt-10 w-full">
            <FloorPlanReveal />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row justify-center gap-4 mt-10 w-full">
            <Link
              href="/auth/signup"
              className="px-8 py-4 rounded-lg font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-600/20 transition-all transform hover:-translate-y-1 flex items-center justify-center gap-2"
            >
              Start Building <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
