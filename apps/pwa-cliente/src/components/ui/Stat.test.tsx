// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MiniStat, HeroStat } from './Stat';

describe('Stat', () => {
  it('renders MiniStat without description', () => {
    render(<MiniStat icon="Check" color="red" soft="pink" k="Label" v="10" />);
    expect(screen.getByText('Label')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.queryByText('desc')).not.toBeInTheDocument();
  });

  it('renders MiniStat with description', () => {
    render(<MiniStat icon="Check" color="red" soft="pink" k="Label" v="10" d="desc" />);
    expect(screen.getByText('desc')).toBeInTheDocument();
  });

  it('renders HeroStat with all props including up arrow', () => {
    render(
      <HeroStat icon="Alert" color="blue" soft="cyan" k="HLabel" v="20" sub="sub text" delta="5%" up>
        <div data-testid="child" />
      </HeroStat>
    );
    expect(screen.getByText('HLabel')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('sub text')).toBeInTheDocument();
    expect(screen.getByText('5%')).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders HeroStat with down arrow and no sub/children', () => {
    render(<HeroStat icon="Alert" color="blue" soft="cyan" k="HLabel" v="20" delta="5%" up={false} />);
    expect(screen.getByText('5%')).toHaveClass('down');
  });
  
  it('renders HeroStat without delta', () => {
    render(<HeroStat icon="Alert" color="blue" soft="cyan" k="HLabel" v="20" />);
    expect(screen.queryByText('5%')).not.toBeInTheDocument();
  });
});
