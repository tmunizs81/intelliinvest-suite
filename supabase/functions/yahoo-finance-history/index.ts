

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CRYPTO_SET = new Set([
  "BTC","ETH","SOL","ADA","DOT","XRP","BNB","DOGE","LTC","AVAX","MATIC",
  "LINK","UNI","ATOM","NEAR","APT","ARB","OP","SHIB","FIL","ALGO","HBAR",
  "VET","ICP","AAVE","GRT","SAND","MANA","CRV","MKR","RENDER","FET",
  "SUI","SEI","TIA","INJ","PEPE","WIF","BONK","FLOKI","TON","SNX","COMP",
  "ENS","LDO","RPL","IMX","RUNE","BLUR","WLD","PENDLE","JUP","PYTH",
  "ONDO","ENA","STRK","MANTA","DYM","XLM","TRX","EOS","NEO","ZEC","XMR",
  "DASH","BCH","ETC","USDT","USDC","DAI",
  // Ondo Finance RWA
  "OUSG","USDY","OMMF","ROUSG",
  // xStocks by Backed Finance
  "CRCLX","GOOGLX","NVDAX","MSTRX","SPYX","AAPLX","COINX","HOODX",
  "MCDX","AMZNX","TBLLX","IEMGX","IWMX","KRAQX","COPXX","PALLX",
  "AMDX","BTGOX","BMNRX","OPENX","LLYX","NFLXX","GSX","TQQQX",
  "LINX","TMOX","GLDX","APPX","CRWDX","MSFTX","HDX","AVGOX","VTIX",
  "UNHX","JPMX","INTCX","BACX","IBMX","JNJX","HONX","ABBVX","ACNX",
  "CVXX","CRMX","CMCSAX","DHRX","PMX","PEPX","ORCLX","PFEX","XOMX",
  "PLTRX","PGX","TONXX","GMEX","MRKX","ABTX","AZNX","MRVLX","MDTX",
  "CSCOX","KOX","NVOX","DFDVX","AMBRX","MAX","WMTX","SCHFX","BTBTX",
  "IJRX","PPLTX","VX",
]);

// Ondo Global Markets: tokens ending with "on" suffix → fetch underlying
const ONDO_GM_SET = new Set([
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

// Dynamic DB lookup for new Ondo GM tokens
let dynamicOndoHistCache: Map<string, string> | null = null;
let dynamicOndoHistCacheTime = 0;

async function getDynamicOndoUnderlying(ticker: string): Promise<string | null> {
  if (!dynamicOndoHistCache || Date.now() - dynamicOndoHistCacheTime > 600000) {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const resp = await fetch(
        `${supabaseUrl}/rest/v1/ondo_gm_tokens?select=symbol,underlying_ticker`,
        { headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey }, signal: AbortSignal.timeout(5000) }
      );
      if (resp.ok) {
        const rows = await resp.json();
        dynamicOndoHistCache = new Map(rows.map((r: { symbol: string; underlying_ticker: string }) => [r.symbol.toUpperCase(), r.underlying_ticker]));
        dynamicOndoHistCacheTime = Date.now();
      }
    } catch (err) { console.warn("Failed to load dynamic Ondo tokens:", err); }
  }
  return dynamicOndoHistCache?.get(ticker.toUpperCase()) || null;
}

async function mapToYahooTicker(ticker: string): Promise<string> {
  const t = ticker.toUpperCase();
  // Ondo GM: use underlying stock/ETF ticker (hardcoded)
  if (ONDO_GM_SET.has(ticker)) return ticker.replace(/on$/, '');
  const ondoMatch = [...ONDO_GM_SET].find(gm => gm.toUpperCase() === t);
  if (ondoMatch) return ondoMatch.replace(/on$/, '');
  // Ondo GM: dynamic DB fallback
  const dynamicUnderlying = await getDynamicOndoUnderlying(ticker);
  if (dynamicUnderlying) return dynamicUnderlying;
  // Crypto
  if (CRYPTO_SET.has(t)) return `${t}-USD`;
  // Brazilian assets
  if (/^[A-Z0-9]{4,6}\d{1,2}$/.test(t) && !t.includes("-")) return `${t}.SA`;
  return ticker;
}

async function getUsdBrlRate(): Promise<number> {
  try {
    const resp = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/USDBRL=X?interval=1d&range=1d", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {
      const data = await resp.json();
      return data.chart?.result?.[0]?.meta?.regularMarketPrice ?? 5.5;
    }
  } catch { /* fallback */ }
  return 5.5;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticker, range = "6mo", interval = "1d" } = await req.json();

    if (!ticker) {
      return new Response(
        JSON.stringify({ error: "ticker required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isCrypto = CRYPTO_SET.has(ticker.toUpperCase());
    const isOndoGM = ONDO_GM_SET.has(ticker) || !!(await getDynamicOndoUnderlying(ticker));
    const yahooTicker = await mapToYahooTicker(ticker);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=${interval}&range=${range}`;

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      return new Response(
        JSON.stringify({ error: `Yahoo Finance HTTP ${resp.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await resp.json();
    const result = data.chart?.result?.[0];

    if (!result) {
      return new Response(
        JSON.stringify({ error: "No data returned" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const { open, high, low, close, volume } = quote;

    // Get USD/BRL rate for crypto conversion
    const usdBrl = isCrypto ? await getUsdBrlRate() : 1;

    const candles = timestamps.map((ts: number, i: number) => ({
      date: new Date(ts * 1000).toISOString().split("T")[0],
      timestamp: ts,
      open: open?.[i] != null ? Math.round(open[i] * usdBrl * 100) / 100 : null,
      high: high?.[i] != null ? Math.round(high[i] * usdBrl * 100) / 100 : null,
      low: low?.[i] != null ? Math.round(low[i] * usdBrl * 100) / 100 : null,
      close: close?.[i] != null ? Math.round(close[i] * usdBrl * 100) / 100 : null,
      volume: volume?.[i] ?? 0,
    })).filter((c: any) => c.open !== null && c.close !== null);

    const meta = result.meta;

    return new Response(
      JSON.stringify({
        ticker,
        currency: "BRL",
        name: meta?.shortName || meta?.symbol || ticker,
        currentPrice: Math.round((meta?.regularMarketPrice ?? 0) * usdBrl * 100) / 100,
        previousClose: Math.round((meta?.chartPreviousClose ?? meta?.previousClose ?? 0) * usdBrl * 100) / 100,
        candles,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("yahoo-finance-history error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
