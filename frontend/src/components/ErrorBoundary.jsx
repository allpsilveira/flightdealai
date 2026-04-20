import { Component } from "react";

/**
 * Catches render errors in any subtree and shows a graceful fallback
 * instead of unmounting the whole app on a single bad component.
 *
 * Usage:
 *   <ErrorBoundary fallback={<MyFallback />}>
 *     <SomeComponent />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Best-effort: log to console for now; can wire to backend later
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="card p-6 m-6 border border-red-500/30 bg-red-500/5">
        <h2 className="text-base font-serif text-red-400 mb-2">Something broke here.</h2>
        <p className="text-xs text-zinc-400 mb-4 font-light">
          A component on this page failed to render. The rest of the app is still working.
        </p>
        <details className="text-xs text-zinc-500 mb-4">
          <summary className="cursor-pointer hover:text-zinc-300">Technical details</summary>
          <pre className="mt-2 p-3 rounded bg-zinc-900/60 overflow-auto text-[10px] font-mono">
            {String(this.state.error?.stack || this.state.error)}
          </pre>
        </details>
        <button onClick={this.reset} className="btn-ghost text-xs">
          Try again
        </button>
      </div>
    );
  }
}
