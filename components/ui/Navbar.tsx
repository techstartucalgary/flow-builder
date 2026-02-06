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
    <nav
      className={`sticky top-0 left-0 w-full z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[#030712]/90 backdrop-blur-xl border-b border-white/10 shadow-lg'
          : 'bg-transparent'
      }`}
    >
      <div className="w-full">
        <div className="flex h-20 items-center">
          {/* LEFT: LOGO (mt 4px / ml 6px) */}
          <div className="flex-shrink-0 flex items-center mt-[4px] ml-[6px]">
            <Link href="/" aria-label="FlowBuildr Home">
              <Image
                src="/images/FlowBuildr Primary Logo.png"
                alt="FlowBuildr"
                width={220}
                height={48}
                className="h-42 w-auto object-contain"
                priority
              />
            </Link>
          </div>

          {/* CENTER: NAV LINKS (spaced out) */}
          <div className="hidden md:flex flex-1 items-center justify-center -translate-x-6">
            {!isDashboard && (
              <div className="flex items-center gap-x-10">
                <Link
                  href="/"
                  className="text-white text-base font-medium hover:underline decoration-white underline-offset-8"
                >
                  Home
                </Link>
                <Link
                  href="/#about"
                  className="text-white text-base font-medium hover:underline decoration-white underline-offset-8"
                >
                  About
                </Link>
                <Link
                  href="/#features"
                  className="text-white text-base font-medium hover:underline decoration-white underline-offset-8"
                >
                  Why Choose Us
                </Link>
                <Link
                  href="/#pricing"
                  className="text-white text-base font-medium hover:underline decoration-white underline-offset-8"
                >
                  Pricing
                </Link>
                <Link
                  href="/#contact"
                  className="text-white text-base font-medium hover:underline decoration-white underline-offset-8"
                >
                  Contact
                </Link>
              </div>
            )}
          </div>

          {/* RIGHT: AUTH BUTTONS */}
          <div className="hidden md:flex items-center ml-auto mt-[8px] mr-[18px]">
            {!isDashboard ? (
              <>
                <Link
                  href="/auth/signin"
                  className="inline-flex rounded-full bg-gradient-to-r from-[#4DD0FF] to-[#118CD9] p-[1px] mr-[14px]"
                >
                  <span className="flex h-8 w-[100px] items-center justify-center rounded-full bg-[#0B1220] text-sm font-semibold text-white">
                    Login
                  </span>
                </Link>

                <Link href="/auth/signup" className="inline-flex">
                  <span className="flex h-8 w-[100px] items-center justify-center rounded-full bg-[#0099FC] text-sm font-semibold text-white">
                    Sign Up
                  </span>
                </Link>
              </>
            ) : (
              <>
                <Link href="/dashboard" className="text-white font-medium text-sm mr-4">
                  Dashboard
                </Link>
                <Link
                  href="/pricing"
                  className="text-gray-400 hover:text-white transition-colors text-sm mr-4"
                >
                  Plans
                </Link>
                <button className="flex items-center gap-2 text-gray-400 hover:text-red-400 transition-colors text-sm mr-4">
                  <LogOut size={16} /> Sign Out
                </button>
                <div className="w-9 h-9 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 border border-white/10 shadow-lg" />
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center ml-auto mr-4">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-gray-300 hover:text-white"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#030712] border-b border-white/10">
          <div className="px-4 pt-2 pb-6 space-y-2">
            <Link
              href="/"
              className="block px-3 py-3 rounded-md text-base font-medium text-white/90 hover:bg-white/5"
            >
              Home
            </Link>
            <Link
              href="/#about"
              className="block px-3 py-3 rounded-md text-base font-medium text-white/90 hover:bg-white/5"
            >
              About
            </Link>
            <Link
              href="/#features"
              className="block px-3 py-3 rounded-md text-base font-medium text-white/90 hover:bg-white/5"
            >
              Why Choose Us
            </Link>
            <Link
              href="/#pricing"
              className="block px-3 py-3 rounded-md text-base font-medium text-white/90 hover:bg-white/5"
            >
              Pricing
            </Link>
            <Link
              href="/#contact"
              className="block px-3 py-3 rounded-md text-base font-medium text-white/90 hover:bg-white/5"
            >
              Contact
            </Link>

            <div className="border-t border-white/10 my-2 pt-2">
              <Link
                href="/auth/signin"
                className="block px-3 py-3 rounded-md text-base font-medium text-white/90 hover:bg-white/5"
              >
                Login
              </Link>
              <Link
                href="/auth/signup"
                className="block w-full text-center mt-4 bg-[#0099FC] text-white py-3 rounded-md font-bold"
              >
                Sign Up
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
