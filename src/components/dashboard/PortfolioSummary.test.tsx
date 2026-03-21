import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PortfolioSummary from './PortfolioSummary';
import { type Asset } from '@/lib/mockData';

const mockAssets: Asset[] = [
  {
    ticker: 'PETR4', name: 'Petrobras PN', type: 'Ação',
    quantity: 100, avgPrice: 28, currentPrice: 35,
    change24h: 2.5, allocation: 50, sector: 'Petróleo',
  },
  {
    ticker: 'VALE3', name: 'Vale ON', type: 'Ação',
    quantity: 50, avgPrice: 60, currentPrice: 70,
    change24h: -1.2, allocation: 50, sector: 'Mineração',
  },
];

describe('PortfolioSummary', () => {
  it('renders total patrimony', () => {
    render(<PortfolioSummary assets={mockAssets} lastUpdate={new Date()} />);
    expect(screen.getByText('Patrimônio Total')).toBeInTheDocument();
  });

  it('displays all 4 stat cards', () => {
    render(<PortfolioSummary assets={mockAssets} lastUpdate={new Date()} />);
    expect(screen.getByText('Patrimônio Total')).toBeInTheDocument();
    expect(screen.getByText('Variação Hoje')).toBeInTheDocument();
    expect(screen.getByText('Lucro Total')).toBeInTheDocument();
    expect(screen.getByText('Última Atualização')).toBeInTheDocument();
  });

  it('shows formatted currency values', () => {
    render(<PortfolioSummary assets={mockAssets} lastUpdate={new Date()} />);
    // Total = 100*35 + 50*70 = 3500 + 3500 = 7000
    // Cost = 100*28 + 50*60 = 2800 + 3000 = 5800
    // Gain = 1200
    const container = document.body;
    expect(container.textContent).toContain('7.000');
    expect(container.textContent).toContain('1.200');
  });

  it('shows "--:--" when lastUpdate is null', () => {
    render(<PortfolioSummary assets={mockAssets} lastUpdate={null} />);
    expect(screen.getByText('--:--')).toBeInTheDocument();
  });

  it('shows time when lastUpdate is provided', () => {
    const date = new Date(2025, 0, 15, 14, 30, 45);
    render(<PortfolioSummary assets={mockAssets} lastUpdate={date} />);
    expect(screen.getByText('14:30:45')).toBeInTheDocument();
  });

  it('renders correctly with empty assets', () => {
    render(<PortfolioSummary assets={[]} lastUpdate={null} />);
    expect(screen.getByText('Patrimônio Total')).toBeInTheDocument();
  });

  it('shows countdown timer when nextUpdate is provided', () => {
    const next = new Date(Date.now() + 3 * 60 * 1000); // 3 min from now
    render(<PortfolioSummary assets={mockAssets} lastUpdate={new Date()} nextUpdate={next} />);
    expect(screen.getByText(/Próx:/)).toBeInTheDocument();
  });
});
