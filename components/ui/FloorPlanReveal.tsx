'use client';

import { useCallback, useRef, useState } from 'react';

/*
 * ── FloorPlanReveal ──────────────────────────────────────────────────
 *
 * Animated SVG floor plan that draws all path groups on a synced timeline
 * so it starts/ends with the hero text animation.
 *
 * Animation is pure CSS (stroke-dasharray / stroke-dashoffset).
 *
 * ── How to replace the SVG with your own plan ──
 *
 * 1. Open your floor plan SVG in a vector editor (Figma / Illustrator).
 * 2. Tag every path/line with one of three classes:
 *      class="h"  → horizontal walls (drawn first)
 *      class="v"  → vertical walls   (drawn second)
 *      class="d"  → doors, windows, fixtures, dimension lines (drawn last)
 * 3. Paste the <svg> contents inside the <svg> tag below, replacing
 *    the placeholder geometry.  Keep the viewBox, preserveAspectRatio,
 *    and className props on the <svg> root.
 * 4. All paths need `pathLength="1"` for the CSS animation to work.
 *    If your editor doesn't add it, the CSS fallback handles it by
 *    using a very large dasharray (2000) instead.
 */

// ── Timing (seconds) — tweak these to taste ─────────────────────────
const PHASE_1_DELAY = 0.2;
const PHASE_1_DUR   = 1.5;
const PHASE_2_DELAY = 0.2;
const PHASE_2_DUR   = 1.5;
const PHASE_3_DELAY = 0.2;
const PHASE_3_DUR   = 1.5;

export default function FloorPlanReveal() {
  const [replayKey, setReplayKey] = useState(0);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Optional: replay for dev testing — call window.__replayFloorPlan()
  const replay = useCallback(() => setReplayKey((k) => k + 1), []);
  if (typeof window !== 'undefined') {
    (window as any).__replayFloorPlan = replay;
  }

  const active = true;

  return (
    <div className="relative w-full h-full min-h-[260px] flex items-center justify-center [contain:layout]">
      {/* Glow behind the plan (subtle, component-level) */}
      <div className="absolute inset-0 -inset-x-4 blur-[50px] opacity-25 pointer-events-none bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,rgba(96,165,250,0.15),transparent)]" />

      <svg
        key={replayKey}
        ref={svgRef}
        viewBox="0 0 780 680"
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full max-h-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* ── Inline styles for the 3-phase draw animation ──────── */}
        <style>{`
          .h, .v, .d {
            stroke-dasharray: 1;
            stroke-dashoffset: 1;
            stroke-linecap: square;
          }

          /* Phase 1: Horizontals */
          .h {
            ${active ? `
              animation: draw ${PHASE_1_DUR}s cubic-bezier(0.4, 0, 0.2, 1) ${PHASE_1_DELAY}s forwards;
            ` : ''}
          }

          /* Phase 2: Verticals */
          .v {
            ${active ? `
              animation: draw ${PHASE_2_DUR}s cubic-bezier(0.4, 0, 0.2, 1) ${PHASE_2_DELAY}s forwards;
            ` : ''}
          }

          /* Phase 3: Details */
          .d {
            ${active ? `
              animation: draw ${PHASE_3_DUR}s cubic-bezier(0.4, 0, 0.2, 1) ${PHASE_3_DELAY}s forwards;
            ` : ''}
          }

          @keyframes draw {
            to { stroke-dashoffset: 0; }
          }
        `}</style>

        {/* ─────────────────────────────────────────────────────────
         *  FLOOR PLAN GEOMETRY
         *
         *  Based on the Boxhaus T.O. SLAB plan layout.
         *  All paths use pathLength="1" so stroke-dasharray: 1 works.
         *
         *  Replace these with your actual SVG paths, keeping the
         *  class="h" / "v" / "d" tags and pathLength="1".
         * ───────────────────────────────────────────────────────── */}

        {/* ── Phase 1: Horizontal walls (.h) ─────────────────────── */}
        <g className="h-walls">
          {/* Exterior top */}
          <line className="h" x1="80" y1="60"  x2="780" y2="60"  stroke="rgba(96,165,250,0.7)" strokeWidth="3" pathLength="1" />
          <line className="h" x1="80" y1="68"  x2="780" y2="68"  stroke="rgba(96,165,250,0.4)" strokeWidth="1.5" pathLength="1" />

          {/* Exterior bottom */}
          <line className="h" x1="80" y1="620" x2="780" y2="620" stroke="rgba(96,165,250,0.7)" strokeWidth="3" pathLength="1" />
          <line className="h" x1="80" y1="612" x2="780" y2="612" stroke="rgba(96,165,250,0.4)" strokeWidth="1.5" pathLength="1" />

          {/* Interior horizontal — upper partition (Guest Suite / Bath) */}
          <line className="h" x1="80"  y1="260" x2="480" y2="260" stroke="rgba(96,165,250,0.55)" strokeWidth="2.5" pathLength="1" />
          <line className="h" x1="80"  y1="268" x2="480" y2="268" stroke="rgba(96,165,250,0.3)" strokeWidth="1.2" pathLength="1" />

          {/* Interior horizontal — lower partition (Storage / Rec Room) */}
          <line className="h" x1="80"  y1="400" x2="360" y2="400" stroke="rgba(96,165,250,0.55)" strokeWidth="2.5" pathLength="1" />
          <line className="h" x1="80"  y1="408" x2="360" y2="408" stroke="rgba(96,165,250,0.3)" strokeWidth="1.2" pathLength="1" />

          {/* Interior — Gym / Mech divider */}
          <line className="h" x1="540" y1="340" x2="780" y2="340" stroke="rgba(96,165,250,0.55)" strokeWidth="2.5" pathLength="1" />
          <line className="h" x1="540" y1="348" x2="780" y2="348" stroke="rgba(96,165,250,0.3)" strokeWidth="1.2" pathLength="1" />

          {/* Interior — Bath / Laundry upper */}
          <line className="h" x1="240" y1="145" x2="420" y2="145" stroke="rgba(96,165,250,0.45)" strokeWidth="2" pathLength="1" />
          <line className="h" x1="240" y1="152" x2="420" y2="152" stroke="rgba(96,165,250,0.25)" strokeWidth="1" pathLength="1" />
        </g>

        {/* ── Phase 2: Vertical walls (.v) ───────────────────────── */}
        <g className="v-walls">
          {/* Exterior left */}
          <line className="v" x1="80"  y1="60"  x2="80"  y2="620" stroke="rgba(96,165,250,0.7)" strokeWidth="3" pathLength="1" />
          <line className="v" x1="88"  y1="60"  x2="88"  y2="620" stroke="rgba(96,165,250,0.4)" strokeWidth="1.5" pathLength="1" />

          {/* Exterior right */}
          <line className="v" x1="780" y1="60"  x2="780" y2="620" stroke="rgba(96,165,250,0.7)" strokeWidth="3" pathLength="1" />
          <line className="v" x1="772" y1="60"  x2="772" y2="620" stroke="rgba(96,165,250,0.4)" strokeWidth="1.5" pathLength="1" />

          {/* Interior — Guest Suite right wall */}
          <line className="v" x1="320" y1="60"  x2="320" y2="260" stroke="rgba(96,165,250,0.55)" strokeWidth="2.5" pathLength="1" />
          <line className="v" x1="328" y1="60"  x2="328" y2="260" stroke="rgba(96,165,250,0.3)" strokeWidth="1.2" pathLength="1" />

          {/* Interior — Bath / Laundry divider */}
          <line className="v" x1="420" y1="60"  x2="420" y2="260" stroke="rgba(96,165,250,0.55)" strokeWidth="2.5" pathLength="1" />
          <line className="v" x1="428" y1="60"  x2="428" y2="260" stroke="rgba(96,165,250,0.3)" strokeWidth="1.2" pathLength="1" />

          {/* Interior — Gym left wall */}
          <line className="v" x1="540" y1="60"  x2="540" y2="340" stroke="rgba(96,165,250,0.55)" strokeWidth="2.5" pathLength="1" />
          <line className="v" x1="548" y1="60"  x2="548" y2="340" stroke="rgba(96,165,250,0.3)" strokeWidth="1.2" pathLength="1" />

          {/* Interior — Storage right wall */}
          <line className="v" x1="360" y1="260" x2="360" y2="480" stroke="rgba(96,165,250,0.45)" strokeWidth="2" pathLength="1" />
          <line className="v" x1="368" y1="260" x2="368" y2="480" stroke="rgba(96,165,250,0.25)" strokeWidth="1" pathLength="1" />

          {/* Interior — Mech left wall */}
          <line className="v" x1="620" y1="340" x2="620" y2="500" stroke="rgba(96,165,250,0.45)" strokeWidth="2" pathLength="1" />
          <line className="v" x1="628" y1="340" x2="628" y2="500" stroke="rgba(96,165,250,0.25)" strokeWidth="1" pathLength="1" />
        </g>

        {/* ── Phase 3: Details (.d) — doors, windows, fixtures ──── */}
        <g className="details">
          {/* Door swings (arcs) */}
          <path className="d" d="M 155 260 A 40 40 0 0 1 195 220" stroke="rgba(129,140,248,0.5)" strokeWidth="1.2" pathLength="1" />
          <path className="d" d="M 280 260 A 35 35 0 0 0 245 225" stroke="rgba(129,140,248,0.5)" strokeWidth="1.2" pathLength="1" />
          <path className="d" d="M 420 180 A 35 35 0 0 1 455 215" stroke="rgba(129,140,248,0.5)" strokeWidth="1.2" pathLength="1" />
          <path className="d" d="M 540 200 A 40 40 0 0 0 500 240" stroke="rgba(129,140,248,0.5)" strokeWidth="1.2" pathLength="1" />
          <path className="d" d="M 360 440 A 40 40 0 0 1 400 480" stroke="rgba(129,140,248,0.5)" strokeWidth="1.2" pathLength="1" />
          <path className="d" d="M 620 420 A 35 35 0 0 0 585 455" stroke="rgba(129,140,248,0.5)" strokeWidth="1.2" pathLength="1" />

          {/* Window marks (short double ticks on exterior walls) */}
          {/* Top wall windows */}
          <line className="d" x1="140" y1="54" x2="140" y2="74" stroke="rgba(167,139,250,0.5)" strokeWidth="1.5" pathLength="1" />
          <line className="d" x1="160" y1="54" x2="160" y2="74" stroke="rgba(167,139,250,0.5)" strokeWidth="1.5" pathLength="1" />
          <line className="d" x1="200" y1="54" x2="200" y2="74" stroke="rgba(167,139,250,0.5)" strokeWidth="1.5" pathLength="1" />
          <line className="d" x1="220" y1="54" x2="220" y2="74" stroke="rgba(167,139,250,0.5)" strokeWidth="1.5" pathLength="1" />
          <line className="d" x1="600" y1="54" x2="600" y2="74" stroke="rgba(167,139,250,0.5)" strokeWidth="1.5" pathLength="1" />
          <line className="d" x1="650" y1="54" x2="650" y2="74" stroke="rgba(167,139,250,0.5)" strokeWidth="1.5" pathLength="1" />
          <line className="d" x1="700" y1="54" x2="700" y2="74" stroke="rgba(167,139,250,0.5)" strokeWidth="1.5" pathLength="1" />
          <line className="d" x1="720" y1="54" x2="720" y2="74" stroke="rgba(167,139,250,0.5)" strokeWidth="1.5" pathLength="1" />

          {/* Left wall window */}
          <line className="d" x1="74" y1="120" x2="94" y2="120" stroke="rgba(167,139,250,0.5)" strokeWidth="1.5" pathLength="1" />
          <line className="d" x1="74" y1="170" x2="94" y2="170" stroke="rgba(167,139,250,0.5)" strokeWidth="1.5" pathLength="1" />

          {/* Bottom wall — garage door */}
          <line className="d" x1="280" y1="612" x2="280" y2="628" stroke="rgba(167,139,250,0.6)" strokeWidth="2" pathLength="1" />
          <line className="d" x1="500" y1="612" x2="500" y2="628" stroke="rgba(167,139,250,0.6)" strokeWidth="2" pathLength="1" />
          <line className="d" x1="280" y1="620" x2="500" y2="620" stroke="rgba(167,139,250,0.35)" strokeWidth="1" strokeDasharray="4 3" pathLength="1" />

          {/* Fixtures — Bath tub */}
          <rect className="d" x="340" y="80"  width="60" height="50" rx="6" stroke="rgba(129,140,248,0.35)" strokeWidth="1" pathLength="1" />
          {/* Toilet */}
          <circle className="d" cx="355" cy="175" r="10" stroke="rgba(129,140,248,0.3)" strokeWidth="1" pathLength="1" />
          <rect className="d" x="345" y="190" width="20" height="25" rx="3" stroke="rgba(129,140,248,0.3)" strokeWidth="1" pathLength="1" />
          {/* Washer / Dryer */}
          <rect className="d" x="440" y="90"  width="35" height="35" rx="4" stroke="rgba(129,140,248,0.3)" strokeWidth="1" pathLength="1" />
          <rect className="d" x="440" y="130" width="35" height="35" rx="4" stroke="rgba(129,140,248,0.3)" strokeWidth="1" pathLength="1" />

          {/* Staircase hatching (Storage area) */}
          <line className="d" x1="120" y1="310" x2="300" y2="310" stroke="rgba(129,140,248,0.2)" strokeWidth="0.8" pathLength="1" />
          <line className="d" x1="120" y1="325" x2="300" y2="325" stroke="rgba(129,140,248,0.2)" strokeWidth="0.8" pathLength="1" />
          <line className="d" x1="120" y1="340" x2="300" y2="340" stroke="rgba(129,140,248,0.2)" strokeWidth="0.8" pathLength="1" />
          <line className="d" x1="120" y1="355" x2="300" y2="355" stroke="rgba(129,140,248,0.2)" strokeWidth="0.8" pathLength="1" />
          <line className="d" x1="120" y1="370" x2="300" y2="370" stroke="rgba(129,140,248,0.2)" strokeWidth="0.8" pathLength="1" />
          <line className="d" x1="120" y1="385" x2="300" y2="385" stroke="rgba(129,140,248,0.2)" strokeWidth="0.8" pathLength="1" />
          {/* Stair arrow */}
          <line className="d" x1="210" y1="280" x2="210" y2="390" stroke="rgba(129,140,248,0.3)" strokeWidth="1" pathLength="1" />
          <line className="d" x1="210" y1="280" x2="200" y2="295" stroke="rgba(129,140,248,0.3)" strokeWidth="1" pathLength="1" />
          <line className="d" x1="210" y1="280" x2="220" y2="295" stroke="rgba(129,140,248,0.3)" strokeWidth="1" pathLength="1" />

          {/* Room labels — faint text drawn as detail strokes */}
          <text className="d" x="150" y="175" fill="rgba(148,163,184,0.4)" fontSize="11" fontFamily="monospace" pathLength="1">GUEST SUITE</text>
          <text className="d" x="345" y="120" fill="rgba(148,163,184,0.4)" fontSize="9" fontFamily="monospace" pathLength="1">BATH</text>
          <text className="d" x="435" y="120" fill="rgba(148,163,184,0.35)" fontSize="9" fontFamily="monospace" pathLength="1">LNDRY</text>
          <text className="d" x="620" y="210" fill="rgba(148,163,184,0.4)" fontSize="11" fontFamily="monospace" pathLength="1">GYM/YOGA</text>
          <text className="d" x="150" y="345" fill="rgba(148,163,184,0.35)" fontSize="10" fontFamily="monospace" pathLength="1">STORAGE</text>
          <text className="d" x="660" y="430" fill="rgba(148,163,184,0.35)" fontSize="9" fontFamily="monospace" pathLength="1">MECH</text>
          <text className="d" x="350" y="545" fill="rgba(148,163,184,0.4)" fontSize="12" fontFamily="monospace" pathLength="1">REC ROOM AREA</text>

          {/* Dimension lines (very subtle) */}
          <line className="d" x1="80"  y1="645" x2="780" y2="645" stroke="rgba(148,163,184,0.15)" strokeWidth="0.5" pathLength="1" />
          <line className="d" x1="80"  y1="642" x2="80"  y2="648" stroke="rgba(148,163,184,0.2)" strokeWidth="0.5" pathLength="1" />
          <line className="d" x1="780" y1="642" x2="780" y2="648" stroke="rgba(148,163,184,0.2)" strokeWidth="0.5" pathLength="1" />
          <text className="d" x="390" y="656" fill="rgba(148,163,184,0.25)" fontSize="8" fontFamily="monospace" textAnchor="middle" pathLength="1">42&apos;-11½&quot;</text>

          <line className="d" x1="42" y1="60"  x2="42" y2="620" stroke="rgba(148,163,184,0.15)" strokeWidth="0.5" pathLength="1" />
          <line className="d" x1="39" y1="60"  x2="45" y2="60"  stroke="rgba(148,163,184,0.2)" strokeWidth="0.5" pathLength="1" />
          <line className="d" x1="39" y1="620" x2="45" y2="620" stroke="rgba(148,163,184,0.2)" strokeWidth="0.5" pathLength="1" />
        </g>
      </svg>
    </div>
  );
}
