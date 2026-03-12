

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface QuoteResult {
  ticker: string;
  currentPrice: number;
  change24h: number;
  previousClose: number;
  name: string;
  source: string;
  currency: string;
  currentPriceBRL: number;
  exchangeRate: number;
  error?: string;
}

// ─── Exchange rates cache ───
const rateCache: Record<string, number> = {};

async function getExchangeRate(from: string): Promise<number> {
  if (from === "BRL") return 1;
  const key = `${from}BRL`;
  if (rateCache[key]) return rateCache[key];

  const pairs: Record<string, string> = {
    USD: "USDBRL=X", EUR: "EURBRL=X", GBP: "GBPBRL=X",
    CHF: "CHFBRL=X", JPY: "JPYBRL=X", CAD: "CADBRL=X",
    AUD: "AUDBRL=X", GBp: "GBPBRL=X",
  };

  const yahooSymbol = pairs[from] || `${from}BRL=X`;

  try {
    const resp = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1d`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (resp.ok) {
      const data = await resp.json();
      const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price) {
        let rate = price;
        if (from === "GBp") rate = price / 100;
        rateCache[key] = rate;
        return rate;
      }
    }
  } catch (err) {
    console.warn(`Exchange rate fetch failed for ${from}:`, err);
  }

  if (from === "USD") {
    try {
      const resp = await fetch("https://brapi.dev/api/v2/currency?search=USD-BRL", {
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const data = await resp.json();
        const rate = data.currency?.[0]?.bidPrice;
        if (rate) {
          rateCache[key] = parseFloat(rate);
          return rateCache[key];
        }
      }
    } catch { /* fallback */ }
  }

  const fallbacks: Record<string, number> = {
    USD: 5.5, EUR: 6.0, GBP: 7.0, GBp: 0.07, CHF: 6.2, JPY: 0.037, CAD: 4.1, AUD: 3.6,
  };
  rateCache[key] = fallbacks[from] || 5.5;
  return rateCache[key];
}

// ─── Currency pair fetch (for CurrencyDashboard) ───
async function fetchCurrencyRate(ticker: string): Promise<QuoteResult> {
  // ticker is like USDBRL, EURBRL, GBPBRL
  const yahooSymbol = `${ticker}=X`;
  
  // Try Yahoo Finance first
  try {
    const resp = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=2d`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (resp.ok) {
      const data = await resp.json();
      const meta = data.chart?.result?.[0]?.meta;
      if (meta && meta.regularMarketPrice) {
        const rate = meta.regularMarketPrice;
        const prevClose = meta.chartPreviousClose || meta.previousClose || rate;
        const change = prevClose > 0 ? ((rate - prevClose) / prevClose) * 100 : 0;
        return {
          ticker, currentPrice: rate, change24h: Math.round(change * 100) / 100,
          previousClose: prevClose, name: ticker, source: "yahoo",
          currency: "BRL", currentPriceBRL: rate, exchangeRate: 1,
        };
      }
    }
  } catch (err) {
    console.warn(`Yahoo currency failed for ${ticker}:`, err);
  }

  // Try AwesomeAPI as fallback
  try {
    const from = ticker.substring(0, 3);
    const to = ticker.substring(3);
    const resp = await fetch(
      `https://economia.awesomeapi.com.br/json/last/${from}-${to}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (resp.ok) {
      const data = await resp.json();
      const key = `${from}${to}`;
      const quote = data[key];
      if (quote) {
        const bid = parseFloat(quote.bid);
        const pctChange = parseFloat(quote.pctChange || "0");
        const prevClose = bid / (1 + pctChange / 100);
        return {
          ticker, currentPrice: bid, change24h: Math.round(pctChange * 100) / 100,
          previousClose: Math.round(prevClose * 10000) / 10000, name: quote.name || ticker,
          source: "awesomeapi", currency: "BRL", currentPriceBRL: bid, exchangeRate: 1,
        };
      }
    }
  } catch (err) {
    console.warn(`AwesomeAPI failed for ${ticker}:`, err);
  }

  return {
    ticker, currentPrice: 0, change24h: 0, previousClose: 0, name: ticker,
    source: "none", currency: "BRL", currentPriceBRL: 0, exchangeRate: 1,
    error: "All sources failed",
  };
}

// ─── CoinGecko fetch for crypto (including stablecoins) ───
const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", ADA: "cardano",
  DOT: "polkadot", XRP: "ripple", BNB: "binancecoin", DOGE: "dogecoin",
  LTC: "litecoin", AVAX: "avalanche-2", MATIC: "matic-network",
  LINK: "chainlink", UNI: "uniswap", USDT: "tether", USDC: "usd-coin",
  SHIB: "shiba-inu", AAVE: "aave", ALGO: "algorand", ATOM: "cosmos",
};

async function fetchCoinGeckoQuotes(tickers: string[]): Promise<Record<string, QuoteResult>> {
  const results: Record<string, QuoteResult> = {};
  const ids = tickers.map(t => COINGECKO_IDS[t]).filter(Boolean);
  
  if (ids.length === 0) return results;

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd,brl&include_24hr_change=true`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    
    if (resp.ok) {
      const data = await resp.json();
      for (const ticker of tickers) {
        const id = COINGECKO_IDS[ticker];
        if (id && data[id]) {
          const coin = data[id];
          const priceUSD = coin.usd ?? 0;
          const priceBRL = coin.brl ?? 0;
          const change24h = coin.usd_24h_change ?? 0;
          const previousClose = priceUSD / (1 + change24h / 100);
          
          results[ticker] = {
            ticker,
            currentPrice: priceUSD,
            change24h: Math.round(change24h * 100) / 100,
            previousClose: Math.round(previousClose * 100) / 100,
            name: id.charAt(0).toUpperCase() + id.slice(1),
            source: "coingecko",
            currency: "USD",
            currentPriceBRL: priceBRL,
            exchangeRate: priceUSD > 0 ? priceBRL / priceUSD : 1,
          };
        }
      }
    }
  } catch (err) {
    console.warn("CoinGecko fetch failed:", err);
  }

  return results;
}

// ─── Source 1: Brapi (Brazilian API - best for B3 + Crypto) ───
async function fetchBrapiQuote(ticker: string): Promise<QuoteResult | null> {
  try {
    const isCrypto = Object.keys(COINGECKO_IDS).includes(ticker);

    if (isCrypto) {
      const url = `https://brapi.dev/api/v2/crypto?coin=${ticker}&currency=BRL`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      const coin = data.coins?.[0];
      if (!coin) return null;

      const currentPrice = coin.regularMarketPrice ?? 0;
      const change24h = coin.regularMarketChangePercent ?? 0;
      const previousClose = currentPrice / (1 + change24h / 100);

      return {
        ticker, currentPrice, change24h: Math.round(change24h * 100) / 100,
        previousClose: Math.round(previousClose * 100) / 100,
        name: coin.coinName || coin.coin || ticker, source: "brapi",
        currency: "BRL", currentPriceBRL: currentPrice, exchangeRate: 1,
      };
    }

    const url = `https://brapi.dev/api/quote/${ticker}?fundamental=false`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const result = data.results?.[0];
    if (!result) return null;

    return {
      ticker,
      currentPrice: result.regularMarketPrice ?? 0,
      change24h: Math.round((result.regularMarketChangePercent ?? 0) * 100) / 100,
      previousClose: result.regularMarketPreviousClose ?? result.previousClose ?? 0,
      name: result.shortName || result.longName || result.symbol || ticker,
      source: "brapi", currency: "BRL",
      currentPriceBRL: result.regularMarketPrice ?? 0, exchangeRate: 1,
    };
  } catch (err) {
    console.warn(`Brapi failed for ${ticker}:`, err);
    return null;
  }
}

// ─── International ETF ticker mappings ───
const INTERNATIONAL_ETFS: Record<string, string> = {
  // === London Stock Exchange (.L) - UK ETFs ===
  // iShares Core
  CSPX: "CSPX.L", IWDA: "IWDA.L", EIMI: "EIMI.L", SWDA: "SWDA.L",
  ISAC: "ISAC.L", IEMA: "IEMA.L", EMIM: "EMIM.L", IUIT: "IUIT.L",
  IUAA: "IUAA.L", IDTL: "IDTL.L", IGLN: "IGLN.L", IBTM: "IBTM.L",
  LQDE: "LQDE.L", IWRD: "IWRD.L", IUKD: "IUKD.L", ISF: "ISF.L",
  IJPN: "IJPN.L", IAPD: "IAPD.L", IBTS: "IBTS.L", INRG: "INRG.L",
  ISPY: "ISPY.L", ISWD: "ISWD.L",
  // iShares Sector & Thematic UK
  IITU: "IITU.L", IHCU: "IHCU.L", IUFS: "IUFS.L", IUES: "IUES.L",
  IUCD: "IUCD.L", IUCS: "IUCS.L", ICUS: "ICUS.L", IUVL: "IUVL.L",
  IUSG: "IUSG.L", IUMO: "IUMO.L", IUSM: "IUSM.L", IUDM: "IUDM.L",
  IUSU: "IUSU.L", IQQW: "IQQW.L", IQQQ: "IQQQ.L", IQQP: "IQQP.L",
  HEAL: "HEAL.L", RBOT: "RBOT.L", DGTL: "DGTL.L", ECAR: "ECAR.L",
  IEFM: "IEFM.L", IESG: "IESG.L", IESE: "IESE.L", IESM: "IESM.L",
  // iShares Bond UK
  IGLT: "IGLT.L", INXG: "INXG.L", SLXX: "SLXX.L", IEAA: "IEAA.L",
  IEAC: "IEAC.L", IEGA: "IEGA.L", IEGZ: "IEGZ.L", IBGE: "IBGE.L",
  IHYG: "IHYG.L", SHYG: "SHYG.L", ITPS: "ITPS.L", IBTL: "IBTL.L",
  IBGM: "IBGM.L", IBGS: "IBGS.L", IDTM: "IDTM.L", IDTS: "IDTS.L",
  IUAG: "IUAG.L", SUAG: "SUAG.L", IUSP: "IUSP.L",
  // iShares Regional UK
  IUKP: "IUKP.L", IUKS: "IUKS.L", MIDD: "MIDD.L", IDJG: "IDJG.L",
  IJPH: "IJPH.L", SJPA: "SJPA.L", IEER: "IEER.L", IAPX: "IAPX.L",
  IDVY: "IDVY.L", EUNY: "EUNY.L", IEMB: "IEMB.L", CEMB: "CEMB.L",
  IEMS: "IEMS.L", IEUX: "IEUX.L", IMEU: "IMEU.L", MEUD: "MEUD.L",
  // Vanguard UK
  VWRA: "VWRA.L", VWRL: "VWRL.L", VUAA: "VUAA.L", VUSA: "VUSA.L",
  VAGF: "VAGF.L", VERX: "VERX.L", VJPN: "VJPN.L", VAPX: "VAPX.L",
  VFEM: "VFEM.L", VMID: "VMID.L", VUKE: "VUKE.L", VEVE: "VEVE.L",
  VHYL: "VHYL.L", VNRT: "VNRT.L",
  VDNR: "VDNR.L", VDEM: "VDEM.L", VDPX: "VDPX.L", VDJP: "VDJP.L",
  VDEU: "VDEU.L", VFEG: "VFEG.L", VUAG: "VUAG.L", VERG: "VERG.L",
  VGOV: "VGOV.L", VGEM: "VGEM.L", VAGU: "VAGU.L", VAGP: "VAGP.L",
  VDTY: "VDTY.L", VUTY: "VUTY.L", VUCP: "VUCP.L", VUCE: "VUCE.L",
  VETY: "VETY.L", VECP: "VECP.L",
  // SPDR UK
  SPY5: "SPY5.L", SPMV: "SPMV.L", SPYV: "SPYV.L", SPYD: "SPYD.L",
  SPYG: "SPYG.L", SPPW: "SPPW.L", SPXS: "SPXS.L", SPPE: "SPPE.L",
  SYBQ: "SYBQ.L", SYBS: "SYBS.L", SYBJ: "SYBJ.L", SYBM: "SYBM.L",
  GLCO: "GLCO.L", GLAG: "GLAG.L", SYBW: "SYBW.L", SYBF: "SYBF.L",
  // Invesco UK
  EQQQ: "EQQQ.L", SMCX: "SMCX.L", SMLX: "SMLX.L", S500: "S500.L",
  SPXP: "SPXP.L", MQUS: "MQUS.L", MXUS: "MXUS.L", MXWO: "MXWO.L",
  MXFS: "MXFS.L", ECAR_INV: "ECAR.L",
  // WisdomTree UK
  PHAU: "PHAU.L", PHAG: "PHAG.L", PHPT: "PHPT.L", PHPM: "PHPM.L",
  SGLD: "SGLD.L", BULL: "BULL.L", AIGC: "AIGC.L",
  // Lyxor / Amundi UK
  "100D": "100D.L", GILS: "GILS.L",
  // Other UK
  SGLN: "SGLN.L", AGBP: "AGBP.L",
  XGLS: "XGLS.L", XGIG: "XGIG.L", XGSD: "XGSD.L",
  CSP1: "CSP1.L", CSUS: "CSUS.L",
  GBDV: "GBDV.L", UKDV: "UKDV.L",
  HMWO: "HMWO.L", HMEF: "HMEF.L", HUKX: "HUKX.L", HUKS: "HUKS.L",
  // Crypto ETPs UK
  BTCE: "BTCE.L", BCHN: "BCHN.L", BETH: "BETH.L",
  // Commodities UK
  CMOD: "CMOD.L", AIGI: "AIGI.L", OILB: "OILB.L",
  COPA: "COPA.L", COPP: "COPP.L",
  // Multi-Asset UK
  LIFE: "LIFE.L", GROW: "GROW.L",
  // ESG / Climate UK
  WLDS: "WLDS.L", ESGU: "ESGU.L", ESGD: "ESGD.L", ESGE: "ESGE.L",
  SAWD: "SAWD.L", SAEM: "SAEM.L", SAUS: "SAUS.L",
  SUWS: "SUWS.L", SUEU: "SUEU.L",
  GGRP: "GGRP.L", GGRW: "GGRW.L",

  // === XETRA / Frankfurt (.DE) ===
  SXR8: "SXR8.DE", EUNL: "EUNL.DE", IS3N: "IS3N.DE", SXRV: "SXRV.DE",
  IUSA: "IUSA.DE", IUSN: "IUSN.DE", IUSQ: "IUSQ.DE", IQQH: "IQQH.DE",
  QDVE: "QDVE.DE", SXRJ: "SXRJ.DE", SXRT: "SXRT.DE", SXRS: "SXRS.DE",
  IBC0: "IBC0.DE", IBCI: "IBCI.DE", EXX5: "EXX5.DE",
  "2B76": "2B76.DE", "2B77": "2B77.DE", "2B78": "2B78.DE",
  CSNDX: "CSNDX.DE", EXXT: "EXXT.DE", EXV6: "EXV6.DE",
  EXH1: "EXH1.DE", EXHE: "EXHE.DE", EXSA: "EXSA.DE", EXS1: "EXS1.DE",
  VWCE: "VWCE.DE", VGWL: "VGWL.DE",
  DBXD: "DBXD.DE", XDWD: "XDWD.DE", XDWL: "XDWL.DE", XMME: "XMME.DE",
  XDEM: "XDEM.DE", XDEW: "XDEW.DE", DBXJ: "DBXJ.DE", DBXE: "DBXE.DE",
  XDJP: "XDJP.DE", XDPD: "XDPD.DE", XQUI: "XQUI.DE",
  LYMS: "LYMS.DE", LYP6: "LYP6.DE", LYPS: "LYPS.DE", LYPQ: "LYPQ.DE",
  "18MK": "18MK.DE", "18M2": "18M2.DE", "10AJ": "10AJ.DE",
  ZPRX: "ZPRX.DE", ZPRE: "ZPRE.DE", TDIV: "TDIV.DE",
  TL0: "TL0.DE", SAP: "SAP.DE", SIE: "SIE.DE", ALV: "ALV.DE",
  BAS: "BAS.DE", DTE: "DTE.DE", BMW: "BMW.DE", MBG: "MBG.DE",

  // === Euronext Amsterdam (.AS) ===
  VWRL_AS: "VWRL.AS", IWDA_AS: "IWDA.AS",

  // === Euronext Paris (.PA) ===
  CW8: "CW8.PA", EWLD: "EWLD.PA", MWRD: "MWRD.PA",
  PANX: "PANX.PA", PAEEM: "PAEEM.PA",

  // === Borsa Italiana (.MI) ===
  SWDA_MI: "SWDA.MI", VWCE_MI: "VWCE.MI",
};

// ─── Google Finance fetch for international ETFs ───
function mapToGoogleFinance(ticker: string): { symbol: string; exchange: string } | null {
  const mapped = INTERNATIONAL_ETFS[ticker];
  if (mapped) {
    const exchangeMap: Record<string, string> = {
      ".L": "LON", ".DE": "ETR", ".AS": "AMS", ".PA": "EPA", ".MI": "BIT", ".SW": "SWX", ".IR": "ISE",
    };
    for (const [suffix, exchange] of Object.entries(exchangeMap)) {
      if (mapped.endsWith(suffix)) {
        return { symbol: mapped.replace(suffix, ""), exchange };
      }
    }
  }
  // If ticker already has dot notation
  if (ticker.includes(".")) {
    const exchangeMap: Record<string, string> = {
      ".L": "LON", ".DE": "ETR", ".AS": "AMS", ".PA": "EPA", ".MI": "BIT", ".SW": "SWX",
    };
    for (const [suffix, exchange] of Object.entries(exchangeMap)) {
      if (ticker.endsWith(suffix)) {
        return { symbol: ticker.replace(suffix, ""), exchange };
      }
    }
  }
  return null;
}

async function fetchGoogleFinanceQuote(ticker: string): Promise<QuoteResult | null> {
  const gf = mapToGoogleFinance(ticker);
  if (!gf) return null;

  try {
    const url = `https://www.google.com/finance/quote/${gf.symbol}:${gf.exchange}`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) return null;
    const html = await resp.text();

    // Extract current price from Google Finance HTML
    // Pattern: data-last-price="123.45"
    const priceMatch = html.match(/data-last-price="([^"]+)"/);
    if (!priceMatch) return null;
    const currentPrice = parseFloat(priceMatch[1]);
    if (isNaN(currentPrice) || currentPrice <= 0) return null;

    // Extract change percentage
    const changeMatch = html.match(/data-last-normal-market-timestamp[^>]*>.*?<\/div>.*?<div[^>]*>.*?<span[^>]*>.*?<\/span>.*?<span[^>]*>\(?([-+]?[\d.]+)%\)?/s)
      || html.match(/data-last-price[^>]*>.*?(\([-+]?[\d.]+%\))/s);
    let change24h = 0;
    // Try alternative pattern for change
    const changePctMatch = html.match(/data-percentage-change="([^"]+)"/);
    if (changePctMatch) {
      change24h = parseFloat(changePctMatch[1]) * 100;
    }

    // Extract currency
    const currencyMatch = html.match(/data-currency-code="([^"]+)"/);
    let currency = currencyMatch ? currencyMatch[1] : "USD";

    // Extract name
    const nameMatch = html.match(/<div[^>]*class="[^"]*zzDege[^"]*"[^>]*>([^<]+)</)
      || html.match(/<title>([^(]+)\(/);
    const name = nameMatch ? nameMatch[1].trim() : `${gf.symbol}`;

    const previousClose = change24h !== 0 ? currentPrice / (1 + change24h / 100) : currentPrice;

    // Handle GBp (pence) - Google Finance returns in main currency unit
    let displayCurrency = currency;
    let priceForConversion = currentPrice;
    if (currency === "GBp" || currency === "GBX") {
      priceForConversion = currentPrice / 100;
      displayCurrency = "GBP";
      currency = "GBP";
    }

    const rate = await getExchangeRate(currency);
    const priceBRL = priceForConversion * rate;

    return {
      ticker,
      currentPrice: priceForConversion,
      change24h: Math.round(change24h * 100) / 100,
      previousClose: Math.round(previousClose * 100) / 100,
      name,
      source: "google",
      currency: displayCurrency,
      currentPriceBRL: Math.round(priceBRL * 100) / 100,
      exchangeRate: rate,
    };
  } catch (err) {
    console.warn(`Google Finance failed for ${ticker}:`, err);
    return null;
  }
}

// ─── Detect if ticker is international ───
function isInternationalTicker(ticker: string): boolean {
  if (INTERNATIONAL_ETFS[ticker]) return true;
  if (/\.(L|DE|AS|PA|MI|SW|IR)$/.test(ticker)) return true;
  return false;
}

// ─── Source 2: Yahoo Finance (global fallback) ───
function mapToYahooTicker(ticker: string): string {
  const cryptoMappings: Record<string, string> = {
    BTC: "BTC-USD", ETH: "ETH-USD", SOL: "SOL-USD", ADA: "ADA-USD",
    DOT: "DOT-USD", XRP: "XRP-USD", BNB: "BNB-USD", DOGE: "DOGE-USD",
    LTC: "LTC-USD", AVAX: "AVAX-USD", MATIC: "MATIC-USD",
    LINK: "LINK-USD", UNI: "UNI-USD", USDT: "USDT-USD", USDC: "USDC-USD",
  };
  if (cryptoMappings[ticker]) return cryptoMappings[ticker];

  if (INTERNATIONAL_ETFS[ticker]) return INTERNATIONAL_ETFS[ticker];

  if (ticker.includes(".")) return ticker;
  if (/^[A-Z0-9]{4,6}\d{1,2}$/.test(ticker) && !ticker.includes("-")) return `${ticker}.SA`;
  return ticker;
}

async function fetchYahooQuote(ticker: string): Promise<QuoteResult | null> {
  const yahooTicker = mapToYahooTicker(ticker);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=2d`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const currentPrice = meta.regularMarketPrice ?? 0;
    const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? currentPrice;
    const change24h = previousClose > 0 ? ((currentPrice - previousClose) / previousClose) * 100 : 0;

    let currency = meta.currency || "USD";

    const isCryptoUSD = Object.keys(COINGECKO_IDS).includes(ticker);
    if (isCryptoUSD && currentPrice > 0) {
      const rate = await getExchangeRate("USD");
      return {
        ticker, currentPrice, change24h: Math.round(change24h * 100) / 100,
        previousClose, name: meta.shortName || meta.symbol || ticker,
        source: "yahoo", currency: "USD",
        currentPriceBRL: Math.round(currentPrice * rate * 100) / 100, exchangeRate: rate,
      };
    }

    if (yahooTicker.endsWith(".SA") || currency === "BRL") {
      return {
        ticker, currentPrice, change24h: Math.round(change24h * 100) / 100,
        previousClose, name: meta.shortName || meta.symbol || ticker,
        source: "yahoo", currency: "BRL", currentPriceBRL: currentPrice, exchangeRate: 1,
      };
    }

    const rate = await getExchangeRate(currency);
    let priceInCurrency = currentPrice;
    let displayCurrency = currency;
    if (currency === "GBp") {
      priceInCurrency = currentPrice / 100;
      displayCurrency = "GBP";
    }

    const priceBRL = priceInCurrency * (currency === "GBp" ? rate * 100 : rate);

    return {
      ticker,
      currentPrice: currency === "GBp" ? priceInCurrency : currentPrice,
      change24h: Math.round(change24h * 100) / 100,
      previousClose: currency === "GBp" ? previousClose / 100 : previousClose,
      name: meta.shortName || meta.symbol || ticker,
      source: "yahoo", currency: displayCurrency,
      currentPriceBRL: Math.round(priceBRL * 100) / 100,
      exchangeRate: currency === "GBp" ? rate / 100 : rate,
    };
  } catch (err) {
    console.warn(`Yahoo Finance failed for ${yahooTicker}:`, err);
    return null;
  }
}

// ─── Multi-source fetch with fallback ───
async function fetchQuoteWithFallback(ticker: string): Promise<QuoteResult> {
  // Try CoinGecko first for known crypto
  if (COINGECKO_IDS[ticker]) {
    const cgResults = await fetchCoinGeckoQuotes([ticker]);
    if (cgResults[ticker] && cgResults[ticker].currentPrice > 0) {
      return cgResults[ticker];
    }
  }

  // For international ETFs: Google Finance first, then Yahoo as fallback
  if (isInternationalTicker(ticker)) {
    const googleResult = await fetchGoogleFinanceQuote(ticker);
    if (googleResult && googleResult.currentPrice > 0) return googleResult;

    const yahooResult = await fetchYahooQuote(ticker);
    if (yahooResult && yahooResult.currentPrice > 0) return yahooResult;

    return {
      ticker, currentPrice: 0, change24h: 0, previousClose: 0, name: ticker,
      source: "none", currency: "BRL", currentPriceBRL: 0, exchangeRate: 1,
      error: "All sources failed",
    };
  }

  // Brazilian assets: Brapi first, Yahoo fallback
  const brapiResult = await fetchBrapiQuote(ticker);
  if (brapiResult && brapiResult.currentPrice > 0) return brapiResult;

  const yahooResult = await fetchYahooQuote(ticker);
  if (yahooResult && yahooResult.currentPrice > 0) return yahooResult;

  return {
    ticker, currentPrice: 0, change24h: 0, previousClose: 0, name: ticker,
    source: "none", currency: "BRL", currentPriceBRL: 0, exchangeRate: 1,
    error: "All sources failed",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tickers, mode } = await req.json();

    if (!Array.isArray(tickers) || tickers.length === 0) {
      return new Response(
        JSON.stringify({ error: "tickers array required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Reset rate cache
    for (const k of Object.keys(rateCache)) delete rateCache[k];

    const limitedTickers = tickers.slice(0, 30);
    const quotesMap: Record<string, QuoteResult> = {};

    if (mode === "currency") {
      // Currency pairs mode
      const results = await Promise.all(limitedTickers.map((t: string) => fetchCurrencyRate(t)));
      for (const q of results) quotesMap[q.ticker] = q;
    } else if (mode === "crypto") {
      // Crypto/stablecoin mode - try CoinGecko batch first
      const cgResults = await fetchCoinGeckoQuotes(limitedTickers);
      for (const t of limitedTickers) {
        if (cgResults[t] && cgResults[t].currentPrice > 0) {
          quotesMap[t] = cgResults[t];
        } else {
          quotesMap[t] = await fetchQuoteWithFallback(t);
        }
      }
    } else {
      // Default: general quotes
      const quotes = await Promise.all(limitedTickers.map((t: string) => fetchQuoteWithFallback(t)));
      for (const q of quotes) quotesMap[q.ticker] = q;
    }

    return new Response(
      JSON.stringify({ quotes: quotesMap, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("market-quotes error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
