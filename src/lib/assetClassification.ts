/**
 * Classifica o tipo de ativo com base no ticker.
 * Ordem de prioridade: tipo explícito > detecção por padrão do ticker.
 */

const CRYPTO_TICKERS = new Set([
  'BTC', 'BITCOIN', 'ETH', 'ETHEREUM', 'BNB', 'SOL', 'SOLANA',
  'ADA', 'CARDANO', 'XRP', 'RIPPLE', 'DOT', 'POLKADOT',
  'DOGE', 'DOGECOIN', 'AVAX', 'MATIC', 'LINK', 'UNI',
  'ATOM', 'LTC', 'LITECOIN', 'NEAR', 'APT', 'ARB', 'OP',
  'USDT', 'USDC', 'DAI', 'BUSD',
  'SHIB', 'FIL', 'ALGO', 'HBAR', 'VET', 'ICP',
  'AAVE', 'GRT', 'SAND', 'MANA', 'CRV', 'MKR',
  'RENDER', 'FET', 'SUI', 'SEI', 'TIA', 'INJ',
  'PEPE', 'WIF', 'BONK', 'FLOKI', 'NOT', 'TON',
  'PENDLE', 'JUP', 'W', 'STRK', 'PYTH', 'JTO',
  'ONDO', 'ENA', 'ETHFI', 'MANTA', 'DYM', 'PIXEL',
  'WLD', 'BLUR', 'IMX', 'RUNE', 'SNX', 'COMP',
  'ENS', 'LDO', 'RPL', 'SSV', 'EIGEN', 'PENDLE',
  'XLM', 'STELLAR', 'TRX', 'TRON', 'EOS', 'NEO',
  'ZEC', 'ZCASH', 'XMR', 'MONERO', 'DASH',
  'BCH', 'ETC',
]);

const ETF_TICKERS_BR = new Set([
  'BOVA11', 'IVVB11', 'SMAL11', 'HASH11', 'IMAB11', 'FIXA11',
  'GOLD11', 'DIVO11', 'ECOO11', 'BOVV11', 'XFIX11', 'MATB11',
  'FIND11', 'PIBB11', 'SPXI11', 'NASD11', 'EURP11', 'ACWI11',
  'ETHE11', 'QBTC11', 'BITI11', 'DEFI11', 'WEB311', 'META11',
  'QDFI11', 'BITH11', 'QETH11', 'SOLH11',
  'IRFM11', 'B5P211', 'IB5M11', 'NTNS11',
]);

// ETFs americanos (NYSE, NASDAQ, CBOE, ARCA)
const US_ETF_TICKERS = new Set([
  // S&P 500
  'SPY', 'VOO', 'IVV', 'SPLG', 'RSP', 'SPYG', 'SPYV',
  // Nasdaq / Tech
  'QQQ', 'QQQM', 'TQQQ', 'SQQQ', 'PSQ', 'QLD',
  // Total Market
  'VTI', 'ITOT', 'SPTM', 'SCHB', 'IWV',
  // Growth / Value
  'VUG', 'IWF', 'VOOG', 'IVW', 'SPYG', 'MGK', 'SCHG', 'RPG',
  'VTV', 'IWD', 'VOOV', 'IVE', 'SPYV', 'MGV', 'SCHV', 'RPV',
  // Small / Mid Cap
  'IWM', 'VB', 'IJR', 'SCHA', 'VXF', 'SLYG', 'SLYV',
  'VO', 'IJH', 'MDY', 'IVOO', 'SCHM',
  'IWO', 'IWN', 'VBK', 'VBR',
  // Dividendos
  'VYM', 'SCHD', 'DVY', 'HDV', 'SPYD', 'SDY', 'DGRW', 'DGRO',
  'NOBL', 'VIG', 'SDOG', 'FDL', 'PEY', 'DIV', 'RDIV',
  // Internacional / Global
  'VEA', 'VXUS', 'EFA', 'IEFA', 'IXUS', 'ACWI', 'VT', 'SPDW',
  'VWO', 'IEMG', 'EEM', 'SPEM', 'SCHE', 'FNDE',
  'EWZ', 'EWJ', 'EWG', 'EWU', 'EWC', 'EWA', 'EWY', 'EWT', 'EWH', 'EWS',
  'FXI', 'KWEB', 'MCHI', 'GXC', 'ASHR', 'CNYA',
  'INDA', 'INDY', 'SMIN', 'PIN',
  'VGK', 'EZU', 'FEZ', 'HEDJ', 'IEUR',
  // Setoriais
  'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLU', 'XLP', 'XLY', 'XLB', 'XLRE', 'XLC',
  'VGT', 'VFH', 'VDE', 'VHT', 'VIS', 'VPU', 'VDC', 'VCR', 'VAW', 'VOX',
  'SMH', 'SOXX', 'XSD', 'IGV', 'SKYY', 'WCLD', 'CLOU', 'HACK', 'BUG', 'CIBR',
  'XBI', 'IBB', 'ARKG', 'GNOM', 'IDNA',
  'IYR', 'XLRE', 'VNQ', 'SCHH', 'RWR', 'ICF', 'USRT', 'REZ',
  'KRE', 'KBE', 'IAI', 'IYF',
  'XOP', 'OIH', 'FCG', 'AMLP', 'MLPA',
  'ITB', 'XHB', 'NAIL',
  'ITA', 'PPA', 'DFEN',
  'TAN', 'ICLN', 'QCLN', 'PBW', 'FAN', 'ACES',
  'MJ', 'MSOS', 'YOLO',
  'JETS', 'AWAY',
  'BETZ', 'BJK',
  'MOO', 'DBA', 'VEGI',
  'GDX', 'GDXJ', 'SIL', 'SILJ',
  'LIT', 'REMX', 'URA', 'URNM', 'PICK',
  'BLOK', 'BITQ', 'BKCH', 'DAPP',
  // ARK / Temáticos
  'ARKK', 'ARKW', 'ARKF', 'ARKG', 'ARKQ', 'ARKX', 'PRNT', 'IZRL',
  'BOTZ', 'ROBO', 'IRBO', 'AIQ', 'AIVL',
  'DRIV', 'IDRV', 'KARS',
  'ESGU', 'ESGV', 'SUSA', 'KRMA', 'VEGN', 'CTRU',
  'HERO', 'GAMR', 'ESPO', 'NERD',
  'GILD', 'OGIG', 'MOON', 'BUZZ', 'FOMO',
  'MTUM', 'QUAL', 'VLUE', 'SIZE', 'USMV', 'EFAV',
  // Renda Fixa / Bonds
  'BND', 'AGG', 'BNDX', 'SCHZ', 'FBND', 'NUBD',
  'TLT', 'IEF', 'SHY', 'GOVT', 'VGIT', 'VGLT', 'VGSH', 'SCHO', 'SCHR',
  'TMF', 'TBT', 'TBF', 'TTT',
  'LQD', 'VCIT', 'IGIB', 'VCSH', 'IGSB', 'SLQD',
  'HYG', 'JNK', 'HYLB', 'USHY', 'SHYG', 'HYLD', 'ANGL', 'PHB',
  'TIP', 'SCHP', 'VTIP', 'STIP',
  'EMB', 'PCY', 'VWOB', 'EMLC',
  'MUB', 'VTEB', 'TFI', 'HYD',
  'SHV', 'BIL', 'SGOV', 'USFR', 'TFLO', 'FLOT', 'FLRN',
  'BKLN', 'SRLN',
  // Commodities
  'GLD', 'IAU', 'SGOL', 'GLDM', 'BAR', 'AAAU', 'OUNZ',
  'SLV', 'SIVR', 'PSLV',
  'USO', 'BNO', 'DBO', 'UCO', 'SCO',
  'UNG', 'BOIL', 'KOLD',
  'DBC', 'PDBC', 'GSG', 'CMDY', 'BCI', 'COMT',
  'PPLT', 'PALL',
  'WEAT', 'CORN', 'SOYB', 'CANE', 'NIB', 'JO', 'CAFE',
  'WOOD', 'CUT',
  // Alavancados / Inversos
  'SPXL', 'SPXS', 'UPRO', 'SDS', 'SH',
  'TQQQ', 'SQQQ', 'QLD', 'PSQ',
  'TNA', 'TZA', 'UWM', 'RWM',
  'SOXL', 'SOXS', 'USD', 'SSO',
  'UDOW', 'SDOW', 'DIA', 'DOG',
  'FAS', 'FAZ',
  'LABU', 'LABD',
  'JNUG', 'JDST', 'NUGT', 'DUST',
  'UVXY', 'SVXY', 'VXX', 'VIXY',
  // Volatilidade / Hedging
  'TAIL', 'SWAN', 'NUSI', 'JEPI', 'JEPQ', 'XYLD', 'QYLD', 'RYLD', 'DIVO',
  // Multi-Asset / Allocation
  'AOR', 'AOA', 'AOM', 'AOK',
  'VBIAX', 'VBINX',
  // Moedas
  'UUP', 'UDN', 'FXE', 'FXY', 'FXB', 'FXA', 'FXC', 'FXF',
  'CYB', 'CEW',
  // Crypto ETFs
  'IBIT', 'FBTC', 'BITB', 'ARKB', 'HODL', 'BRRR', 'EZBC', 'BTCO', 'BTCW', 'GBTC',
  'ETHA', 'ETHV', 'FETH', 'ETHE',
]);

// ETFs alemães (XETRA / Frankfurt .DE)
const DE_ETF_TICKERS = new Set([
  // iShares Core (XETRA)
  'SXR8', 'EUNL', 'IS3N', 'SXRV', 'IUSA', 'IUSN', 'IUSQ', 'IQQH',
  'QDVE', 'SXRJ', 'SXRT', 'SXRS', 'IBC0', 'IBCI', 'EXX5',
  'CSNDX', 'EXXT', 'EXV6', 'EXH1', 'EXHE', 'EXSA', 'EXS1',
  // iShares Sector & Thematic (XETRA)
  'IQQW', 'IQQQ', 'IQQP', 'IQQ0', 'IQQL', 'IQQM', 'IQQE',
  'IS3S', 'IS3C', 'IS3R', 'IS3Q', 'IS3U', 'IS3L', 'IS3V',
  'SXRG', 'SXRH', 'SXRI', 'SXRK', 'SXRL', 'SXRM', 'SXRN',
  'QDVK', 'QDVJ', 'QDVI', 'QDVH', 'QDVG', 'QDVF',
  // iShares Bond (XETRA)
  'IBGS', 'IBGM', 'IBGL', 'IBTS', 'IBTM', 'IBTL',
  'EUN5', 'EUNR', 'EUNS', 'EUN4', 'EUN8', 'EUN9',
  'EUNH', 'EUNB', 'EUNC', 'EUND',
  'IGES', 'IGEL', 'IGEM',
  'IHYG', 'IBC0', 'IBCI', 'IBCE', 'IB01',
  'IUSP', 'IUSV', 'IUSW',
  // iShares Regional (XETRA)
  'IS3S', 'IBC6', 'IUSD', 'IUSE', 'IUSF',
  'IQQB', 'IQQA', 'IQQC', 'IQQD',
  // Vanguard (XETRA)
  'VWCE', 'VGWL', 'VUSA', 'VUAA', 'V3AA', 'V3AB',
  'VFEM', 'VDEM', 'VDPX', 'VDJP', 'VDEU',
  'VGOV', 'VGEM', 'VAGU', 'VAGP', 'VDTY', 'VUTY',
  'VUCP', 'VUCE', 'VETY', 'VECP',
  'VHYL', 'VGEL', 'VDNR',
  'V80A', 'V60A', 'V40A', 'V20A',
  // Xtrackers / DWS (XETRA)
  'DBXD', 'XDWD', 'XDWL', 'XMME', 'XDEM', 'XDEW',
  'DBXJ', 'DBXE', 'XDJP', 'XDPD', 'XQUI',
  'XD9U', 'XDWT', 'XDWS', 'XDWM', 'XDWH', 'XDWG',
  'XDEB', 'XDEE', 'XDEP', 'XDES', 'XDET',
  'DBZB', 'DBXG', 'DBXH', 'DBXN', 'DBXF',
  'XCS6', 'XCHA', 'XDWF', 'XDWI',
  'XSGI', 'XSGL', 'XSGM', 'XSGN',
  'XACT', 'XAUS', 'XDAX', 'XMTD', 'XMTG', 'XMTH',
  // Amundi / Lyxor (XETRA)
  'LYMS', 'LYP6', 'LYPS', 'LYPQ',
  'LYYA', 'LYYB', 'LYYC', 'LYYD', 'LYYE',
  'L100', 'LCWD', 'LMWE', 'LMWI', 'LMWP',
  'C060', 'C070', 'C080', 'C090',
  'AEEM', 'AEMD', 'AEXK', 'AMEW', 'AMEM', 'AMEU',
  '18MK', '18M2', '10AJ',
  // SPDR (XETRA)
  'SPPW', 'SPY4', 'SPY5', 'SPYD', 'SPPE', 'SPPS', 'SPPJ',
  'SYBS', 'SYBQ', 'SYBJ', 'SYBM', 'SYBW', 'SYBF',
  'ZPRS', 'ZPRE', 'ZPRX', 'ZPRV', 'ZPRG',
  // Invesco (XETRA)
  'EQQQ', 'MQUS', 'MXUS', 'MXWO', 'MXFS',
  'SMCX', 'SMLX', 'S500', 'SPXP',
  // WisdomTree (XETRA)
  'PHAU', 'PHAG', 'PHPT', 'PHPM',
  'WGLD', 'WSLV', 'WCOB', 'WCRB',
  'WT5G', 'WTAI', 'WTCH', 'WTEC',
  // VanEck (XETRA)
  'TDIV', 'TGET', 'TGBT', 'TSMM', 'TSWE', 'TRET',
  'SMGW', 'SMHG', 'SMHI', 'SMHJ', 'SMHK',
  // Deka (XETRA)
  'EL4A', 'EL4B', 'EL4C', 'EL4D', 'EL4E', 'EL4F', 'EL4G',
  'EL4X', 'EL4Z', 'ETFL01', 'ETFL02', 'ETFL07', 'ETFL23',
  // ComStage / BNP Paribas (XETRA)
  'CBSX', 'CBDX', 'CBEF', 'CBES', 'CBEM',
  // UBS (XETRA)
  'UIM6', 'UIM2', 'UIM5', 'UIM1', 'UBSG',
  // Commodities / Crypto ETP (XETRA)
  'BTCE', 'BTHE', 'BTCS', 'ETHW', 'SOLW',
  'XGLD', 'XSLV', '4GLD', 'EUWX', 'PPFB',
  // DAX / MDAX / SDAX Index ETFs
  'DBXD', 'EXSA', 'EXS1', 'DAXEX', 'MDAX', 'SDAX',
  'EXSC', 'EXSD', 'EXSB',
  // ESG / Climate (XETRA)
  'IS3S', 'IS3C', 'IS3R', 'SXRG',
  'XZMU', 'XZMG', 'XZEM', 'XZEP',
  'XMLD', 'XMLE', 'XMLF',
  // Multi-Factor (XETRA)
  'IS3Q', 'IS3U', 'IS3V', 'IQQL',
  'XDEM', 'XDEW', 'XQUI',
  // Dividends (XETRA)
  'TDIV', 'ISPA', 'EXXT', 'ZPRX', 'ZPRE',
  'SPYD', 'VHYL',
]);

// ETFs irlandeses (Euronext Dublin / Irish Stock Exchange .IR)
const IE_ETF_TICKERS = new Set([
  // iShares Core (Dublin-domiciled, UCITS)
  'CSPX_IR', 'IWDA_IR', 'EIMI_IR', 'SWDA_IR', 'ISAC_IR',
  'IEMA_IR', 'EMIM_IR', 'IWRD_IR',
  // iShares S&P 500
  'IUSA_IR', 'IUAA_IR', 'IUIT_IR', 'IUSG_IR', 'IUSV_IR',
  // iShares MSCI World
  'SWRD', 'SSAC', 'SMMD', 'WSML',
  // iShares Bond
  'IGLA', 'DTLA', 'IDTL_IR', 'LQDA', 'SUOA', 'IGLO',
  'AGGA', 'AGGU', 'IEAA_IR', 'IEAC_IR',
  'IEGA_IR', 'IEGZ_IR', 'IHYA', 'SHYA',
  'IUAA_IR', 'IUAB', 'IUAC',
  // iShares Sector
  'IUIT_IR', 'IUHC', 'IUFS_IR', 'IUES_IR',
  'IUCD_IR', 'IUCS_IR', 'ICUS_IR',
  // iShares ESG
  'SAWD_IR', 'SAEM_IR', 'SAUS_IR', 'SUWS_IR', 'SUEU_IR',
  // iShares Thematic
  'DGTL_IR', 'HEAL_IR', 'RBOT_IR', 'ECAR_IR',
  'INRG_IR', 'ISPY_IR',
  // Vanguard (Ireland-domiciled)
  'VWRA_IR', 'VWRL_IR', 'VUAA_IR', 'VUSA_IR',
  'VFEM_IR', 'VDEM_IR', 'VEVE_IR', 'VHYL_IR',
  'VAGF_IR', 'VERX_IR', 'VJPN_IR', 'VAPX_IR',
  'VDNR_IR', 'VDPX_IR', 'VDJP_IR', 'VDEU_IR',
  'VGOV_IR', 'VGEM_IR', 'VAGU_IR', 'VAGP_IR',
  'VUAG_IR', 'VERG_IR',
  // SPDR (Ireland-domiciled)
  'SPY5_IR', 'SPMV_IR', 'SPPW_IR',
  'SYBQ_IR', 'SYBS_IR', 'SYBJ_IR', 'SYBM_IR',
  'GLCO_IR', 'GLAG_IR',
  // Invesco (Ireland)
  'EQQQ_IR', 'S500_IR', 'SPXP_IR',
  // Amundi (Ireland)
  'IWQU', 'MWRD_IR', 'LCUW', 'PRAW', 'PRAU',
  // Goldman Sachs
  'GSPY', 'GSDE', 'GSEU', 'GSEM',
  // JPMorgan
  'JEGA', 'JEGP', 'JPGL', 'JPEI', 'JPEA',
  // HSBC
  'HMWO_IR', 'HMEF_IR', 'HPRO', 'HPRD',
  // First Trust
  'FTUQ', 'FTEC', 'FTAL',
]);

// ETFs suíços (SIX Swiss Exchange .SW)
const CH_ETF_TICKERS = new Set([
  // iShares (SIX)
  'CSSPX', 'CSSMI', 'CSSMIM', 'CSINDU', 'CSNDX_SW', 'CSEMUS',
  'CHSPI', 'CSSX5E', 'CSMIB', 'CSDAX', 'CSBGAG',
  'CSEMAS', 'CSESGC', 'CSESGM',
  // UBS ETFs (SIX - major Swiss provider)
  'UBSG_SW', 'UBSN', 'SPICHA', 'SMIMCHA', 'SMCHA',
  'SMMCHA', 'SLICHA', 'CHFCHA', 'SBIDOM', 'SBIDOC',
  'CHCORP', 'CHGOVT', 'UCHIMF',
  'UIMR', 'UIMS', 'UIMP', 'UIMQ', 'UIMW',
  'UEFR', 'UEFS', 'UEFP', 'UEFQ',
  'EMMCHA', 'ACWISG', 'MSCISG',
  'USEQSG', 'EURQSG', 'JAPQSG', 'PACQSG', 'CANQSG',
  // Vanguard (SIX)
  'VWRL_SW', 'VUAA_SW', 'VUSA_SW', 'VWCE_SW',
  'VFEM_SW', 'VHYL_SW', 'VEVE_SW',
  'VGOV_SW', 'VAGU_SW', 'VUTY_SW',
  // Xtrackers (SIX)
  'XSMI', 'XMTD_SW', 'XDWD_SW', 'XDWL_SW',
  'XMME_SW', 'XDEW_SW', 'XDEM_SW',
  // Amundi (SIX)
  'SWMCI', 'SUSA_SW', 'SESG', 'SMSG',
  // Invesco (SIX)
  'EQQQ_SW', 'S500_SW', 'SPXS_SW',
  // WisdomTree (SIX)
  'WTCH_SW', 'WGLD_SW', 'PHAU_SW', 'PHAG_SW',
  // ZKB (Zürcher Kantonalbank - Swiss-specific)
  'ZKBGO', 'ZKBSI', 'ZKBSM', 'ZKBSW', 'ZKBSP',
  'ZKBEN', 'ZKBEW', 'ZKBEM',
  // Swisscanto
  'SWICHA', 'SWIESG', 'SWICAS', 'SWICAU',
  // Julius Baer
  'JBSMF', 'JBGLF', 'JBCHF',
  // SPI / SMI Index ETFs
  'SPIEX', 'SMIEX', 'SMMEX', 'SLIEX',
  // Swiss Commodities
  'ZGLD', 'ZPAL', 'ZPLA', 'ZSIL',
  'JBGOCA', 'JBSICA',
  // Swiss Real Estate
  'SRFCHA', 'SRECHA', 'SWIIT', 'SREGA',
]);

// REITs americanos
const REIT_TICKERS = new Set([
  // Diversified
  'O', 'VICI', 'WPC', 'STORE', 'NNN', 'EPRT', 'ADC', 'FCPT', 'GTY', 'NTST',
  // Data Centers
  'EQIX', 'DLR', 'AMT', 'CCI', 'SBAC', 'UNIT',
  // Industrial
  'PLD', 'REXR', 'STAG', 'FR', 'EGP', 'TRNO', 'COLD', 'IIPR',
  // Residential
  'AVB', 'EQR', 'MAA', 'UDR', 'CPT', 'ESS', 'INVH', 'AMH', 'NXRT', 'APTS',
  // Healthcare
  'WELL', 'VTR', 'OHI', 'HR', 'PEAK', 'DOC', 'MPW', 'SBRA', 'LTC', 'CTRE', 'NHI',
  // Office
  'BXP', 'VNO', 'SLG', 'KRC', 'HIW', 'ARE', 'DEI', 'CUZ', 'JBGS', 'PDM', 'OFC',
  // Retail
  'SPG', 'MAC', 'KIM', 'REG', 'FRT', 'BRX', 'AKR', 'ROIC', 'SITC', 'SKT', 'RPAI',
  'NRG', 'PECO', 'KITE', 'JBGS',
  // Hotel / Hospitality
  'HST', 'RHP', 'PK', 'SHO', 'DRH', 'RLJ', 'XHR', 'APLE', 'INN', 'PEB', 'HT',
  // Self-Storage
  'PSA', 'EXR', 'CUBE', 'LSI', 'NSA', 'REXR',
  // Specialty
  'GLPI', 'MGP', 'CTO', 'SAFE', 'SRC', 'LAND', 'FPI', 'PINE',
  'IRM', 'LAMR', 'OUT', 'UNIT', 'SBAC', 'WPTC',
  // Timber
  'RYN', 'PCH', 'PotlatchDeltic',
  // Mortgage REITs
  'AGNC', 'NLY', 'STWD', 'BXMT', 'ARI', 'TPVG', 'RC', 'TWO', 'MFA', 'CIM',
  'RITM', 'KREF', 'LADR', 'GPMT', 'PMT', 'NYMT', 'MITT', 'DX', 'HFRO',
  // Infrastructure
  'AMT', 'CCI', 'SBAC', 'UNITI', 'LMRK', 'CORR',
]);

export function classifyAssetType(ticker: string, explicitType?: string): string {
  // Se já tem tipo explícito válido, usa ele
  if (explicitType && explicitType !== 'Ação') return explicitType;
  if (explicitType === 'Cripto' || explicitType === 'Crypto') return 'Cripto';

  const t = ticker.toUpperCase().trim();

  // 1. Cripto (por nome)
  if (CRYPTO_TICKERS.has(t)) return 'Cripto';

  // 2. ETF brasileiro específico
  if (ETF_TICKERS_BR.has(t)) return 'ETF';

  // 3. ETF americano (NYSE, NASDAQ, ARCA, CBOE)
  if (US_ETF_TICKERS.has(t)) return 'ETF Internacional';

  // 3b. ETF alemão (XETRA / Frankfurt)
  if (DE_ETF_TICKERS.has(t)) return 'ETF Internacional';

  // 3c. ETF irlandês (Euronext Dublin)
  if (IE_ETF_TICKERS.has(t)) return 'ETF Internacional';

  // 3d. ETF suíço (SIX Swiss Exchange)
  if (CH_ETF_TICKERS.has(t)) return 'ETF Internacional';

  // 4. REIT americano
  if (REIT_TICKERS.has(t)) return 'REIT';

  // 5. ETF Internacional europeu (sufixo .L, .DE, .AS, .PA, .MI, .SW, .IR)
  if (/\.(L|DE|AS|PA|MI|SW|IR)$/.test(t)) return 'ETF Internacional';

  // 6. FII (padrão XXXX11)
  if (/^[A-Z]{4}11$/.test(t)) return 'FII';

  // 7. BDR (padrão XXXX34, XXXX35, XXXX39)
  if (/^[A-Z]{4}(34|35|39)$/.test(t)) return 'BDR';

  // 8. Ação brasileira (padrão XXXX3, XXXX4, XXXX5, XXXX6, etc.)
  if (/^[A-Z]{4}\d{1,2}$/.test(t)) return 'Ação';

  // 9. Renda Fixa (prefixos conhecidos)
  if (/^(TESOURO|CDB|LCI|LCA|CRI|CRA|DEB)/i.test(t)) return 'Renda Fixa';

  // 10. Se não bate com nada, provavelmente é internacional ou cripto
  if (/^[A-Z]{2,5}$/.test(t) && t.length <= 4 && CRYPTO_TICKERS.has(t)) return 'Cripto';

  // 11. Se tem tipo explícito "Ação" e passou por tudo, mantém
  if (explicitType === 'Ação') return 'Ação';

  // 12. Default: se não tem número, pode ser internacional
  if (!/\d/.test(t)) return 'Internacional';

  return 'Ação';
}
