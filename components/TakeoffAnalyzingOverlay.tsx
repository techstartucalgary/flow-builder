'use client';

interface TakeoffAnalyzingOverlayProps {
  isOpen: boolean;
  statusText: string;
}

export default function TakeoffAnalyzingOverlay({
  isOpen,
  statusText,
}: TakeoffAnalyzingOverlayProps) {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
      {/* Dim layer */}
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[1px]" />

      {/* Animated scanline */}
      <div className="absolute inset-x-0 h-full takeoff-scanline" />

      {/* Focus box: legend/schedule area (left side) */}
      <div
        className="absolute takeoff-focus-box rounded-md"
        style={{ top: '8%', left: '3%', width: '18%', height: '55%' }}
      />

      {/* Focus box: main plan area (center) */}
      <div
        className="absolute takeoff-focus-box rounded-md"
        style={{ top: '5%', left: '24%', width: '52%', height: '75%' }}
      />

      {/* Focus box: title block area (bottom-right) */}
      <div
        className="absolute takeoff-focus-box rounded-md"
        style={{ top: '65%', left: '78%', width: '19%', height: '30%' }}
      />

      {/* Status chip: bottom-left */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-600/90 backdrop-blur-sm shadow-lg shadow-indigo-500/30">
        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
        <span className="text-white text-xs font-medium">{statusText}</span>
      </div>
    </div>
  );
}
