'use client';

import type { ToolMode } from '@/types/annotation';

interface EditorToolbarProps {
  toolMode: ToolMode;
  onToolChange: (mode: ToolMode) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onSave: () => void;
  gridEnabled: boolean;
  wallSnapEnabled: boolean;
  onToggleGrid: () => void;
  onToggleWallSnap: () => void;
}

const TOOLS: ToolMode[] = ['select', 'wall', 'door', 'window', 'room', 'label', 'dimension', 'delete'];

export default function EditorToolbar({
  toolMode,
  onToolChange,
  onUndo,
  onRedo,
  onDelete,
  onSave,
  gridEnabled,
  wallSnapEnabled,
  onToggleGrid,
  onToggleWallSnap,
}: EditorToolbarProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0d1322] p-2 flex flex-wrap gap-2 items-center">
      {TOOLS.map((tool) => (
        <button
          key={tool}
          type="button"
          onClick={() => onToolChange(tool)}
          className={`px-2.5 py-1.5 rounded text-xs border transition ${
            toolMode === tool
              ? 'border-cyan-400/80 bg-cyan-500/10 text-cyan-200'
              : 'border-white/10 bg-white/[0.02] text-gray-300 hover:text-white'
          }`}
        >
          {tool}
        </button>
      ))}

      <span className="mx-1 h-5 w-px bg-white/10" />

      <button type="button" onClick={onUndo} className="px-2 py-1 text-xs rounded border border-white/10 text-gray-300 hover:text-white">
        Undo
      </button>
      <button type="button" onClick={onRedo} className="px-2 py-1 text-xs rounded border border-white/10 text-gray-300 hover:text-white">
        Redo
      </button>
      <button type="button" onClick={onDelete} className="px-2 py-1 text-xs rounded border border-red-400/30 text-red-200 hover:bg-red-500/10">
        Delete
      </button>

      <span className="mx-1 h-5 w-px bg-white/10" />

      <button
        type="button"
        onClick={onToggleGrid}
        className={`px-2 py-1 text-xs rounded border ${gridEnabled ? 'border-emerald-400/40 text-emerald-200' : 'border-white/10 text-gray-300'}`}
      >
        Grid
      </button>
      <button
        type="button"
        onClick={onToggleWallSnap}
        className={`px-2 py-1 text-xs rounded border ${wallSnapEnabled ? 'border-emerald-400/40 text-emerald-200' : 'border-white/10 text-gray-300'}`}
      >
        Wall Snap
      </button>

      <span className="mx-1 h-5 w-px bg-white/10" />

      <button
        type="button"
        onClick={onSave}
        className="px-3 py-1.5 text-xs rounded border border-indigo-400/50 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20"
      >
        Save
      </button>
    </div>
  );
}
