import { Component } from 'preact';
import type { ComponentChildren } from 'preact';

interface Props {
  children: ComponentChildren;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  componentDidCatch() {
    this.setState({ hasError: true });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '24px 16px', textAlign: 'center', color: '#a1a1aa' }}>
          <div style={{ marginBottom: '12px' }}>Something went wrong</div>
          <button
            class="btn btn-secondary"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
