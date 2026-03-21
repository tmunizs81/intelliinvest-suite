import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AllocationChart from './AllocationChart';
import { type Asset } from '@/lib/mockData';

// Mock recharts to avoid canvas issues in jsdom
vi.mock('recharts', () => ({
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ children }: any) => <div data-testid="pie">{children}</div>,
  Cell: () => <div data-testid="cell" />,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  Tooltip: () => <div data-testid="tooltip" />,
}));

const mockAssets: Asset[] = [
  {
    ticker: 'PETR4', name: 'Petrobras PN', type: 'Ação',
    quantity: 100, avgPrice: 28, currentPrice: 35,
    change24h: 2.5, allocation: 40, sector: 'Petróleo',
  },
  {
    ticker: 'VALE3', name: 'Vale ON', type: 'Ação',
    quantity: 50, avgPrice: 60, currentPrice: 70,
    change24h: -1.2, allocation: 35, sector: 'Mineração',
  },
  {
    ticker: 'HGLG11', name: 'CSHG Log FII', type: 'FII',
    quantity: 200, avgPrice: 160, currentPrice: 170,
    change24h: 0.5, allocation: 25, sector: 'Logística',
  },
];

describe('AllocationChart', () => {
  it('renders heading', () => {
    render(<AllocationChart assets={mockAssets} />);
    expect(screen.getByText('Alocação por Setor')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    render(<AllocationChart assets={mockAssets} />);
    expect(screen.getByText('Distribuição da carteira')).toBeInTheDocument();
  });

  it('renders pie chart', () => {
    render(<AllocationChart assets={mockAssets} />);
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
  });

  it('renders cells for each sector', () => {
    render(<AllocationChart assets={mockAssets} />);
    const cells = screen.getAllByTestId('cell');
    // 3 sectors: Petróleo, Mineração, Logística
    expect(cells).toHaveLength(3);
  });

  it('groups assets with same sector', () => {
    const assetsWithSameSector: Asset[] = [
      { ...mockAssets[0], sector: 'Energia' },
      { ...mockAssets[1], sector: 'Energia' },
      { ...mockAssets[2], sector: 'Logística' },
    ];
    render(<AllocationChart assets={assetsWithSameSector} />);
    const cells = screen.getAllByTestId('cell');
    expect(cells).toHaveLength(2); // Energia + Logística
  });

  it('handles assets without sector as "Outros"', () => {
    const noSector: Asset[] = [
      { ...mockAssets[0], sector: undefined },
    ];
    render(<AllocationChart assets={noSector} />);
    expect(screen.getByText(/Outros/)).toBeInTheDocument();
  });

  it('renders with empty assets', () => {
    render(<AllocationChart assets={[]} />);
    expect(screen.getByText('Alocação por Setor')).toBeInTheDocument();
  });
});
