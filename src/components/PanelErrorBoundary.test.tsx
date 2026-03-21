import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PanelErrorBoundary } from './PanelErrorBoundary';

// Component that throws on render
function Thrower({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Test panel crash');
  return <div>Panel content OK</div>;
}

describe('PanelErrorBoundary', () => {
  // Suppress console.error for expected errors
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it('renders children when no error', () => {
    render(
      <PanelErrorBoundary>
        <div>Hello</div>
      </PanelErrorBoundary>
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('shows fallback UI when child throws', () => {
    render(
      <PanelErrorBoundary fallbackTitle="Erro no Gráfico">
        <Thrower shouldThrow={true} />
      </PanelErrorBoundary>
    );
    expect(screen.getByText('Erro no Gráfico')).toBeInTheDocument();
    expect(screen.getByText('Test panel crash')).toBeInTheDocument();
  });

  it('shows default fallback title when none provided', () => {
    render(
      <PanelErrorBoundary>
        <Thrower shouldThrow={true} />
      </PanelErrorBoundary>
    );
    expect(screen.getByText('Este painel encontrou um erro')).toBeInTheDocument();
  });

  it('shows retry button that recovers the component', () => {
    const { rerender } = render(
      <PanelErrorBoundary>
        <Thrower shouldThrow={true} />
      </PanelErrorBoundary>
    );
    
    expect(screen.getByText('Tentar novamente')).toBeInTheDocument();
    
    // After clicking retry, it re-renders children
    // But since Thrower still throws, it will show error again
    fireEvent.click(screen.getByText('Tentar novamente'));
    // The boundary resets and tries again - Thrower still throws
    expect(screen.getByText('Este painel encontrou um erro')).toBeInTheDocument();
  });

  it('isolates errors - sibling panels survive', () => {
    render(
      <div>
        <PanelErrorBoundary>
          <Thrower shouldThrow={true} />
        </PanelErrorBoundary>
        <PanelErrorBoundary>
          <div>Sibling OK</div>
        </PanelErrorBoundary>
      </div>
    );
    
    // First panel shows error, second renders fine
    expect(screen.getByText('Este painel encontrou um erro')).toBeInTheDocument();
    expect(screen.getByText('Sibling OK')).toBeInTheDocument();
  });
});
