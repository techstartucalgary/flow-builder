'use client';

import type { EditorViewPreset, ToolMode } from '@/types/annotation';

interface EditorToolbarProps {
  toolMode: ToolMode;
  onToolChange: (mode: ToolMode) => void;
  viewPreset: EditorViewPreset;
  onViewPresetChange: (preset: EditorViewPreset) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onSave: () => void;
  onRefreshOpenings: () => void;
  showBaseImage: boolean;
  onToggleBaseImage: () => void;
  showTags: boolean;
  onToggleShowTags: () => void;
  gridEnabled: boolean;
  wallSnapEnabled: boolean;
  onToggleGrid: () => void;
  onToggleWallSnap: () => void;
}

const TOOLS: ToolMode[] = ['select', 'wall', 'door', 'window', 'room', 'delete'];
const PRESETS: Array<{ value: EditorViewPreset; label: string }> = [
  { value: 'final', label: 'Final' },
  { value: 'openings_qa', label: 'Openings QA' },
  { value: 'tags_qa', label: 'Tags QA' },
  { value: 'walls_qa', label: 'Walls QA' },
];

export default function EditorToolbar({
  toolMode,
  onToolChange,
  viewPreset,
  onViewPresetChange,
  onUndo,
  onRedo,
  onDelete,
  onSave,
  onRefreshOpenings,
  showBaseImage,
  onToggleBaseImage,
  showTags,
  onToggleShowTags,
  gridEnabled,
  wallSnapEnabled,
  onToggleGrid,
  onToggleWallSnap,
}: EditorToolbarProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0d1322] p-2 flex flex-wrap gap-2 items-center">
      <div className="inline-flex rounded-lg border border-white/10 bg-black/20 p-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => onViewPresetChange(preset.value)}
            className={`px-2.5 py-1 text-xs rounded transition ${
              viewPreset === preset.value
                ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-400/60'
                : 'text-gray-300 border border-transparent hover:text-white'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <span className="mx-1 h-5 w-px bg-white/10" />

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

      <button
        type="button"
        onClick={onRefreshOpenings}
        className="px-2 py-1 text-xs rounded border border-amber-400/50 text-amber-200 bg-amber-500/10 hover:bg-amber-500/20"
      >
        Refresh Openings
      </button>

      <button
        type="button"
        onClick={onToggleBaseImage}
        className={`px-2 py-1 text-xs rounded border ${
          showBaseImage ? 'border-cyan-400/60 text-cyan-200 bg-cyan-500/10' : 'border-white/10 text-gray-300'
        }`}
      >
        {showBaseImage ? 'Mode: Overlay' : 'Mode: Vector Only'}
      </button>

      <button
        type="button"
        onClick={onToggleShowTags}
        className={`px-2 py-1 text-xs rounded border ${
          showTags ? 'border-fuchsia-400/60 text-fuchsia-200 bg-fuchsia-500/10' : 'border-white/10 text-gray-300'
        }`}
      >
        {showTags ? 'Tags: On' : 'Tags: Off'}
      </button>
    </div>
  );
}
