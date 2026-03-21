import { describe, it, expect } from 'vitest';
import { classifyAssetType } from '@/lib/assetClassification';

describe('classifyAssetType', () => {
  it('classifies Brazilian stocks (3-4 letters + number)', () => {
    expect(classifyAssetType('PETR4', 'Ação')).toBe('Ação');
    expect(classifyAssetType('VALE3', 'Ação')).toBe('Ação');
  });

  it('classifies FIIs (11 suffix)', () => {
    expect(classifyAssetType('HGLG11', 'FII')).toBe('FII');
    expect(classifyAssetType('XPLG11', 'FII')).toBe('FII');
  });

  it('classifies ETFs', () => {
    expect(classifyAssetType('BOVA11', 'ETF')).toBe('ETF');
    expect(classifyAssetType('IVVB11', 'ETF')).toBe('ETF');
  });

  it('preserves user-defined type as fallback', () => {
    expect(classifyAssetType('CUSTOM', 'BDR')).toBe('BDR');
    expect(classifyAssetType('UNKNOWN', 'Cripto')).toBe('Cripto');
  });

  it('classifies Renda Fixa', () => {
    expect(classifyAssetType('CDB-BANCO', 'Renda Fixa')).toBe('Renda Fixa');
  });

  it('classifies Imóvel', () => {
    expect(classifyAssetType('CASA-001', 'Imóvel')).toBe('Imóvel');
  });
});
