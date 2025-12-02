'use client';
import Navbar from '../components/ui/Navbar';
import Link from 'next/link';
import { ArrowRight, BarChart3, FileText, Layers, ShieldCheck, Zap } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-[#030712] text-white selection:bg-blue-500/30">
      <Navbar />
      
      {/* --- HERO SECTION --- */}
      <div className="relative pt-48 pb-12 lg:pt-52 lg:pb-20 overflow-hidden flex flex-col items-center justify-center">
        
        {/* Background Gradients */}
        <div className="absolute top-0 left-1/2 w-full -translate-x-1/2 h-full z-0 pointer-events-none">
           <div className="absolute top-20 left-10 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] opacity-50"></div>
           <div className="absolute bottom-0 right-10 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px] opacity-50"></div>
           {/* Subtle Grid Texture */}
           <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center">
        
          
          {/* Main Headline */}
          <h1 className="text-5xl md:text-7xl font-bold text-white tracking-tight mb-6 leading-tight">
            Analyzing House Costs <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-cyan-400">
              with Ease
            </span>
          </h1>

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-900/20 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-widest mb-6 animate-fade-in-up">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            AI Integrated Takeoff Tool
          </div>
          
          {/* Subtitle */}
          <p className="mt-2 max-w-2xl mx-auto text-xl text-white mb-8 leading-relaxed text-center">
            Stop wrestling with spreadsheets. Upload your floor plans and let <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-cyan-400">FlowBuildr</span> calculate materials, costs, and timelines in seconds.
          </p>
          
          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-10 w-full">
            <Link href="/auth/signup" className="px-8 py-4 rounded-lg font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-600/20 transition-all transform hover:-translate-y-1 flex items-center justify-center gap-2">
              Start Building <ArrowRight size={18} />
            </Link>
          </div>          
        </div>
      </div>

      {/* FEATURES SECTION */}
      <div id="features" className="py-16 bg-[#030712] relative border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Why Choose <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-cyan-400">FlowBuildr</span>?</h2>
                <p className="text-gray-400 max-w-2xl mx-auto">Everything you need to streamline your construction estimates and win more bids.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
                {/* Feature 1 */}
                <div className="p-8 rounded-2xl bg-[#0b1120] border border-white/5 hover:border-blue-500/30 transition-all hover:-translate-y-1 group">
                    <div className="w-14 h-14 rounded-xl bg-blue-900/20 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-6 group-hover:bg-blue-600 group-hover:text-white transition-all">
                        <FileText size={28} />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-3">PDF to Estimate</h3>
                    <p className="text-gray-300 leading-relaxed text-sm">Upload blueprints directly. Our engine extracts measurements and generates material takeoffs instantly.</p>
                </div>

                 {/* Feature 2 */}
                 <div className="p-8 rounded-2xl bg-[#0b1120] border border-white/5 hover:border-blue-500/30 transition-all hover:-translate-y-1 group">
                    <div className="w-14 h-14 rounded-xl bg-indigo-900/20 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                        <BarChart3 size={28} />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-3">Cost Analysis</h3>
                    <p className="text-gray-300 leading-relaxed text-sm">Get real-time pricing data for accurate budget forecasting. Adjust margins and labor costs on the fly.</p>
                </div>

                 {/* Feature 3 */}
                 <div className="p-8 rounded-2xl bg-[#0b1120] border border-white/5 hover:border-blue-500/30 transition-all hover:-translate-y-1 group">
                    <div className="w-14 h-14 rounded-xl bg-cyan-900/20 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-6 group-hover:bg-cyan-600 group-hover:text-white transition-all">
                        <Zap size={28} />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-3">AI Powered</h3>
                    <p className="text-gray-300 leading-relaxed text-sm">Our AI detects rooms, walls, and fixtures automatically, saving you hours of manual counting.</p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}