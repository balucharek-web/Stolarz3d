import React from 'react';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Nieoczekiwany błąd renderowania sceny 3D.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Stolarz 3D ErrorBoundary caught:', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetProjects = () => {
    try {
      localStorage.removeItem('stolarz3d_projects_v2');
      localStorage.removeItem('stolarz3d_project_v1');
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-[#F2F0EC] flex items-center justify-center p-4 text-[#1E1D1B]">
          <div className="max-w-md w-full bg-white rounded-2xl border border-black/10 shadow-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-bold">Wystąpił błąd aplikacji 3D</h1>
                <p className="text-xs text-[#6B6760]">
                  Scena WebGL lub dane projektu napotkały nieoczekiwany problem.
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-[#F5F3EF] border border-black/5 p-3 text-xs font-mono text-[#524E48] break-words">
              {this.state.errorMessage}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#C67C2E] text-white text-xs font-semibold hover:bg-[#AE6921] transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                Odśwież aplikację
              </button>
              <button
                type="button"
                onClick={this.handleResetProjects}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#F2F0EC] text-[#5C5750] text-xs font-semibold hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                Resetuj dane
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
