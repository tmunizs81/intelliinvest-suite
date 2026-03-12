

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

// ─── Ondo Global Markets: detect "on" suffix and get underlying ticker ───
const ONDO_GM_TICKERS = new Set([
  'AALon','AAPLon','ABBVon','ABNBon','ABTon','ACHRon','ACNon','ADBEon','ADIon',
  'AGGon','ALBon','AMATon','AMCon','AMDon','AMGNon','AMZNon','ANETon','APLDon',
  'APOon','APPon','ARMon','ASMLon','ASTSon','AVGOon','AXPon','BABAon','BACon',
  'BAon','BBAIon','BIDUon','BILIon','BINCon','BLKon','BLSHon','BMNRon','BNOon',
  'BTGOon','BTGon','BZon','CAPRon','CATon','CEGon','CIBRon','CIFRon','CLOAon',
  'CLOIon','CMGon','COFon','COHRon','COINon','COPXon','COPon','COSTon','CPNGon',
  'CRCLon','CRMon','CRWDon','CRWVon','CSCOon','CVNAon','CVXon','Con',
  'DASHon','DBCon','DEon','DGRWon','DISon','DNNon','ECHon','EEMon','EFAon',
  'ENLVon','ENPHon','EQIXon','ETHAon','ETNon','EWJon','EWYon','EWZon','EXODon',
  'FCXon','FFOGon','FGDLon','FIGRon','FIGon','FLHYon','FLQLon','FSOLon','FTGCon',
  'FUTUon','FXIon','Fon','GEMIon','GEVon','GEon','GLDon','GLTRon','GLXYon',
  'GMEon','GOOGLon','GRABon','GRNDon','GSon','HDon','HIMSon','HOODon','HYGon',
  'HYSon','IAUon','IBITon','IBMon','IEFAon','IEFon','IEMGon','IJHon','INCEon',
  'INDAon','INTCon','INTUon','IONQon','IRENon','ISRGon','ITAon','ITOTon','IVVon',
  'IWFon','IWMon','IWNon','JAAAon','JDon','JNJon','JPMon','KLACon','KOon',
  'KWEBon','LINon','LIon','LLYon','LMTon','LOWon','LRCXon','LUNRon','MARAon',
  'MAon','MCDon','MELIon','METAon','MPon','MRKon','MRNAon','MRVLon','MSFTon',
  'MSTRon','MTZon','MUon','NBISon','NEEon','NEMon','NFLXon','NIKLon','NIOon',
  'NKEon','NOCon','NOWon','NTESon','NVDAon','NVOon','OIHon','OKLOon','ONDSon',
  'ONon','OPENon','OPRAon','ORCLon','OSCRon','OXYon','PALLon','PANWon','PAVEon',
  'PBRon','PCGon','PDBCon','PDDon','PEPon','PFEon','PGon','PINSon','PLTRon',
  'PLUGon','PPLTon','PSQon','PYPLon','QBTSon','QCOMon','QQQon','QUBTon',
  'RDDTon','RDWon','REGNon','REMXon','RGTIon','RIOTon','RIVNon','RKLBon',
  'RTXon','SBETon','SBUXon','SCCOon','SCHWon','SEDGon','SGOVon','SHOPon',
  'SHYon','SLVon','SMCIon','SNAPon','SNDKon','SNOWon','SOFIon','SOUNon',
  'SOXXon','SOon','SPGIon','SPOTon','SPYon','SQQQon','STXon','TCOMon',
  'TIPon','TLNon','TLTon','TMOon','TMUSon','TMon','TQQQon','TSLAon','TSMon',
  'TXNon','Ton','UBERon','UECon','UNGon','UNHon','UNPon','URAon','USDon',
  'USFRon','USOon','VFSon','VNQon','VRTXon','VRTon','VSTon','VTIon','VTVon',
  'VZon','Von','WDCon','WFCon','WMTon','WMon','WULFon','XOMon','XYZon',
]);

function getOndoGMUnderlying(ticker: string): string | null {
  if (ONDO_GM_TICKERS.has(ticker)) return ticker.replace(/on$/, '');
  const found = [...ONDO_GM_TICKERS].find(t => t.toUpperCase() === ticker.toUpperCase());
  if (found) return found.replace(/on$/, '');
  return null;
}

// ─── CoinGecko fetch for crypto (including stablecoins) ───
const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", ADA: "cardano",
  DOT: "polkadot", XRP: "ripple", BNB: "binancecoin", DOGE: "dogecoin",
  LTC: "litecoin", AVAX: "avalanche-2", MATIC: "matic-network",
  LINK: "chainlink", UNI: "uniswap", USDT: "tether", USDC: "usd-coin",
  SHIB: "shiba-inu", AAVE: "aave", ALGO: "algorand", ATOM: "cosmos",
  // Ondo Finance
  ONDO: "ondo-finance", OUSG: "ondo-short-term-us-government-bond-fund",
  USDY: "ondo-us-dollar-yield", OMMF: "ondo-us-money-market-fund",
  // xStocks by Backed Finance
  CRCLX: "circle-tokenized-stock-xstock",
  GOOGLX: "alphabet-tokenized-stock-xstock",
  NVDAX: "nvidia-xstock", MSTRX: "microstrategy-tokenized-stock-xstock",
  SPYX: "sp500-tokenized-stock-xstock", AAPLX: "apple-tokenized-stock-xstock",
  COINX: "coinbase-xstock", HOODX: "robinhood-tokenized-stock-xstock",
  MCDX: "mcdonalds-xstock", AMZNX: "amazon-xstock",
  TBLLX: "tbll-tokenized-etf-xstock", IEMGX: "core-msci-emerging-markets-xstock",
  IWMX: "russell-2000-xstock", KRAQX: "kraq-xstock",
  COPXX: "global-x-copper-miners-xstock", PALLX: "abrdn-physical-palladium-shares-xstock",
  AMDX: "amd-xstock", BTGOX: "bitgo-xstock", BMNRX: "bitmine-xstock",
  OPENX: "open-tokenized-stock", LLYX: "eli-lilly-xstock",
  NFLXX: "netflix-xstock", GSX: "goldman-sachs-xstock",
  TQQQX: "tqqq-xstock", LINX: "linde-xstock", TMOX: "thermo-fisher-xstock",
  GLDX: "gold-xstock", APPX: "applovin-xstock", CRWDX: "crowdstrike-xstock",
  MSFTX: "microsoft-xstock", HDX: "home-depot-xstock",
  AVGOX: "broadcom-xstock", VTIX: "vanguard-xstock",
  UNHX: "unitedhealth-xstock", JPMX: "jpmorgan-chase-xstock",
  INTCX: "intel-xstock", BACX: "bank-of-america-xstock",
  IBMX: "international-business-machines-xstock",
  JNJX: "johnson-johnson-xstock", HONX: "honeywell-xstock",
  ABBVX: "abbvie-xstock", ACNX: "accenture-xstock",
  CVXX: "chevron-xstock", CRMX: "salesforce-xstock",
  CMCSAX: "comcast-xstock", DHRX: "danaher-xstock",
  PMX: "philip-morris-xstock", PEPX: "pepsico-xstock",
  ORCLX: "oracle-xstock", PFEX: "pfizer-xstock",
  XOMX: "exxon-mobil-xstock", PLTRX: "palantir-xstock",
  PGX: "procter-gamble-xstock", GMEX: "gamestop-xstock",
  MRKX: "merck-xstock", ABTX: "abbott-xstock",
  AZNX: "astrazeneca-xstock", MRVLX: "marvell-xstock",
  MDTX: "medtronic-xstock", CSCOX: "cisco-xstock",
  KOX: "coca-cola-xstock", NVOX: "novo-nordisk-xstock",
  DFDVX: "dfdv-xstock", AMBRX: "amber-xstock",
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

  // === XETRA / Frankfurt (.DE) - Comprehensive German ETFs ===
  // iShares Core
  SXR8: "SXR8.DE", EUNL: "EUNL.DE", IS3N: "IS3N.DE", SXRV: "SXRV.DE",
  IUSA: "IUSA.DE", IUSN: "IUSN.DE", IUSQ: "IUSQ.DE", IQQH: "IQQH.DE",
  QDVE: "QDVE.DE", SXRJ: "SXRJ.DE", SXRT: "SXRT.DE", SXRS: "SXRS.DE",
  IBC0: "IBC0.DE", IBCI: "IBCI.DE", EXX5: "EXX5.DE",
  CSNDX: "CSNDX.DE", EXXT: "EXXT.DE", EXV6: "EXV6.DE",
  EXH1: "EXH1.DE", EXHE: "EXHE.DE", EXSA: "EXSA.DE", EXS1: "EXS1.DE",
  // iShares Sector & Thematic
  IQQW: "IQQW.DE", IQQQ: "IQQQ.DE", IQQP: "IQQP.DE",
  IQQ0: "IQQ0.DE", IQQL: "IQQL.DE", IQQM: "IQQM.DE", IQQE: "IQQE.DE",
  IS3S: "IS3S.DE", IS3C: "IS3C.DE", IS3R: "IS3R.DE", IS3Q: "IS3Q.DE",
  IS3U: "IS3U.DE", IS3L: "IS3L.DE", IS3V: "IS3V.DE",
  SXRG: "SXRG.DE", SXRH: "SXRH.DE", SXRI: "SXRI.DE", SXRK: "SXRK.DE",
  SXRL: "SXRL.DE", SXRM: "SXRM.DE", SXRN: "SXRN.DE",
  QDVK: "QDVK.DE", QDVJ: "QDVJ.DE", QDVI: "QDVI.DE",
  QDVH: "QDVH.DE", QDVG: "QDVG.DE", QDVF: "QDVF.DE",
  // iShares Bond
  IBGS: "IBGS.DE", IBGM: "IBGM.DE", IBGL: "IBGL.DE",
  IBTS: "IBTS.DE", IBTM: "IBTM.DE", IBTL: "IBTL.DE",
  EUN5: "EUN5.DE", EUNR: "EUNR.DE", EUNS: "EUNS.DE",
  EUN4: "EUN4.DE", EUN8: "EUN8.DE", EUN9: "EUN9.DE",
  EUNH: "EUNH.DE", EUNB: "EUNB.DE", EUNC: "EUNC.DE", EUND: "EUND.DE",
  IGES: "IGES.DE", IGEL: "IGEL.DE", IGEM: "IGEM.DE",
  IHYG_DE: "IHYG.DE", IBCE: "IBCE.DE", IB01: "IB01.DE",
  IUSP_DE: "IUSP.DE", IUSV: "IUSV.DE", IUSW: "IUSW.DE",
  // iShares Regional
  IBC6: "IBC6.DE", IUSD: "IUSD.DE", IUSE: "IUSE.DE", IUSF: "IUSF.DE",
  IQQB: "IQQB.DE", IQQA: "IQQA.DE", IQQC: "IQQC.DE", IQQD: "IQQD.DE",
  // Vanguard
  VWCE: "VWCE.DE", VGWL: "VGWL.DE", V3AA: "V3AA.DE", V3AB: "V3AB.DE",
  VFEM_DE: "VFEM.DE", VDEM_DE: "VDEM.DE", VDPX_DE: "VDPX.DE",
  VDJP_DE: "VDJP.DE", VDEU_DE: "VDEU.DE",
  VGOV_DE: "VGOV.DE", VGEM_DE: "VGEM.DE", VAGU_DE: "VAGU.DE", VAGP_DE: "VAGP.DE",
  VDTY_DE: "VDTY.DE", VUTY_DE: "VUTY.DE", VUCP_DE: "VUCP.DE", VUCE_DE: "VUCE.DE",
  VETY_DE: "VETY.DE", VECP_DE: "VECP.DE", VHYL_DE: "VHYL.DE", VGEL: "VGEL.DE",
  VDNR_DE: "VDNR.DE", V80A: "V80A.DE", V60A: "V60A.DE", V40A: "V40A.DE", V20A: "V20A.DE",
  // Xtrackers / DWS
  DBXD: "DBXD.DE", XDWD: "XDWD.DE", XDWL: "XDWL.DE", XMME: "XMME.DE",
  XDEM: "XDEM.DE", XDEW: "XDEW.DE", DBXJ: "DBXJ.DE", DBXE: "DBXE.DE",
  XDJP: "XDJP.DE", XDPD: "XDPD.DE", XQUI: "XQUI.DE",
  XD9U: "XD9U.DE", XDWT: "XDWT.DE", XDWS: "XDWS.DE", XDWM: "XDWM.DE",
  XDWH: "XDWH.DE", XDWG: "XDWG.DE",
  XDEB: "XDEB.DE", XDEE: "XDEE.DE", XDEP: "XDEP.DE", XDES: "XDES.DE", XDET: "XDET.DE",
  DBZB: "DBZB.DE", DBXG: "DBXG.DE", DBXH: "DBXH.DE", DBXN: "DBXN.DE", DBXF: "DBXF.DE",
  XCS6: "XCS6.DE", XCHA: "XCHA.DE", XDWF: "XDWF.DE", XDWI: "XDWI.DE",
  XSGI: "XSGI.DE", XSGL: "XSGL.DE", XSGM: "XSGM.DE", XSGN: "XSGN.DE",
  XACT: "XACT.DE", XAUS: "XAUS.DE", XDAX: "XDAX.DE",
  XMTD: "XMTD.DE", XMTG: "XMTG.DE", XMTH: "XMTH.DE",
  XZMU: "XZMU.DE", XZMG: "XZMG.DE", XZEM: "XZEM.DE", XZEP: "XZEP.DE",
  XMLD: "XMLD.DE", XMLE: "XMLE.DE", XMLF: "XMLF.DE",
  // Amundi / Lyxor
  LYMS: "LYMS.DE", LYP6: "LYP6.DE", LYPS: "LYPS.DE", LYPQ: "LYPQ.DE",
  LYYA: "LYYA.DE", LYYB: "LYYB.DE", LYYC: "LYYC.DE", LYYD: "LYYD.DE", LYYE: "LYYE.DE",
  L100: "L100.DE", LCWD: "LCWD.DE", LMWE: "LMWE.DE", LMWI: "LMWI.DE", LMWP: "LMWP.DE",
  C060: "C060.DE", C070: "C070.DE", C080: "C080.DE", C090: "C090.DE",
  AEEM: "AEEM.DE", AEMD: "AEMD.DE", AEXK: "AEXK.DE",
  AMEW: "AMEW.DE", AMEM: "AMEM.DE", AMEU: "AMEU.DE",
  "18MK": "18MK.DE", "18M2": "18M2.DE", "10AJ": "10AJ.DE",
  // SPDR
  SPPW_DE: "SPPW.DE", SPY4: "SPY4.DE", SPY5_DE: "SPY5.DE",
  SPYD_DE: "SPYD.DE", SPPE_DE: "SPPE.DE", SPPS: "SPPS.DE", SPPJ: "SPPJ.DE",
  SYBS_DE: "SYBS.DE", SYBQ_DE: "SYBQ.DE", SYBJ_DE: "SYBJ.DE",
  SYBM_DE: "SYBM.DE", SYBW_DE: "SYBW.DE", SYBF_DE: "SYBF.DE",
  ZPRS: "ZPRS.DE", ZPRE_DE: "ZPRE.DE", ZPRX_DE: "ZPRX.DE",
  ZPRV: "ZPRV.DE", ZPRG: "ZPRG.DE",
  // Invesco
  EQQQ_DE: "EQQQ.DE", MQUS_DE: "MQUS.DE", MXUS_DE: "MXUS.DE",
  MXWO_DE: "MXWO.DE", MXFS_DE: "MXFS.DE",
  SMCX_DE: "SMCX.DE", SMLX_DE: "SMLX.DE", S500_DE: "S500.DE", SPXP_DE: "SPXP.DE",
  // WisdomTree
  PHAU_DE: "PHAU.DE", PHAG_DE: "PHAG.DE", PHPT_DE: "PHPT.DE", PHPM_DE: "PHPM.DE",
  WGLD: "WGLD.DE", WSLV: "WSLV.DE", WCOB: "WCOB.DE", WCRB: "WCRB.DE",
  WT5G: "WT5G.DE", WTAI: "WTAI.DE", WTCH: "WTCH.DE", WTEC: "WTEC.DE",
  // VanEck
  TDIV_DE: "TDIV.DE", TGET: "TGET.DE", TGBT: "TGBT.DE",
  TSMM: "TSMM.DE", TSWE: "TSWE.DE", TRET: "TRET.DE",
  SMGW: "SMGW.DE", SMHG: "SMHG.DE", SMHI: "SMHI.DE", SMHJ: "SMHJ.DE", SMHK: "SMHK.DE",
  // Deka
  EL4A: "EL4A.DE", EL4B: "EL4B.DE", EL4C: "EL4C.DE", EL4D: "EL4D.DE",
  EL4E: "EL4E.DE", EL4F: "EL4F.DE", EL4G: "EL4G.DE", EL4X: "EL4X.DE", EL4Z: "EL4Z.DE",
  // ComStage / BNP Paribas
  CBSX: "CBSX.DE", CBDX: "CBDX.DE", CBEF: "CBEF.DE", CBES: "CBES.DE", CBEM: "CBEM.DE",
  // UBS
  UIM6: "UIM6.DE", UIM2: "UIM2.DE", UIM5: "UIM5.DE", UIM1: "UIM1.DE", UBSG_DE: "UBSG.DE",
  // Commodities / Crypto ETP
  BTCE_DE: "BTCE.DE", BTHE: "BTHE.DE", BTCS: "BTCS.DE", ETHW: "ETHW.DE", SOLW: "SOLW.DE",
  XGLD: "XGLD.DE", XSLV: "XSLV.DE", "4GLD": "4GLD.DE", EUWX: "EUWX.DE", PPFB: "PPFB.DE",
  // DAX / MDAX / SDAX
  DAXEX: "DAXEX.DE", EXSC: "EXSC.DE", EXSD: "EXSD.DE", EXSB: "EXSB.DE",
  // German Stocks (popular)
  TL0: "TL0.DE", SAP: "SAP.DE", SIE: "SIE.DE", ALV: "ALV.DE",
  BAS: "BAS.DE", DTE: "DTE.DE", BMW: "BMW.DE", MBG: "MBG.DE",

  // === Euronext Amsterdam (.AS) ===
  VWRL_AS: "VWRL.AS", IWDA_AS: "IWDA.AS",

  // === Euronext Paris (.PA) ===
  CW8: "CW8.PA", EWLD: "EWLD.PA", MWRD: "MWRD.PA",
  PANX: "PANX.PA", PAEEM: "PAEEM.PA",

  // === Borsa Italiana (.MI) ===
  SWDA_MI: "SWDA.MI", VWCE_MI: "VWCE.MI",

  // === Euronext Dublin / Irish Stock Exchange (.IR) ===
  // iShares Core
  SWRD: "SWRD.IR", SSAC: "SSAC.IR", SMMD: "SMMD.IR", WSML: "WSML.IR",
  CSPX_IR: "CSPX.IR", IWDA_IR: "IWDA.IR", EIMI_IR: "EIMI.IR",
  SWDA_IR: "SWDA.IR", ISAC_IR: "ISAC.IR",
  // iShares Bond
  IGLA: "IGLA.IR", DTLA: "DTLA.IR", LQDA: "LQDA.IR", SUOA: "SUOA.IR", IGLO: "IGLO.IR",
  AGGA: "AGGA.IR", AGGU: "AGGU.IR", IHYA: "IHYA.IR", SHYA: "SHYA.IR",
  // Vanguard Ireland
  VWRA_IR: "VWRA.IR", VWRL_IR: "VWRL.IR", VUAA_IR: "VUAA.IR", VUSA_IR: "VUSA.IR",
  VFEM_IR: "VFEM.IR", VDEM_IR: "VDEM.IR", VEVE_IR: "VEVE.IR", VHYL_IR: "VHYL.IR",
  VUAG_IR: "VUAG.IR", VERG_IR: "VERG.IR",
  // SPDR Ireland
  SPY5_IR: "SPY5.IR", SPMV_IR: "SPMV.IR", SPPW_IR: "SPPW.IR",
  GLCO_IR: "GLCO.IR", GLAG_IR: "GLAG.IR",
  // Invesco Ireland
  EQQQ_IR: "EQQQ.IR", S500_IR: "S500.IR", SPXP_IR: "SPXP.IR",
  // Amundi Ireland
  IWQU: "IWQU.IR", LCUW: "LCUW.IR", PRAW: "PRAW.IR", PRAU: "PRAU.IR",
  // Goldman Sachs
  GSPY: "GSPY.IR", GSDE: "GSDE.IR", GSEU: "GSEU.IR", GSEM: "GSEM.IR",
  // JPMorgan
  JEGA: "JEGA.IR", JEGP: "JEGP.IR", JPGL: "JPGL.IR", JPEI: "JPEI.IR", JPEA: "JPEA.IR",
  // HSBC
  HMWO_IR: "HMWO.IR", HMEF_IR: "HMEF.IR", HPRO: "HPRO.IR", HPRD: "HPRD.IR",
  // First Trust
  FTUQ: "FTUQ.IR", FTEC: "FTEC.IR", FTAL: "FTAL.IR",

  // === SIX Swiss Exchange (.SW) ===
  // iShares Swiss
  CSSPX: "CSSPX.SW", CSSMI: "CSSMI.SW", CSSMIM: "CSSMIM.SW",
  CSINDU: "CSINDU.SW", CSNDX_SW: "CSNDX.SW", CSEMUS: "CSEMUS.SW",
  CHSPI: "CHSPI.SW", CSSX5E: "CSSX5E.SW", CSMIB: "CSMIB.SW",
  CSDAX: "CSDAX.SW", CSBGAG: "CSBGAG.SW",
  CSEMAS: "CSEMAS.SW", CSESGC: "CSESGC.SW", CSESGM: "CSESGM.SW",
  // UBS ETFs
  SPICHA: "SPICHA.SW", SMIMCHA: "SMIMCHA.SW", SMCHA: "SMCHA.SW",
  SMMCHA: "SMMCHA.SW", SLICHA: "SLICHA.SW", CHFCHA: "CHFCHA.SW",
  SBIDOM: "SBIDOM.SW", SBIDOC: "SBIDOC.SW",
  CHCORP: "CHCORP.SW", CHGOVT: "CHGOVT.SW", UCHIMF: "UCHIMF.SW",
  UIMR: "UIMR.SW", UIMS: "UIMS.SW", UIMP: "UIMP.SW", UIMQ: "UIMQ.SW", UIMW: "UIMW.SW",
  UEFR: "UEFR.SW", UEFS: "UEFS.SW", UEFP: "UEFP.SW", UEFQ: "UEFQ.SW",
  EMMCHA: "EMMCHA.SW", ACWISG: "ACWISG.SW", MSCISG: "MSCISG.SW",
  USEQSG: "USEQSG.SW", EURQSG: "EURQSG.SW", JAPQSG: "JAPQSG.SW",
  PACQSG: "PACQSG.SW", CANQSG: "CANQSG.SW",
  // Vanguard Swiss
  VWRL_SW: "VWRL.SW", VUAA_SW: "VUAA.SW", VUSA_SW: "VUSA.SW", VWCE_SW: "VWCE.SW",
  VFEM_SW: "VFEM.SW", VHYL_SW: "VHYL.SW", VEVE_SW: "VEVE.SW",
  VGOV_SW: "VGOV.SW", VAGU_SW: "VAGU.SW", VUTY_SW: "VUTY.SW",
  // Xtrackers Swiss
  XSMI: "XSMI.SW", XMTD_SW: "XMTD.SW", XDWD_SW: "XDWD.SW", XDWL_SW: "XDWL.SW",
  XMME_SW: "XMME.SW", XDEW_SW: "XDEW.SW", XDEM_SW: "XDEM.SW",
  // Invesco Swiss
  EQQQ_SW: "EQQQ.SW", S500_SW: "S500.SW", SPXS_SW: "SPXS.SW",
  // WisdomTree Swiss
  WTCH_SW: "WTCH.SW", WGLD_SW: "WGLD.SW", PHAU_SW: "PHAU.SW", PHAG_SW: "PHAG.SW",
  // ZKB (Zürcher Kantonalbank)
  ZKBGO: "ZKBGO.SW", ZKBSI: "ZKBSI.SW", ZKBSM: "ZKBSM.SW",
  ZKBSW: "ZKBSW.SW", ZKBSP: "ZKBSP.SW",
  ZKBEN: "ZKBEN.SW", ZKBEW: "ZKBEW.SW", ZKBEM: "ZKBEM.SW",
  // Swisscanto
  SWICHA: "SWICHA.SW", SWIESG: "SWIESG.SW", SWICAS: "SWICAS.SW", SWICAU: "SWICAU.SW",
  // SPI / SMI Index ETFs
  SPIEX: "SPIEX.SW", SMIEX: "SMIEX.SW", SMMEX: "SMMEX.SW", SLIEX: "SLIEX.SW",
  // Swiss Commodities
  ZGLD: "ZGLD.SW", ZPAL: "ZPAL.SW", ZPLA: "ZPLA.SW", ZSIL: "ZSIL.SW",
  JBGOCA: "JBGOCA.SW", JBSICA: "JBSICA.SW",
  // Swiss Real Estate ETFs
  SRFCHA: "SRFCHA.SW", SRECHA: "SRECHA.SW", SWIIT: "SWIIT.SW", SREGA: "SREGA.SW",

  // === Hong Kong Stock Exchange (.HK) ===
  // Tracker Fund / Hang Seng
  "2800": "2800.HK", "2833": "2833.HK", "3033": "3033.HK", "3067": "3067.HK",
  "3037": "3037.HK", "2828": "2828.HK", "2836": "2836.HK",
  // iShares HK
  "2801": "2801.HK", "2802": "2802.HK", "2804": "2804.HK", "2805": "2805.HK",
  "2823": "2823.HK", "2827": "2827.HK", "2832": "2832.HK", "2840": "2840.HK",
  "3008": "3008.HK", "3010": "3010.HK", "3012": "3012.HK", "3015": "3015.HK",
  "3020": "3020.HK", "3040": "3040.HK", "3050": "3050.HK", "3060": "3060.HK",
  "3110": "3110.HK", "3115": "3115.HK", "3120": "3120.HK", "3122": "3122.HK",
  "3127": "3127.HK", "3130": "3130.HK", "3132": "3132.HK", "3141": "3141.HK",
  "3143": "3143.HK", "3145": "3145.HK", "3160": "3160.HK", "3162": "3162.HK",
  "3165": "3165.HK",
  // CSOP HK
  "3188": "3188.HK", "3005": "3005.HK", "3006": "3006.HK", "3007": "3007.HK",
  "3029": "3029.HK", "3174": "3174.HK", "3175": "3175.HK", "3176": "3176.HK",
  "3177": "3177.HK", "3178": "3178.HK", "3193": "3193.HK", "3194": "3194.HK",
  // China AMC HK
  "3100": "3100.HK", "3101": "3101.HK", "3102": "3102.HK", "3103": "3103.HK",
  "3104": "3104.HK", "3106": "3106.HK", "3108": "3108.HK", "3109": "3109.HK",
  "3118": "3118.HK", "3119": "3119.HK", "3121": "3121.HK", "3125": "3125.HK",
  "3147": "3147.HK", "3148": "3148.HK", "3149": "3149.HK",
  // Leveraged & Inverse HK
  "7200": "7200.HK", "7300": "7300.HK", "7226": "7226.HK", "7326": "7326.HK",
  "7228": "7228.HK", "7328": "7328.HK", "7233": "7233.HK", "7333": "7333.HK",
  "7288": "7288.HK", "7388": "7388.HK",
  // Sector HK
  "2820": "2820.HK", "2845": "2845.HK", "3003": "3003.HK", "3004": "3004.HK",
  "3024": "3024.HK", "3034": "3034.HK", "3036": "3036.HK", "3039": "3039.HK",

  // === Tokyo Stock Exchange (.T) ===
  // TOPIX
  "1305": "1305.T", "1306": "1306.T", "1308": "1308.T", "1348": "1348.T",
  "1473": "1473.T", "1475": "1475.T", "2524": "2524.T",
  // Nikkei 225
  "1321": "1321.T", "1329": "1329.T", "1330": "1330.T", "1346": "1346.T",
  "1369": "1369.T", "1397": "1397.T", "1489": "1489.T", "2525": "2525.T",
  // S&P 500 / US from Japan
  "1547": "1547.T", "1557": "1557.T", "1655": "1655.T", "2521": "2521.T",
  "2558": "2558.T", "2633": "2633.T", "2634": "2634.T",
  // Global / EM from Japan
  "1550": "1550.T", "1554": "1554.T", "1559": "1559.T", "1656": "1656.T",
  "1657": "1657.T", "1658": "1658.T", "2513": "2513.T", "2514": "2514.T",
  // Japan Sector
  "1591": "1591.T", "1592": "1592.T", "1593": "1593.T", "1594": "1594.T",
  "1615": "1615.T", "1617": "1617.T", "1618": "1618.T", "1619": "1619.T",
  "1620": "1620.T", "1621": "1621.T", "1622": "1622.T", "1623": "1623.T",
  "1624": "1624.T", "1625": "1625.T", "1626": "1626.T", "1627": "1627.T",
  // REIT Japan
  "1343": "1343.T", "1345": "1345.T", "1476": "1476.T", "1488": "1488.T",
  "1495": "1495.T", "2515": "2515.T", "2517": "2517.T",
  // Bond Japan
  "1677": "1677.T", "1678": "1678.T", "2510": "2510.T", "2511": "2511.T", "2512": "2512.T",
  // Dividend Japan
  "1494": "1494.T", "1499": "1499.T", "1577": "1577.T", "1651": "1651.T", "1698": "1698.T",
  // Leveraged & Inverse Japan
  "1357": "1357.T", "1358": "1358.T", "1365": "1365.T", "1366": "1366.T",
  "1459": "1459.T", "1568": "1568.T", "1569": "1569.T", "1570": "1570.T", "1571": "1571.T",
  // Commodities Japan
  "1326": "1326.T", "1328": "1328.T", "1540": "1540.T", "1541": "1541.T",
  "1542": "1542.T", "1543": "1543.T", "1671": "1671.T", "1672": "1672.T",

  // === Australian Securities Exchange (.AX) ===
  // Vanguard Australia
  VAS: "VAS.AX", VGS: "VGS.AX", VTS: "VTS.AX", VEU: "VEU.AX",
  VHY: "VHY.AX", VAP: "VAP.AX", VAF: "VAF.AX", VIF: "VIF.AX", VGB: "VGB.AX",
  VDHG: "VDHG.AX", VDGR: "VDGR.AX", VDBA: "VDBA.AX", VDCO: "VDCO.AX",
  VESG: "VESG.AX", VETH: "VETH.AX", VBLD: "VBLD.AX", VISM: "VISM.AX",
  VSO: "VSO.AX", VVLU: "VVLU.AX", VGAD: "VGAD.AX", VMIN: "VMIN.AX", VLC: "VLC.AX",
  // iShares Australia
  IOZ: "IOZ.AX", IVV_AX: "IVV.AX", IEM: "IEM.AX", IAA: "IAA.AX", IAF: "IAF.AX",
  IHD: "IHD.AX", ILB: "ILB.AX", ISO: "ISO.AX", IXJ: "IXJ.AX", IOO: "IOO.AX",
  IHVV: "IHVV.AX", IHWL: "IHWL.AX", IWLD: "IWLD.AX", IHEB: "IHEB.AX", ICOR: "ICOR.AX",
  // BetaShares
  A200: "A200.AX", NDQ: "NDQ.AX", DHHF: "DHHF.AX", ETHI: "ETHI.AX",
  HNDQ: "HNDQ.AX", DIVI: "DIVI.AX", QOZ: "QOZ.AX",
  GGUS: "GGUS.AX", BGBL: "BGBL.AX", DBBF: "DBBF.AX",
  ATEC: "ATEC.AX", FOOD: "FOOD.AX", ERTH: "ERTH.AX", CRYP: "CRYP.AX", BNKS: "BNKS.AX",
  AAA: "AAA.AX", QPON: "QPON.AX", CRED: "CRED.AX", HBRD: "HBRD.AX",
  BEAR: "BEAR.AX", BBOZ: "BBOZ.AX", BBUS: "BBUS.AX", LNAS: "LNAS.AX",
  YMAX: "YMAX.AX", UMAX: "UMAX.AX", QMAX: "QMAX.AX", IMAX_AX: "IMAX.AX",
  // SPDR Australia
  STW: "STW.AX", WDIV: "WDIV.AX", WXOZ: "WXOZ.AX", WEMG: "WEMG.AX",
  OZBD: "OZBD.AX", SLF: "SLF.AX", SYI: "SYI.AX",
  // VanEck Australia
  MVW: "MVW.AX", MVS: "MVS.AX", MVE: "MVE.AX", MVA: "MVA.AX",
  MOAT: "MOAT.AX", IFRA: "IFRA.AX", SEMI_AX: "SEMI.AX", CNEW: "CNEW.AX", DFND: "DFND.AX",
  // Magellan
  MGE: "MGE.AX", MHHT: "MHHT.AX", MHG: "MHG.AX",
  // Global X Australia
  ACDC: "ACDC.AX", FANG: "FANG.AX", WIRE: "WIRE.AX", CURE: "CURE.AX",
};

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
    
    // Use actual OHLC close data for accurate price (matches Yahoo website)
    const closes = result.indicators?.quote?.[0]?.close;
    let currentPrice = meta.regularMarketPrice ?? 0;
    if (closes && closes.length > 0) {
      // Get the last valid close price from chart data
      for (let i = closes.length - 1; i >= 0; i--) {
        if (closes[i] !== null && closes[i] !== undefined) {
          currentPrice = closes[i];
          break;
        }
      }
    }
    
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

// ─── Dynamic Ondo GM lookup from database (for new tokens not in hardcoded set) ───
let dynamicOndoCache: Map<string, string> | null = null;
let dynamicOndoCacheTime = 0;

async function getDynamicOndoUnderlying(ticker: string): Promise<string | null> {
  // Cache for 10 minutes
  if (!dynamicOndoCache || Date.now() - dynamicOndoCacheTime > 600000) {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const resp = await fetch(
        `${supabaseUrl}/rest/v1/ondo_gm_tokens?select=symbol,underlying_ticker`,
        {
          headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey },
          signal: AbortSignal.timeout(5000),
        }
      );
      if (resp.ok) {
        const rows = await resp.json();
        dynamicOndoCache = new Map(rows.map((r: { symbol: string; underlying_ticker: string }) => [r.symbol.toUpperCase(), r.underlying_ticker]));
        dynamicOndoCacheTime = Date.now();
        console.log(`Loaded ${dynamicOndoCache.size} Ondo GM tokens from DB`);
      }
    } catch (err) {
      console.warn("Failed to load dynamic Ondo tokens:", err);
    }
  }
  return dynamicOndoCache?.get(ticker.toUpperCase()) || null;
}

// ─── Server-side quote cache ───
interface CachedQuote {
  data: QuoteResult;
  cachedAt: number;
}
const quoteCache = new Map<string, CachedQuote>();

function isMarketOpen(): boolean {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcDay = now.getUTCDay();
  // B3: 10:00-17:00 BRT = 13:00-20:00 UTC (weekdays)
  // US: 9:30-16:00 ET ≈ 13:30-20:00 UTC (weekdays)
  // Consider "market hours" broadly as 13:00-21:00 UTC, Mon-Fri
  if (utcDay === 0 || utcDay === 6) return false;
  return utcHour >= 13 && utcHour < 21;
}

function getCacheTTL(): number {
  return isMarketOpen() ? 5 * 60_000 : 30 * 60_000; // 5min during market, 30min off-hours
}

function getCachedQuote(ticker: string): QuoteResult | null {
  const cached = quoteCache.get(ticker);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > getCacheTTL()) {
    quoteCache.delete(ticker);
    return null;
  }
  return cached.data;
}

function setCachedQuote(ticker: string, data: QuoteResult) {
  quoteCache.set(ticker, { data, cachedAt: Date.now() });
  // Evict old entries if cache grows too large
  if (quoteCache.size > 200) {
    const oldest = [...quoteCache.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt);
    for (let i = 0; i < 50; i++) quoteCache.delete(oldest[i][0]);
  }
}

// ─── Multi-source fetch with fallback ───
async function fetchQuoteWithFallback(ticker: string): Promise<QuoteResult> {
  // Check cache first
  const cached = getCachedQuote(ticker);
  if (cached) return cached;
  // Ondo GM tokens: check hardcoded set first, then DB
  let ondoUnderlying = getOndoGMUnderlying(ticker);
  if (!ondoUnderlying) {
    ondoUnderlying = await getDynamicOndoUnderlying(ticker);
  }
  if (ondoUnderlying) {
    const yahooResult = await fetchYahooQuote(ondoUnderlying);
    if (yahooResult && yahooResult.currentPrice > 0) {
      return { ...yahooResult, ticker, name: `${ondoUnderlying} (Ondo Tokenized)`, source: "yahoo-ondo-gm" };
    }
    const brapiResult = await fetchBrapiQuote(ondoUnderlying);
    if (brapiResult && brapiResult.currentPrice > 0) {
      return { ...brapiResult, ticker, name: `${ondoUnderlying} (Ondo Tokenized)`, source: "brapi-ondo-gm" };
    }
  }

  // Try CoinGecko first for known crypto
  if (COINGECKO_IDS[ticker]) {
    const cgResults = await fetchCoinGeckoQuotes([ticker]);
    if (cgResults[ticker] && cgResults[ticker].currentPrice > 0) {
      return cgResults[ticker];
    }
  }

  // For all assets: try Brapi first (good for Brazilian), then Yahoo (good for international)
  const brapiResult = await fetchBrapiQuote(ticker);
  if (brapiResult && brapiResult.currentPrice > 0) return brapiResult;

  const yahooResult = await fetchYahooQuote(ticker);
  if (yahooResult && yahooResult.currentPrice > 0) return yahooResult;

  const fallbackResult: QuoteResult = {
    ticker, currentPrice: 0, change24h: 0, previousClose: 0, name: ticker,
    source: "none", currency: "BRL", currentPriceBRL: 0, exchangeRate: 1,
    error: "All sources failed",
  };
  return fallbackResult;
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
