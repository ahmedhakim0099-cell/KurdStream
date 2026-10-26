import { Component, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught:', error);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div dir="rtl" className="min-h-screen bg-[#08080a] flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center">
            <div className="w-14 h-14 bg-red-500/20 text-red-400 rounded-xl flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-white mb-2">هەڵەیەک ڕوویدا</h2>
            <p className="text-sm text-white/60 mb-4">
              نەتوانرا ئەم بەشە باربکرێت. تکایە دووبارە هەوڵبدەوە.
            </p>
            {this.state.error && (
              <p className="text-xs text-white/30 mb-4 font-mono break-all" dir="ltr">
                {this.state.error.message}
              </p>
            )}
            <div className="flex gap-2 justify-center">
              <button
                onClick={this.reset}
                className="bg-cyan-600 hover:bg-cyan-500 px-6 py-2.5 rounded-xl font-bold text-white text-sm transition"
              >
                دووبارە هەوڵبدەوە
              </button>
              <button
                onClick={() => { window.history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); }}
                className="bg-white/10 hover:bg-white/20 px-6 py-2.5 rounded-xl font-bold text-white text-sm transition"
              >
                گەڕانەوە بۆ ماڵەوە
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
