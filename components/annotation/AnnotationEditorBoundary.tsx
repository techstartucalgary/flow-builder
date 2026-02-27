'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface AnnotationEditorBoundaryProps {
  children: ReactNode;
  onDisableEditor: () => void;
}

interface AnnotationEditorBoundaryState {
  hasError: boolean;
}

export default class AnnotationEditorBoundary extends Component<
  AnnotationEditorBoundaryProps,
  AnnotationEditorBoundaryState
> {
  state: AnnotationEditorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): AnnotationEditorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[annotation-editor] render failure', error, info);
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="w-full h-full rounded-lg border border-red-400/30 bg-[#0a0f1a] p-6 flex items-center justify-center">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto h-11 w-11 rounded-full border border-red-400/30 bg-red-500/10 grid place-items-center">
            <AlertCircle className="text-red-300" size={20} />
          </div>
          <div className="space-y-2">
            <h2 className="text-white font-semibold text-lg">Editor failed to render</h2>
            <p className="text-sm text-gray-300">
              The floorplan editor hit a client-side rendering error. You can retry the editor
              or continue with the standard project view.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/15"
            >
              <RotateCcw size={14} />
              Retry editor
            </button>
            <button
              type="button"
              onClick={this.props.onDisableEditor}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200 hover:bg-white/10"
            >
              Open with Editor Off
            </button>
          </div>
        </div>
      </div>
    );
  }
}
