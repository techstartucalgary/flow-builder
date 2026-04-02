'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X } from 'lucide-react';

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '#about' },
  { label: 'Why Choose Us', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Contact', href: '#contact' },
] as const;

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[#030712]/90 backdrop-blur-xl border-b border-white/10 shadow-lg'
          : 'bg-transparent'
      }`}
    >
      <div className="w-full">
        <div className="flex h-24 items-center">
          {/* Logo */}
          <div className="flex-shrink-0 flex items-center ml-4 lg:ml-8">
            <Link href="/" aria-label="FlowBuildr Home">
              <Image
                src="/images/FlowBuildrCroppedLogo.png"
                alt="FlowBuildr"
                width={265}
                height={46}
                className="h-[2.75rem] lg:h-[2.85rem] w-auto max-w-none object-contain"
                priority
              />
            </Link>
          </div>

          {/* Desktop nav links */}
          <div className="hidden md:flex flex-1 items-center justify-center">
            <div className="flex items-center gap-x-9">
              {NAV_LINKS.map(({ label, href }) => (
                <a
                  key={href + label}
                  href={href}
                  className="text-white text-[15px] font-medium hover:underline decoration-white underline-offset-8"
                >
                  {label}
                </a>
              ))}
            </div>
          </div>

          {/* Desktop auth buttons */}
          <div className="hidden md:flex items-center ml-auto mr-5 gap-3">
            <Link
              href="/auth/signin"
              className="inline-flex rounded-full bg-gradient-to-r from-[#4DD0FF] to-[#118CD9] p-[1px]"
            >
              <span className="flex h-8 w-[100px] items-center justify-center rounded-full bg-[#0B1220] text-sm font-semibold text-white">
                Login
              </span>
            </Link>
            <Link
              href="/auth/signup"
              className="flex h-8 w-[100px] items-center justify-center rounded-full bg-[#0099FC] text-sm font-semibold text-white"
            >
              Sign Up
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden ml-auto mr-4 text-gray-300 hover:text-white"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-[#030712] border-b border-white/10">
          <div className="px-4 pt-2 pb-6 space-y-2">
            {NAV_LINKS.map(({ label, href }) => (
              <a
                key={href + label}
                href={href}
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-3 rounded-md text-base font-medium text-white/90 hover:bg-white/5"
              >
                {label}
              </a>
            ))}
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
