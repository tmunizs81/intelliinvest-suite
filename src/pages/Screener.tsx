import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, TrendingUp } from 'lucide-react';
import { useScreener, ScreenerFilter } from '@/hooks/useScreener';

export default function Screener() {
  const [type, setType] = useState<'stock' | 'fii'>('stock');
  const [filter, setFilter] = useState<ScreenerFilter>({ type: 'stock' });
  const { results, loading, error, run } = useScreener();

  const updateFilter = (patch: Partial<ScreenerFilter>) => setFilter((f) => ({ ...f, ...patch }));

  const handleRun = () => run({ ...filter, type, limit: 30 });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <TrendingUp className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Screener de Ativos</h1>
          <p className="text-sm text-muted-foreground">Descubra ações e FIIs por fundamentos</p>
        </div>
      </div>

      <Card className="p-4 space-y-4">
        <Tabs value={type} onValueChange={(v) => { setType(v as 'stock' | 'fii'); setFilter({ type: v as any }); }}>
          <TabsList>
            <TabsTrigger value="stock">Ações</TabsTrigger>
            <TabsTrigger value="fii">FIIs</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label>DY mín (%)</Label>
            <Input type="number" step="0.5" placeholder={type === 'fii' ? '8' : '4'}
              onChange={(e) => updateFilter({ minDY: e.target.value ? +e.target.value : undefined })} />
          </div>
          {type === 'stock' && (
            <>
              <div>
                <Label>P/L máx</Label>
                <Input type="number" step="0.5" placeholder="15"
                  onChange={(e) => updateFilter({ maxPL: e.target.value ? +e.target.value : undefined })} />
              </div>
              <div>
                <Label>ROE mín (%)</Label>
                <Input type="number" step="1" placeholder="15"
                  onChange={(e) => updateFilter({ minROE: e.target.value ? +e.target.value : undefined })} />
              </div>
            </>
          )}
          <div>
            <Label>P/VP máx</Label>
            <Input type="number" step="0.05" placeholder={type === 'fii' ? '1.05' : '2'}
              onChange={(e) => updateFilter({ maxPVP: e.target.value ? +e.target.value : undefined })} />
          </div>
          <div>
            <Label>Market Cap mín (B)</Label>
            <Input type="number" step="0.5" placeholder="1"
              onChange={(e) => updateFilter({ minMarketCap: e.target.value ? +e.target.value : undefined })} />
          </div>
          <div className="md:col-span-1 col-span-2">
            <Label>Setor</Label>
            <Input placeholder="Ex: Financeiro"
              onChange={(e) => updateFilter({ sector: e.target.value || undefined })} />
          </div>
        </div>

        <Button onClick={handleRun} disabled={loading} className="w-full md:w-auto">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
          Buscar oportunidades
        </Button>
      </Card>

      {error && (
        <Card className="p-4 border-destructive">
          <p className="text-sm text-destructive">Erro: {error}</p>
        </Card>
      )}

      {results.length > 0 && (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">DY%</TableHead>
                {type === 'stock' && <TableHead className="text-right">P/L</TableHead>}
                <TableHead className="text-right">P/VP</TableHead>
                {type === 'stock' && <TableHead className="text-right">ROE%</TableHead>}
                <TableHead className="text-right">Cap (B)</TableHead>
                <TableHead>Setor</TableHead>
                <TableHead className="text-right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((r) => (
                <TableRow key={r.ticker}>
                  <TableCell className="font-semibold">{r.ticker}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs">{r.name}</TableCell>
                  <TableCell className="text-right">R$ {r.price.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{r.dy.toFixed(2)}</TableCell>
                  {type === 'stock' && <TableCell className="text-right">{r.pl > 0 ? r.pl.toFixed(1) : '-'}</TableCell>}
                  <TableCell className="text-right">{r.pvp > 0 ? r.pvp.toFixed(2) : '-'}</TableCell>
                  {type === 'stock' && <TableCell className="text-right">{r.roe.toFixed(1)}</TableCell>}
                  <TableCell className="text-right">{r.marketCap.toFixed(1)}</TableCell>
                  <TableCell className="text-xs">{r.sector}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={r.score >= 70 ? 'default' : r.score >= 50 ? 'secondary' : 'outline'}>
                      {r.score}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
