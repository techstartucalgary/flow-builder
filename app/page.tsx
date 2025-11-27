import Link from 'next/link';
import Image from 'next/image';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0b1016] text-white flex flex-col">
      {/* Top nav */}
      <header className="bg-[#0b1016]">
        {/* FULL-WIDTH BAR */}
        <div className="flex w-full items-center justify-between px-10 py-4">
          {/* Logo (left in header) */}
          <div className="flex items-center gap-3">
            <Image
              src="/images/FlowBuildrLogo.png"
              alt="FlowBuildr logo"
              width={140}
              height={40}
              priority
            />
          </div>

          {/* Center nav links */}
          <nav className="flex flex-1 justify-center">
            <div className="flex items-center gap-10 text-sm tracking-wide">
              <Link href="/" className="hover:text-[#ffffffcc]">
                Home
              </Link>
              <Link href="#pricing" className="hover:text-[#ffffffcc]">
                Why Choose Us?
              </Link>
              <Link href="#pricing" className="hover:text-[#ffffffcc]">
                Pricing
              </Link>
              <Link href="#demos" className="hover:text-[#ffffffcc]">
                Demos
              </Link>
              <Link href="#demos" className="hover:text-[#ffffffcc]">
                About Us
              </Link>
              <Link href="#demos" className="hover:text-[#ffffffcc]">
                Contact
              </Link>
            </div>
          </nav>

          {/* Right auth button */}
          <div className="flex items-center">
            <Link
              href="/auth/signup"
              className="rounded-full border border-[#4fa2ff] bg-[#297fd7] px-5 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-[#2f8af0]"
            >
             Sign Up
            </Link>
          </div>
        </div>
      </header>

      {/* Hero: centered text + logo underneath */}
      <main className="flex-1 flex items-center justify-center bg-[#0b1016] px-4 py-16">
        <section className="flex flex-col items-center text-center max-w-3xl space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#297fd7]">
            AI INTEGRATED TAKEOFF FOR BUILDERS
          </p>

          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Analyzing House Costs with Ease
          </h1>

          

          {/* Logo under the text */}
          <div className="mt-6">
            <Image
              src="/images/FlowBuildrLogo.png"
              alt="FlowBuildr logo"
              width={950}
              height={300}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
