import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          padding: '40px', textAlign: 'center', color: 'var(--text-secondary)',
          background: 'var(--bg-raised)', borderRadius: 'var(--r-lg)',
          border: '1px solid var(--border-default)', margin: '20px',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚠️</div>
          <h3 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>Something went wrong</h3>
          <p style={{ fontSize: '13px', marginBottom: '16px', maxWidth: '500px', margin: '0 auto 16px' }}>
            {this.state.error?.message ?? 'An unexpected error occurred in this component.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '8px 20px', borderRadius: 'var(--r-md)', border: 'none',
              background: 'var(--brand-500)', color: '#fff', cursor: 'pointer',
              fontWeight: 600, fontSize: '13px',
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
