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
  onRefreshRooms: () => void;
  showBaseImage: boolean;
  onToggleBaseImage: () => void;
  showTags: boolean;
  onToggleShowTags: () => void;
  gridEnabled: boolean;
  wallSnapEnabled: boolean;
  onToggleGrid: () => void;
  onToggleWallSnap: () => void;
}

const PRIMARY_TOOLS: Array<{ value: ToolMode; label: string }> = [
  { value: 'select', label: 'Select' },
  { value: 'wall', label: 'Wall' },
  { value: 'door', label: 'Door' },
  { value: 'window', label: 'Window' },
  { value: 'room', label: 'Room' },
  { value: 'calibrate', label: 'Scale' },
];

const PRESETS: Array<{ value: EditorViewPreset; label: string }> = [
  { value: 'final', label: 'All' },
  { value: 'walls_qa', label: 'Walls' },
  { value: 'openings_qa', label: 'Openings' },
  { value: 'tags_qa', label: 'Tags' },
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
  onRefreshRooms,
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
    <div className="ws-panel-flat flex flex-wrap items-center gap-3 px-3 py-3">
      <div className="inline-flex flex-wrap rounded-2xl border border-white/10 bg-black/20 p-1">
        {PRIMARY_TOOLS.map((tool) => (
          <button
            key={tool.value}
            type="button"
            onClick={() => onToolChange(tool.value)}
            aria-pressed={toolMode === tool.value}
            className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${
              toolMode === tool.value
                ? 'border-cyan-400/80 bg-cyan-500/10 text-cyan-200'
                : 'border-transparent text-gray-300 hover:text-white'
            }`}
          >
            {tool.label}
          </button>
        ))}
      </div>

      <div className="inline-flex rounded-2xl border border-white/10 bg-black/20 p-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => onViewPresetChange(preset.value)}
            aria-pressed={viewPreset === preset.value}
            className={`rounded-lg px-2.5 py-1.5 text-xs transition ${
              viewPreset === preset.value
                ? 'border border-cyan-400/60 bg-cyan-500/15 text-cyan-200'
                : 'border border-transparent text-gray-300 hover:text-white'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="inline-flex flex-wrap rounded-2xl border border-white/10 bg-white/[0.02] p-1">
        <button
          type="button"
          onClick={onToggleBaseImage}
          aria-pressed={showBaseImage}
          className={`rounded-lg px-2 py-1.5 text-xs ${showBaseImage ? 'border border-cyan-400/60 bg-cyan-500/10 text-cyan-200' : 'text-gray-300'}`}
        >
          {showBaseImage ? 'Overlay' : 'Vector'}
        </button>
        <button
          type="button"
          onClick={onToggleShowTags}
          aria-pressed={showTags}
          className={`rounded-lg px-2 py-1.5 text-xs ${showTags ? 'border border-fuchsia-400/60 bg-fuchsia-500/10 text-fuchsia-200' : 'text-gray-300'}`}
        >
          Tags
        </button>
        <button
          type="button"
          onClick={onToggleGrid}
          aria-pressed={gridEnabled}
          className={`rounded-lg px-2 py-1.5 text-xs ${gridEnabled ? 'border border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'text-gray-300'}`}
        >
          Grid
        </button>
        <button
          type="button"
          onClick={onToggleWallSnap}
          aria-pressed={wallSnapEnabled}
          className={`rounded-lg px-2 py-1.5 text-xs ${wallSnapEnabled ? 'border border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'text-gray-300'}`}
        >
          Snap
        </button>
      </div>

      <div className="ml-auto inline-flex flex-wrap rounded-2xl border border-white/10 bg-white/[0.02] p-1">
        <button type="button" onClick={onUndo} className="rounded-lg px-2 py-1.5 text-xs text-gray-300 hover:text-white">
          Undo
        </button>
        <button type="button" onClick={onRedo} className="rounded-lg px-2 py-1.5 text-xs text-gray-300 hover:text-white">
          Redo
        </button>
        <button type="button" onClick={onDelete} className="rounded-lg px-2 py-1.5 text-xs text-rose-200 hover:bg-rose-500/10">
          Delete
        </button>
        <button
          type="button"
          onClick={onSave}
          className="rounded-lg border border-indigo-400/50 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-200 hover:bg-indigo-500/20"
        >
          Save
        </button>
      </div>

      <details className="rounded-2xl border border-white/10 bg-white/[0.02] px-2 py-1.5">
        <summary className="cursor-pointer list-none text-xs text-[var(--ws-text-secondary)]">
          Repair
        </summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRefreshOpenings}
            className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200 hover:bg-amber-500/20"
          >
            Refresh openings
          </button>
          <button
            type="button"
            onClick={onRefreshRooms}
            className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20"
          >
            Refresh rooms
          </button>
        </div>
      </details>
    </div>
  );
}
