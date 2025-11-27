'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Menu, X, LogOut } from 'lucide-react';

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  
  
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isDashboard = pathname?.includes('/dashboard');

  return (
    <nav className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 border-b ${scrolled ? 'bg-[#030712]/90 backdrop-blur-xl border-white/10 shadow-lg' : 'bg-transparent border-transparent'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-24 items-center">
          
          {/* LEFT: LOGO */}
          <div className="flex-shrink-0 flex items-center">
            <Link href="/">
                <Image 
                  src="/images/FlowBuildrLogo.png" 
                  alt="FlowBuildr Logo" 
                  width={200} 
                  height={60} 
                  className="h-16 w-auto object-contain" 
                  priority 
                />
            </Link>
          </div>
          
          {/* CENTER: NAVIGATION LINKS */}
          <div className="hidden md:flex absolute left-1/2 transform -translate-x-1/2 items-center space-x-8">
            {!isDashboard && (
              <>
                <Link href="/" className="text-gray-300 hover:text-white transition-colors text-base font-medium">Home</Link>
                <Link href="/#features" className="text-gray-300 hover:text-white transition-colors text-base font-medium">Why FlowBuildr?</Link>
                <Link href="/pricing" className="text-gray-300 hover:text-white transition-colors text-base font-medium">Pricing</Link>
              </>
            )}
          </div>

          {/* RIGHT: AUTH BUTTONS */}
          <div className="hidden md:flex items-center space-x-6">
            {!isDashboard ? (
              <>
                <Link href="/auth/signin" className="text-white hover:text-blue-400 font-medium transition-colors text-base">Sign In</Link>
                <Link href="/auth/signup" className="px-6 py-2.5 rounded-full font-bold text-white bg-gradient-to-r from-blue-400 via-indigo-400 to-cyan-400 hover:opacity-90 transition-all shadow-lg shadow-blue-500/20 text-base">
                  Get Started
                </Link>
              </>
            ) : (
              <>
                <Link href="/dashboard" className="text-white font-medium text-sm">Dashboard</Link>
                <Link href="/pricing" className="text-gray-400 hover:text-white transition-colors text-sm">Plans</Link>
                <button className="flex items-center gap-2 text-gray-400 hover:text-red-400 transition-colors text-sm">
                  <LogOut size={16} /> Sign Out
                </button>
                <div className="w-9 h-9 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 border border-white/10 shadow-lg"></div>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-gray-300 hover:text-white">
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#030712] border-b border-white/10">
          <div className="px-4 pt-2 pb-6 space-y-2">
            <Link href="/" className="block px-3 py-3 rounded-md text-base font-medium text-gray-300 hover:bg-white/5">Home</Link>
            <Link href="/#features" className="block px-3 py-3 rounded-md text-base font-medium text-gray-300 hover:bg-white/5">Why FlowBuildr?</Link>
            <Link href="/pricing" className="block px-3 py-3 rounded-md text-base font-medium text-gray-300 hover:bg-white/5">Pricing</Link>
            <div className="border-t border-white/10 my-2 pt-2">
                <Link href="/auth/signin" className="block px-3 py-3 rounded-md text-base font-medium text-gray-300 hover:bg-white/5">Sign In</Link>
                <Link href="/auth/signup" className="block w-full text-center mt-4 bg-gradient-to-r from-blue-400 via-indigo-400 to-cyan-400 text-white py-3 rounded-md font-bold">Get Started</Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}