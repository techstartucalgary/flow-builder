'use client';

import type { AnnotationDocument, AnnotationElementType } from '@/types/annotation';

interface LayerVisibilityPanelProps {
  document: AnnotationDocument;
  onToggle: (type: AnnotationElementType) => void;
}

const TYPES: AnnotationElementType[] = ['wall', 'door', 'window', 'room', 'label', 'dimension'];

export default function LayerVisibilityPanel({ document, onToggle }: LayerVisibilityPanelProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
      <div className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Layers</div>
      <div className="grid grid-cols-2 gap-2">
        {TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onToggle(type)}
            className={`px-2 py-1 rounded text-xs border transition ${
              document.layers[type]
                ? 'border-cyan-400/60 bg-cyan-500/10 text-cyan-200'
                : 'border-white/10 bg-white/[0.02] text-gray-400'
            }`}
          >
            {type}
          </button>
        ))}
      </div>
    </div>
  );
}
