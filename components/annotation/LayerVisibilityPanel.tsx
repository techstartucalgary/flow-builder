'use client';

import type { AnnotationDocument, AnnotationElementType } from '@/types/annotation';

interface LayerVisibilityPanelProps {
  document: AnnotationDocument;
  onToggle: (type: AnnotationElementType) => void;
}

const TYPES: AnnotationElementType[] = ['wall', 'door', 'window', 'room'];

export default function LayerVisibilityPanel({ document, onToggle }: LayerVisibilityPanelProps) {
  return (
    <div className="ws-panel p-3 space-y-3">
      <div className="ws-section-header">Layers</div>
      <div className="grid grid-cols-2 gap-2">
        {TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onToggle(type)}
            className={`px-2.5 py-1.5 rounded-xl text-xs border transition ${
              document.layers[type]
                ? 'border-cyan-400/60 bg-cyan-500/12 text-cyan-100'
                : 'border-white/10 bg-white/[0.02] text-gray-400 hover:text-white'
            }`}
          >
            {type}
          </button>
        ))}
      </div>
    </div>
  );
}
