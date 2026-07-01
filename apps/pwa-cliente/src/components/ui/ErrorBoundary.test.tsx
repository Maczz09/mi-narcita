// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(<ErrorBoundary moduleName="Test"><div data-testid="child" /></ErrorBoundary>);
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders error UI when child throws', () => {
    const originalConsoleError = console.error;
    console.error = vi.fn();

    const Thrower = () => { throw new Error('test error'); };

    render(
      <ErrorBoundary moduleName="Test Module">
        <Thrower />
      </ErrorBoundary>
    );

    expect(screen.getByText('Test Module')).toBeInTheDocument();
    expect(screen.getByText('Este módulo encontró un error inesperado.')).toBeInTheDocument();

    console.error = originalConsoleError;
  });

  it('resets error state when clicking retry', () => {
    const originalConsoleError = console.error;
    console.error = vi.fn();

    let shouldThrow = true;
    const Thrower = () => {
      if (shouldThrow) throw new Error('test error');
      return <div data-testid="child" />;
    };

    render(
      <ErrorBoundary moduleName="Test Module">
        <Thrower />
      </ErrorBoundary>
    );

    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
    
    shouldThrow = false;
    fireEvent.click(screen.getByText('Reintentar'));

    expect(screen.getByTestId('child')).toBeInTheDocument();

    console.error = originalConsoleError;
  });
});
