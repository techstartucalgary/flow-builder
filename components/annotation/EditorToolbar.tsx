'use client';

import { BrickWall, DoorOpen, FileImage, Grid3x3, MousePointer2, Percent, Square, SquareDashed, Waypoints } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { ToolMode } from '@/types/annotation';

interface EditorToolbarProps {
  toolMode: ToolMode;
  onToolChange: (mode: ToolMode) => void;
  scaleSet: boolean;
  showBaseImage: boolean;
  onShowBaseImageChange: (show: boolean) => void;
}

const PRIMARY_TOOLS: Array<{
  value: ToolMode;
  label: string;
  icon: LucideIcon;
}> = [
  { value: 'select', label: 'Select', icon: MousePointer2 },
  { value: 'wall', label: 'Wall', icon: BrickWall },
  { value: 'door', label: 'Door', icon: DoorOpen },
  { value: 'window', label: 'Window', icon: Grid3x3 },
  { value: 'room', label: 'Room', icon: Square },
  { value: 'calibrate', label: 'Scale', icon: Percent },
];

export default function EditorToolbar({
  toolMode,
  onToolChange,
  scaleSet,
  showBaseImage,
  onShowBaseImageChange,
}: EditorToolbarProps) {
  return (
    <div className="annotation-tool-palette">
      <div className="annotation-tool-group">
        {PRIMARY_TOOLS.map((tool) => {
          const Icon = tool.icon;
          const active = toolMode === tool.value;
          return (
            <button
              key={tool.value}
              type="button"
              onClick={() => onToolChange(tool.value)}
              aria-pressed={active}
              className="annotation-tool-button"
              data-active={active ? 'true' : undefined}
            >
              <Icon size={20} />
              <span>{tool.label}</span>
            </button>
          );
        })}
      </div>

      <div className="annotation-tool-divider" />

      <span className="annotation-scale-pill" data-ready={scaleSet ? 'true' : 'false'}>
        <SquareDashed size={14} />
        {scaleSet ? 'Scale Set' : 'Set Scale'}
      </span>

      <div className="annotation-tool-divider" />

      <div className="annotation-view-toggle" aria-label="Canvas view">
        <button
          type="button"
          onClick={() => onShowBaseImageChange(true)}
          aria-pressed={showBaseImage}
          data-active={showBaseImage ? 'true' : undefined}
        >
          <FileImage size={15} />
          <span>Plan</span>
        </button>
        <button
          type="button"
          onClick={() => onShowBaseImageChange(false)}
          aria-pressed={!showBaseImage}
          data-active={!showBaseImage ? 'true' : undefined}
        >
          <Waypoints size={15} />
          <span>Vector</span>
        </button>
      </div>
    </div>
  );
}
