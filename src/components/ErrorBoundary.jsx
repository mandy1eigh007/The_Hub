import { Component } from 'preact';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  componentDidCatch(error) {
    console.error('App error:', error);
    this.setState({ error });
  }

  render() {
    if (this.state.error) {
      return (
        <div style="height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg)">
          <div style="text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px;max-width:380px;padding:24px">
            <div style="font-size:28px;opacity:.3">⚠</div>
            <div style="font-size:14px;font-weight:700;color:var(--t1)">Something went wrong</div>
            <div style="font-size:11px;color:var(--t3);font-family:'JetBrains Mono',monospace;background:var(--s2);border:1px solid var(--b1);border-radius:6px;padding:10px;width:100%;text-align:left;word-break:break-all">
              {String(this.state.error)}
            </div>
            <button
              class="btn btn-p btn-sm"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
