import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

export default class ErrorBoundary extends Component<
  { children: ReactNode }, { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info); }
  render() {
    if (this.state.failed) return <main role="alert">
      <h1>The page could not render.</h1>
      <p>Your saved canvas is on the server.</p>
      <button onClick={() => location.reload()}>Reload page</button>
    </main>;
    return this.props.children;
  }
}
