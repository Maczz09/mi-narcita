// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatKpi } from './StatKpi';

describe('StatKpi', () => {
  it('renders correctly with tint', () => {
    render(<StatKpi icon="Bell" tint="ok" label="Ok Label" value="42" />);
    expect(screen.getByText('Ok Label')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });
});
