import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HoldingsTable from './HoldingsTable';
import { type Asset } from '@/lib/mockData';
import type { HoldingRow } from '@/hooks/usePortfolio';

const mockAssets: Asset[] = [
  {
    ticker: 'PETR4', name: 'Petrobras PN', type: 'Ação',
    quantity: 100, avgPrice: 28, currentPrice: 35,
    change24h: 2.5, allocation: 60, sector: 'Petróleo',
  },
  {
    ticker: 'VALE3', name: 'Vale ON', type: 'Ação',
    quantity: 50, avgPrice: 60, currentPrice: 70,
    change24h: -1.2, allocation: 40, sector: 'Mineração',
  },
];

const mockHoldings: HoldingRow[] = [
  { id: '1', ticker: 'PETR4', name: 'Petrobras PN', type: 'Ação', quantity: 100, avg_price: 28, sector: 'Petróleo', broker: 'XP' },
  { id: '2', ticker: 'VALE3', name: 'Vale ON', type: 'Ação', quantity: 50, avg_price: 60, sector: 'Mineração', broker: 'XP' },
];

function renderTable(overrides = {}) {
  const props = {
    assets: mockAssets,
    holdings: mockHoldings,
    loading: false,
    onAdd: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  return {
    ...render(
      <MemoryRouter>
        <HoldingsTable {...props} />
      </MemoryRouter>
    ),
    props,
  };
}

describe('HoldingsTable', () => {
  it('renders table with asset count', () => {
    renderTable();
    expect(screen.getByText(/2 ativos/)).toBeInTheDocument();
  });

  it('renders Carteira de Ativos heading', () => {
    renderTable();
    expect(screen.getByText('Carteira de Ativos')).toBeInTheDocument();
  });

  it('displays ticker names', () => {
    renderTable();
    expect(screen.getByText('PETR4')).toBeInTheDocument();
    expect(screen.getByText('VALE3')).toBeInTheDocument();
  });

  it('shows loading indicator when loading', () => {
    renderTable({ loading: true });
    // The Loader2 spinner should be present
    const container = document.body;
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('calls onAdd when Adicionar button is clicked', () => {
    const { props } = renderTable();
    fireEvent.click(screen.getByText('Adicionar'));
    expect(props.onAdd).toHaveBeenCalledTimes(1);
  });

  it('shows Live indicator', () => {
    renderTable();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders with empty assets', () => {
    renderTable({ assets: [], holdings: [] });
    expect(screen.getByText(/0 ativos/)).toBeInTheDocument();
  });
});
