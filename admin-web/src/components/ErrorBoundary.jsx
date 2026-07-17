import { Component } from 'react';
import Icon from './Icon';

// Keeps a single page crash (or a transient auth redirect) from blanking the
// whole dashboard — the sidebar/shell stays and the user can recover.
export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { console.warn('[dashboard] recovered from render error:', err?.message); }
  componentDidUpdate(prev) { if (prev.routeKey !== this.props.routeKey && this.state.err) this.setState({ err: null }); }

  render() {
    if (this.state.err) {
      return (
        <div className="card card-pad" style={{ textAlign: 'center', padding: 56 }}>
          <div className="k-ico" style={{ margin: '0 auto 12px', width: 52, height: 52, background: 'rgba(239,68,68,.14)', color: 'var(--danger)' }}><Icon name="x" size={24} /></div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Something went wrong on this page</div>
          <div className="muted" style={{ fontSize: 14, marginTop: 6 }}>Try reloading — the rest of the dashboard is unaffected.</div>
          <button className="btn primary" style={{ marginTop: 16 }} onClick={() => this.setState({ err: null })}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}
