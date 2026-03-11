import { useEffect, useRef, memo } from 'react';

interface Props {
  ticker: string;
  type?: string;
}

function getTradingViewSymbol(ticker: string, type?: string): string {
  const mappings: Record<string, string> = {
    BTC: 'BINANCE:BTCBRL',
    ETH: 'BINANCE:ETHBRL',
  };
  if (mappings[ticker]) return mappings[ticker];
  if (/^[A-Z]{4}\d{1,2}$/.test(ticker)) return `BMFBOVESPA:${ticker}`;
  return ticker;
}

function TradingViewWidget({ ticker, type }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous widget
    containerRef.current.innerHTML = '';

    const symbol = getTradingViewSymbol(ticker, type);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: 'D',
      timezone: 'America/Sao_Paulo',
      theme: 'dark',
      style: '1',
      locale: 'br',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      gridColor: 'rgba(255, 255, 255, 0.06)',
      allow_symbol_change: true,
      calendar: false,
      support_host: 'https://www.tradingview.com',
      hide_side_toolbar: false,
      studies: [
        'RSI@tv-basicstudies',
        'MASimple@tv-basicstudies',
        'MACD@tv-basicstudies',
        'BB@tv-basicstudies',
      ],
    });

    containerRef.current.appendChild(script);
  }, [ticker, type]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden" style={{ height: 600 }}>
      <div className="tradingview-widget-container h-full" ref={containerRef}>
        <div className="tradingview-widget-container__widget h-full" />
      </div>
    </div>
  );
}

export default memo(TradingViewWidget);
