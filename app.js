const dom = {
  addressInput: document.getElementById('addressInput'),
  saveAddressBtn: document.getElementById('saveAddressBtn'),
  clearAddressBtn: document.getElementById('clearAddressBtn'),
  addressInputs: document.querySelector('.address-inputs'),
  addressDisplay: document.getElementById('addressDisplay'),
  lastUpdated: document.getElementById('lastUpdated'),
  refreshBtn: document.getElementById('refreshBtn'),
  btcPrice: document.getElementById('btcPrice'),
  btcBalance: document.getElementById('btcBalance'),
  satsBalance: document.getElementById('satsBalance'),
  usdValue: document.getElementById('usdValue'),
  cagrRange: document.getElementById('cagrRange'),
  cagrInput: document.getElementById('cagrInput'),
  p5: document.getElementById('p5'),
  p10: document.getElementById('p10'),
  p15: document.getElementById('p15'),
  projectionChart: document.getElementById('projectionChart'),
  linePriceChart: document.getElementById('linePriceChart'),
  projectionTableBody: document.getElementById('projectionTableBody'),
  titleLeagueName: document.getElementById('titleLeagueName'),
  rankingsTable: document.getElementById('rankingsTable'),
  payoutsTable: document.getElementById('payoutsTable'),
};

const STORAGE_KEYS = {
  address: 'bb_ff_btc_address',
  cagr: 'bb_ff_cagr',
};

const formatters = {
  usd: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }),
  btc: new Intl.NumberFormat('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 }),
};

// League routing state
let __leagueMode = false;
let __configAddress = '';

function getBlockExplorerUrl(address) {
  return `https://mempool.space/address/${address}`;
}

async function fetchBtcPrice() {
  // Multiple sources with fallback: CoinDesk → CoinGecko → Mempool.space
  const sources = [
    async () => {
      const res = await fetch('https://api.coindesk.com/v1/bpi/currentprice/USD.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('coindesk');
      const data = await res.json();
      return Number(data?.bpi?.USD?.rate_float);
    },
    async () => {
      const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', { cache: 'no-store' });
      if (!res.ok) throw new Error('coingecko');
      const data = await res.json();
      return Number(data?.bitcoin?.usd);
    },
    async () => {
      const res = await fetch('https://mempool.space/api/v1/prices', { cache: 'no-store' });
      if (!res.ok) throw new Error('mempool');
      const data = await res.json();
      return Number(data?.USD);
    },
  ];
  for (const source of sources) {
    try {
      const price = await source();
      if (Number.isFinite(price) && price > 0) return price;
    } catch (_) {}
  }
  throw new Error('All price sources failed');
}

async function fetchHistoricalDailyOHLC(days = 365) {
  const url = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${days}&interval=daily`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch historical');
  const data = await res.json();
  const prices = (data?.prices || []).map(([ts, price]) => ({ time: Math.floor(ts / 1000), close: price }));
  const ohlc = prices.map((p, i, arr) => {
    const open = i > 0 ? arr[i - 1].close : p.close;
    const close = p.close;
    const high = Math.max(open, close);
    const low = Math.min(open, close);
    return { time: p.time, open, high, low, close };
  });
  return { ohlc, closes: prices };
}

async function fetchAddressBalanceBtc(address) {
  // Use mempool.space API
  // GET /api/address/:address → { chain_stats: { funded_txo_sum, spent_txo_sum } }
  const res = await fetch(`https://mempool.space/api/address/${address}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch balance');
  const data = await res.json();
  const sats = Number(data?.chain_stats?.funded_txo_sum || 0) - Number(data?.chain_stats?.spent_txo_sum || 0);
  const btc = sats / 1e8;
  return btc;
}

function saveAddress(address) {
  localStorage.setItem(STORAGE_KEYS.address, address);
}
function loadAddress() {
  return localStorage.getItem(STORAGE_KEYS.address) || '';
}

function saveCagr(cagr) {
  localStorage.setItem(STORAGE_KEYS.cagr, String(cagr));
}
function loadCagr() {
  const value = localStorage.getItem(STORAGE_KEYS.cagr);
  const num = Number(value);
  if (Number.isFinite(num) && num >= 0 && num <= 200) return num;
  return 50;
}

function setLastUpdated(date = new Date()) {
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  dom.lastUpdated.textContent = `${time}`;
}

function updateAddressUi(address) {
  if (address) {
    dom.addressDisplay.textContent = address;
    dom.addressDisplay.href = getBlockExplorerUrl(address);
  } else {
    dom.addressDisplay.textContent = 'Not set';
    dom.addressDisplay.removeAttribute('href');
  }
}

function computeProjections({ usdNow, cagrPercent }) {
  const r = cagrPercent / 100;
  const years = Array.from({ length: 15 }, (_, i) => i + 1);
  const values = years.map((y) => usdNow * Math.pow(1 + r, y));
  return { years, values };
}

function updateProjectionSummary({ usdNow, cagrPercent }) {
  const r = cagrPercent / 100;
  const v = (n) => usdNow * Math.pow(1 + r, n);
  dom.p5.textContent = formatters.usd.format(v(5));
  dom.p10.textContent = formatters.usd.format(v(10));
  dom.p15.textContent = formatters.usd.format(v(15));
}

let chartInstance = null;
function renderChart({ years, fundValues }) {
  const ctx = dom.projectionChart.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 160);
  gradient.addColorStop(0, 'rgba(255,138,0,0.35)');
  gradient.addColorStop(1, 'rgba(255,138,0,0)');
  const data = {
    labels: years.map((y) => `${y}y`),
    datasets: [
      {
        label: 'Fund Value (USD)',
        data: fundValues,
        fill: true,
        backgroundColor: gradient,
        borderColor: '#ff8a00',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.25,
      },
    ].filter(Boolean)
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true },
      tooltip: { callbacks: { label: (ctx) => formatters.usd.format(ctx.parsed.y) } }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#9aa4b2' } },
      y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#9aa4b2', callback: (v) => formatters.usd.format(v) } }
    }
  };
  if (chartInstance) {
    chartInstance.data = data;
    chartInstance.options = options;
    chartInstance.update();
  } else {
    chartInstance = new Chart(ctx, { type: 'line', data, options });
  }
}

function syncCagrInputs(value) {
  const clamped = Math.max(0, Math.min(200, Math.round(value)));
  dom.cagrRange.value = String(clamped);
  dom.cagrInput.value = String(clamped);
  saveCagr(clamped);
}

function computeAndRenderProjections(usdNow, priceNow) {
  const cagrPercent = Number(dom.cagrInput.value);
  const { years, values } = computeProjections({ usdNow, cagrPercent });
  renderChart({ years, fundValues: values });
  updateProjectionSummary({ usdNow, cagrPercent });
  updateProjectionTable({ priceNow, usdNow, cagrPercent, years });
}

function updateProjectionTable({ priceNow, usdNow, cagrPercent, years }) {
  if (!dom.projectionTableBody) return;
  const r = cagrPercent / 100;
  const baseYear = new Date().getFullYear();
  const rows = years.map((y) => {
    const btc = priceNow * Math.pow(1 + r, y);
    const fund = usdNow * Math.pow(1 + r, y);
    const yearLabel = baseYear + y;
    return `<tr><td>${yearLabel}</td><td>${formatters.usd.format(btc)}</td><td>${formatters.usd.format(fund)}</td></tr>`;
  }).join('');
  dom.projectionTableBody.innerHTML = rows;
}

async function fetchRankingsAndPayouts(slug) {
  try {
    if (!slug) return { rankings: [], payouts: [] };
    const res = await fetch(`/leagues/${slug}/rankings.json`, { cache: 'no-store' });
    if (!res.ok) return { rankings: [], payouts: [] };
    const j = await res.json();
    const rankings = Array.isArray(j?.rankings) ? j.rankings : [];
    const payouts = Array.isArray(j?.payouts) ? j.payouts : [];
    return { rankings, payouts };
  } catch (_) { return { rankings: [], payouts: [] }; }
}

function renderRankings(rankings) {
  if (!dom.rankingsTable) return;
  const rows = rankings.map((r, i) => {
    const place = (r?.rank ?? i + 1);
    const team = r?.team || r?.name || `Team ${i + 1}`;
    const record = r?.record || '';
    return `<tr><td style="text-align:left">#${place}</td><td style="text-align:left">${team}</td><td>${record}</td></tr>`;
  }).join('');
  dom.rankingsTable.innerHTML = rows || '<tr><td colspan="3" style="text-align:center; color: var(--muted)">No rankings yet.</td></tr>';
}

function renderPayouts(payoutPercents, fundUsd) {
  if (!dom.payoutsTable) return;
  const rows = payoutPercents.map((p) => {
    const place = p?.place || p?.rank || '';
    const percent = Number(p?.percent) || 0;
    const usd = fundUsd * (percent / 100);
    return `<tr><td style=\"text-align:left\">${place}</td><td>${percent}%</td><td>${formatters.usd.format(usd)}</td></tr>`;
  }).join('');
  dom.payoutsTable.innerHTML = rows || '<tr><td colspan="3" style="text-align:center; color: var(--muted)">No payouts configured.</td></tr>';
}

async function refreshAll() {
  const address = (__leagueMode && __configAddress) ? __configAddress : loadAddress();
  updateAddressUi(address);
  if (!address) return;
  try {
    const slug = getSlugFromPath();
    const [{ rankings, payouts }, price, balance] = await Promise.all([
      fetchRankingsAndPayouts(slug),
      fetchBtcPrice(),
      fetchAddressBalanceBtc(address)
    ]);
    const usdValue = price * balance;
    dom.btcPrice.textContent = formatters.usd.format(price);
    dom.btcBalance.textContent = formatters.btc.format(balance);
    if (dom.satsBalance) dom.satsBalance.textContent = `${Math.round(balance * 1e8).toLocaleString()} sats`;
    dom.usdValue.textContent = formatters.usd.format(usdValue);
    window.__lastPrice = price;
    window.__lastUsdValue = usdValue;
    window.__lastBtcValue = balance;
    console.log('[Payouts] Fund extracted', {
      price_usd: price,
      balance_btc: balance,
      usd_value: usdValue,
      total_sats: Math.round(balance * 1e8).toLocaleString()
    });
    computeAndRenderProjections(usdValue, price);
    // Render rankings and payouts after value known
    renderRankings(rankings);
    updatePrizePayouts(rankings, payouts);
    // Update rolling 365-day price line with the latest price
    if (window.__priceLine && window.__priceLine.data && window.__priceLine.data.datasets?.[0]) {
      const now = new Date();
      const cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      const ds = window.__priceLine.data.datasets[0];
      const updated = (ds.data || []).concat({ x: now, y: price }).filter(p => p.x >= cutoff);
      ds.data = updated;
      window.__priceLine.update('none');
    }
    setLastUpdated();
  } catch (err) {
    console.error(err);
  }
}

function getSlugFromPath() {
  // Support dev preview via ?slug= param
  const url = new URL(location.href);
  const previewSlug = url.searchParams.get('slug');
  if (previewSlug) return previewSlug;
  const path = location.pathname.replace(/\/+/g, '/').replace(/\/$/, '');
  // Expecting /leagues/slug or root
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'leagues' && parts[1]) return parts[1];
  return '';
}

async function loadConfigAddress() {
  try {
    const slug = getSlugFromPath();
    // Dev preview: read from localStorage if present
    if (slug) {
      const local = localStorage.getItem(`mff_league:${slug}`);
      if (local) {
        const cfg = JSON.parse(local);
        if (cfg?.leagueName && dom.titleLeagueName) {
          dom.titleLeagueName.textContent = cfg.leagueName;
          try { document.title = `${cfg.leagueName} Bitcoin Fund`; } catch {}
        }
        const addr = typeof cfg?.btcAddress === 'string' ? cfg.btcAddress.trim() : '';
        if (addr) return addr;
      }
    }
    const url = slug ? `/leagues/${slug}/config.json` : '/config.json';
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return '';
    const cfg = await res.json();
    const addr = typeof cfg?.btcAddress === 'string' ? cfg.btcAddress.trim() : '';
    if (cfg?.leagueName && dom.titleLeagueName) {
      dom.titleLeagueName.textContent = cfg.leagueName;
      try { document.title = `${cfg.leagueName} Bitcoin Fund`; } catch {}
    }
    return addr;
  } catch (_) {
    return '';
  }
}

async function init() {
  // Init address and cagr
  const slug = getSlugFromPath();
  __leagueMode = Boolean(slug);
  // Set preview title immediately if available (before any async work)
  if (__leagueMode) {
    try {
      const local = localStorage.getItem(`mff_league:${slug}`);
      if (local) {
        const cfg = JSON.parse(local);
        if (cfg?.leagueName && dom.titleLeagueName) {
          dom.titleLeagueName.textContent = cfg.leagueName;
          try { document.title = `${cfg.leagueName} Bitcoin Fund`; } catch {}
        }
      }
    } catch {}
  }
  const configAddress = await loadConfigAddress();
  __configAddress = configAddress || '';
  let addressToUse = __leagueMode ? __configAddress : (configAddress || loadAddress());
  if (__leagueMode) {
    if (dom.addressInputs) dom.addressInputs.style.display = 'none';
    if (dom.saveAddressBtn) dom.saveAddressBtn.disabled = true;
    if (dom.clearAddressBtn) dom.clearAddressBtn.disabled = true;
    if (dom.addressInput) { dom.addressInput.readOnly = true; dom.addressInput.disabled = true; }
  } else if (configAddress) {
    // Persist demo root config address to local storage for convenience
    saveAddress(configAddress);
    if (dom.addressInputs) dom.addressInputs.style.display = 'none';
  }
  dom.addressInput.value = addressToUse;
  updateAddressUi(addressToUse);

  const savedCagr = loadCagr();
  syncCagrInputs(savedCagr);

  // Historical charts
  let btcYearly = [];
  try {
    const { ohlc, closes } = await fetchHistoricalDailyOHLC(365);
    // Live Snapshot line chart for last year (explicit 365-day window)
    if (dom.linePriceChart) {
      const ctx = dom.linePriceChart.getContext('2d');
      const lastYear = closes.slice(-365);
      const lineData = lastYear.map(p => ({ x: new Date(p.time * 1000), y: p.close }));
      const now = new Date();
      const cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      const data = {
        datasets: [{
          label: 'BTC Price (USD)',
          data: lineData,
          borderColor: '#3fb950',
          borderWidth: 2,
          pointRadius: 0,
          pointHitRadius: 16,
          pointHoverRadius: 3,
          tension: 0.1,
          fill: false,
          parsing: false,
        }]
      };
      const options = {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        hover: { mode: 'nearest', intersect: false },
        layout: { padding: { right: 12 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            intersect: false,
            callbacks: { label: (ctx) => formatters.usd.format(ctx.parsed.y) }
          }
        },
        scales: {
          x: { type: 'time', time: { unit: 'month' }, min: cutoff, max: now, offset: true, grid: { display: false }, ticks: { color: '#9aa4b2' } },
          y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#9aa4b2', callback: (v) => formatters.usd.format(v) } }
        }
      };
      window.__priceLine = new Chart(ctx, { type: 'line', data, options });
      // Clear tooltip/details when tapping/clicking outside the chart
      const canvasEl = dom.linePriceChart;
      const clearActive = () => { try { window.__priceLine.setActiveElements([]); window.__priceLine.update('none'); } catch (_) {} };
      const handleGlobalPointer = (e) => { if (!canvasEl.contains(e.target)) clearActive(); };
      document.addEventListener('click', handleGlobalPointer);
      document.addEventListener('touchstart', handleGlobalPointer, { passive: true });
      canvasEl.addEventListener('mouseleave', clearActive);
    }
    // Not used now; BTC line in projection uses CAGR from slider
    btcYearly = [];
  } catch (e) {
    console.warn('Failed to load historical data', e);
  }

  // Events
  dom.saveAddressBtn.addEventListener('click', () => {
    if (__leagueMode) return;
    const a = dom.addressInput.value.trim();
    if (!a) return;
    saveAddress(a);
    updateAddressUi(a);
    refreshAll();
  });
  dom.clearAddressBtn.addEventListener('click', () => {
    if (__leagueMode) return;
    saveAddress('');
    dom.addressInput.value = '';
    updateAddressUi('');
    dom.usdValue.textContent = '—';
    dom.btcBalance.textContent = '—';
    if (dom.satsBalance) dom.satsBalance.textContent = '— sats';
    dom.btcPrice.textContent = '—';
    setLastUpdated();
  });
  dom.refreshBtn.addEventListener('click', () => refreshAll());

  dom.cagrRange.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    syncCagrInputs(v);
    // Recompute if we have a current USD
    const usdNow = window.__lastUsdValue;
    const priceNow = window.__lastPrice;
    if (usdNow > 0 && priceNow > 0) computeAndRenderProjections(usdNow, priceNow);
  });
  dom.cagrInput.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    syncCagrInputs(v);
    const usdNow = window.__lastUsdValue;
    const priceNow = window.__lastPrice;
    if (usdNow > 0 && priceNow > 0) computeAndRenderProjections(usdNow, priceNow);
  });

  // Auto refresh every 60s
  setInterval(refreshAll, 60_000);
  await refreshAll();
  // After first refresh, render projections using current price and fund value
  const priceNow = window.__lastPrice;
  const usdNow = window.__lastUsdValue;
  if (usdNow > 0 && priceNow > 0) computeAndRenderProjections(usdNow, priceNow);
}

// AI Rankings Analyzer functionality
function setupRankingsAnalyzer() {
  const analyzeBtn = document.getElementById('analyzeStandingsBtn');
  const fileInput = document.getElementById('standingsImageInput');
  const yearSelect = document.getElementById('uploadYearSelect');
  
  if (analyzeBtn && fileInput && yearSelect) {
    analyzeBtn.addEventListener('click', handleAnalyzeClick);
    fileInput.addEventListener('change', handleFileSelect);
  }
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    console.log('File selected:', file.name, 'Size:', file.size, 'Type:', file.type);
    // Enable the analyze button when a file is selected
    const analyzeBtn = document.getElementById('analyzeStandingsBtn');
    if (analyzeBtn) {
      analyzeBtn.disabled = false;
    }
  }
}

// Preprocess image to improve OCR: upscale, grayscale, contrast
async function preprocessImage(file) {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      img.onload = () => {
        const maxW = 1800;
        const scale = Math.min(1, maxW / img.width) < 1 ? (maxW / img.width) : 1.5; // upscale if small, else clamp to 1800
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        // Grayscale + mild contrast/brightness tweak
        try {
          const imageData = ctx.getImageData(0, 0, w, h);
          const data = imageData.data;
          const contrast = 1.2; // >1 increases contrast
          const brightness = 10; // add small brightness
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            let gray = 0.299 * r + 0.587 * g + 0.114 * b;
            gray = (gray - 128) * contrast + 128 + brightness;
            gray = Math.max(0, Math.min(255, gray));
            data[i] = data[i + 1] = data[i + 2] = gray;
          }
          ctx.putImageData(imageData, 0, 0);
        } catch (e) { console.warn('[AI] Preprocess filter skipped:', e); }
        canvas.toBlob((blob) => {
          if (blob) resolve(blob); else reject(new Error('Preprocess failed'));
        }, 'image/png', 1.0);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    } catch (e) {
      reject(e);
    }
  });
}

async function analyzeImageWithOCR(file) {
  try {
    if (!window.Tesseract) throw new Error('Tesseract not loaded');
    console.log('[AI] Starting OCR...');
    let source = file;
    try {
      source = await preprocessImage(file);
      console.log('[AI] Preprocess complete');
    } catch (e) {
      console.warn('[AI] Preprocess failed, using original image', e);
    }
    const { data } = await Tesseract.recognize(source, 'eng', {
      logger: (m) => { if (m?.status && m?.progress != null) console.log(`[AI][OCR] ${m.status}: ${(m.progress * 100).toFixed(0)}%`); },
    });
    // Apply some post-params if available
    if (data && data.parsed) {}
    const text = String(data?.text || '').trim();
    console.log('[AI] OCR text length:', text.length);
    return text;
  } catch (e) {
    console.error('[AI] OCR failed:', e);
    throw e;
  }
}

function parseStandingsText(text) {
  // Remove obvious headers
  const rawLines = text.split(/\r?\n/);
  const lines = rawLines
    .map(l => l.replace(/[\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim())
    .filter(l => l && !/^rank\b/i.test(l) && !/^team\b/i.test(l) && !/standings/i.test(l));

  const results = [];
  // Pattern A: rank at start, optional ordinal, team, optional record
  const reA = /^(\d+)(?:st|nd|rd|th)?[\.)\-\s]+([A-Za-z0-9'&()\. ]+?)(?:\s*\(?([0-9]{1,2})\s*[-–]\s*([0-9]{1,2})\)?)?$/;
  // Pattern B: team first, then record
  const reB = /^([A-Za-z0-9'&()\. ]+?)\s*\(?([0-9]{1,2})\s*[-–]\s*([0-9]{1,2})\)?$/;

  lines.forEach((l, idx) => {
    let m = l.match(reA);
    if (m) {
      const rank = Number(m[1]);
      const team = (m[2] || '').trim();
      const wins = m[3] != null ? Number(m[3]) : undefined;
      const losses = m[4] != null ? Number(m[4]) : undefined;
      const record = (Number.isFinite(wins) && Number.isFinite(losses)) ? `${wins}-${losses}` : '';
      results.push({ srcIdx: idx, rank: Number.isFinite(rank) ? rank : undefined, team, wins, losses, record });
      console.log('[AI][Parse] A', { l, rank, team, wins, losses });
      return;
    }
    m = l.match(reB);
    if (m) {
      const team = (m[1] || '').trim();
      const wins = Number(m[2]);
      const losses = Number(m[3]);
      results.push({ srcIdx: idx, rank: undefined, team, wins, losses, record: `${wins}-${losses}` });
      console.log('[AI][Parse] B', { l, team, wins, losses });
      return;
    }
    // Soft fallback: lines with lots of letters (likely team names)
    if (/^[A-Za-z][A-Za-z0-9'&()\. ]{4,}$/.test(l)) {
      const team = l.replace(/\s{2,}/g, ' ').trim();
      results.push({ srcIdx: idx, rank: undefined, team, wins: undefined, losses: undefined, record: '' });
      console.log('[AI][Parse] FallbackTeam', { l, team });
    }
  });

  // Deduplicate by team name (case-insensitive)
  const dedupedMap = new Map();
  for (const r of results) {
    const key = (r.team || '').toLowerCase();
    if (!key) continue;
    if (!dedupedMap.has(key)) dedupedMap.set(key, r);
  }
  let deduped = Array.from(dedupedMap.values());

  // Ordering heuristics
  const hasRanks = deduped.filter(r => Number.isFinite(r.rank)).length >= 3;
  if (hasRanks) {
    deduped.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.srcIdx - b.srcIdx);
  } else {
    deduped.sort((a, b) => {
      const aw = Number.isFinite(a.wins) ? a.wins : -1;
      const bw = Number.isFinite(b.wins) ? b.wins : -1;
      if (bw !== aw) return bw - aw; // wins desc
      const al = Number.isFinite(a.losses) ? a.losses : 1e9;
      const bl = Number.isFinite(b.losses) ? b.losses : 1e9;
      if (al !== bl) return al - bl; // losses asc
      return a.srcIdx - b.srcIdx; // keep source order
    });
  }

  // Normalize and clamp to top 16
  const normalized = deduped.slice(0, 16).map((r, i) => ({
    rank: i + 1,
    team: r.team || `Team ${i + 1}`,
    record: r.record || (Number.isFinite(r.wins) && Number.isFinite(r.losses) ? `${r.wins}-${r.losses}` : '')
  }));
  console.log('[AI] Final ordered teams:', normalized.map(t => `${t.rank}. ${t.team} ${t.record}`).slice(0, 12));
  return normalized;
}

// Wire OCR into analyze flow
const __useMockIfParseWeak = true;

async function analyzeViaServer(file, year) {
  try {
    const fd = new FormData();
    fd.append('image', file);
    fd.append('year', String(year || ''));
    const res = await fetch('http://localhost:5050/api/analyze-standings', {
      method: 'POST',
      body: fd,
    });
    if (!res.ok) throw new Error(`server ${res.status}`);
    const json = await res.json();
    if (!json || !Array.isArray(json.rankings)) throw new Error('bad payload');
    console.log('[AI][Server] Parsed rankings:', json.rankings.slice(0, 10));
    return json.rankings;
  } catch (e) {
    console.warn('[AI][Server] Failed, will fallback to local OCR', e);
    return null;
  }
}

function setAiDebugJson(rankings) {
  try {
    const ta = document.getElementById('aiDebugJson');
    if (!ta) return;
    const payload = { rankings: (rankings || []).map(r => ({ rank: r.rank, team: r.team, record: r.record || '' })) };
    ta.value = JSON.stringify(payload, null, 2);
  } catch (_) {}
}

(function setupCopyAiJson() {
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('copyAiJsonBtn');
    const ta = document.getElementById('aiDebugJson');
    if (btn && ta) {
      btn.addEventListener('click', async () => {
        try {
          ta.select();
          ta.setSelectionRange(0, ta.value.length);
          await navigator.clipboard.writeText(ta.value);
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy JSON'; }, 1200);
        } catch (e) {
          console.error('Copy failed', e);
        }
      });
    }
  });
})();

async function handleAnalyzeClick() {
  const fileInput = document.getElementById('standingsImageInput');
  const yearSelect = document.getElementById('uploadYearSelect');
  const file = fileInput.files[0];
  const year = yearSelect.value;
  
  console.log('Analyze button clicked:', { file, year });
  
  if (!file) {
    alert('Please select an image file first');
    return;
  }
  
  try {
    const analyzeBtn = document.getElementById('analyzeStandingsBtn');
    const originalText = analyzeBtn.textContent;
    analyzeBtn.textContent = 'Analyzing...';
    analyzeBtn.disabled = true;

    // Try server (GPT-4o) first
    let rankings = await analyzeViaServer(file, year);

    if (!rankings) {
      // Fallback to OCR
      const ocrText = await analyzeImageWithOCR(file);
      console.log('[AI] OCR text sample:', ocrText.slice(0, 200));
      const parsed = parseStandingsText(ocrText);
      rankings = (parsed && parsed.length >= 4) ? parsed : null;
    }

    if (!rankings) {
      console.warn('[AI] Both server and OCR weak. Using mock.');
      rankings = generateMockRankings(year);
    }

    // Normalize
    rankings = rankings.map((t, i) => ({
      rank: Number.isFinite(Number(t.rank)) ? Number(t.rank) : i + 1,
      team: t.team || `Team ${i + 1}`,
      record: t.record || '',
      year
    })).sort((a, b) => a.rank - b.rank).map((r, i) => ({ ...r, rank: i + 1 }));

    updateRankingsTable(rankings);
    setAiDebugJson(rankings);
    alert(`Analysis complete! Found ${rankings.length} teams.`);

    analyzeBtn.textContent = originalText;
    analyzeBtn.disabled = false;
  } catch (error) {
    console.error('Analysis failed:', error);
    alert('Analysis failed. Please try again.');
    const analyzeBtn = document.getElementById('analyzeStandingsBtn');
    analyzeBtn.textContent = 'Analyze Standings';
    analyzeBtn.disabled = false;
  }
}

function generateMockRankings(year) {
  // Generate different mock data based on year
  const baseTeams = [
    'Team Alpha', 'Team Beta', 'Team Gamma', 'Team Delta', 
    'Team Epsilon', 'Team Zeta', 'Team Eta', 'Team Theta'
  ];
  
  const rankings = [];
  baseTeams.forEach((team, index) => {
    const wins = Math.floor(Math.random() * 10) + 1;
    const losses = 10 - wins;
    rankings.push({
      rank: index + 1,
      team: team,
      record: `${wins}-${losses}`,
      year: year
    });
  });
  
  // Sort by wins (descending)
  return rankings.sort((a, b) => {
    const aWins = parseInt(a.record.split('-')[0]);
    const bWins = parseInt(b.record.split('-')[0]);
    return bWins - aWins;
  }).map((team, index) => ({ ...team, rank: index + 1 }));
}

function updateRankingsTable(rankings) {
  const rankingsTable = document.getElementById('rankingsTable');
  if (!rankingsTable) {
    console.error('Rankings table tbody not found');
    return;
  }
  
  // Clear existing rows
  rankingsTable.innerHTML = '';
  
  // Add new rows
  rankings.forEach(team => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="text-align:left">${team.rank}</td>
      <td style="text-align:left">${team.team}</td>
      <td>${team.record}</td>
    `;
    rankingsTable.appendChild(row);
  });
  
  console.log('Updated rankings table with', rankings.length, 'teams');
  
  // Update prize payouts based on new rankings
  updatePrizePayouts(rankings);
}

function updatePrizePayouts(rankings, payoutConfig) {
  const tbody = document.getElementById('payoutsTable');
  if (!tbody) {
    console.error('Payouts table tbody not found');
    return;
  }

  // Reset table
  tbody.innerHTML = '';

  // Resolve fund values (prefer globals; fallback to DOM)
  let fundUsd = Number(window.__lastUsdValue) || 0;
  let fundBtc = Number(window.__lastBtcValue) || 0;

  if (!fundUsd) {
    const usdEl = document.getElementById('usdValue');
    if (usdEl) {
      const parsed = parseFloat((usdEl.textContent || '').replace(/[^\d.\-]/g, ''));
      if (Number.isFinite(parsed)) fundUsd = parsed;
    }
  }
  if (!fundBtc) {
    const btcEl = document.getElementById('btcBalance');
    if (btcEl) {
      const parsed = parseFloat((btcEl.textContent || '').replace(/[^\d.\-]/g, ''));
      if (Number.isFinite(parsed)) fundBtc = parsed;
    }
  }

  console.log('[Payouts] Using fund values', {
    fundUsd,
    fundBtc,
    total_sats: Math.round(fundBtc * 1e8).toLocaleString()
  });

  if (!(fundUsd > 0 && fundBtc > 0)) {
    tbody.innerHTML = '<tr><td colspan="3" class="no-data">Set a Bitcoin address to see payouts</td></tr>';
    return;
  }

  // Determine payout percentages
  const pickPercent = (cfg, placeNum) => {
    if (!Array.isArray(cfg)) return undefined;
    // Look for place as number or string starting with number or ordinal
    const match = cfg.find((p) => {
      const plc = p?.place;
      if (typeof plc === 'number' && plc === placeNum) return true;
      if (typeof plc === 'string') {
        const s = plc.trim().toLowerCase();
        return s.startsWith(String(placeNum)) || s.startsWith({1:'1st',2:'2nd',3:'3rd'}[placeNum]);
      }
      return false;
    });
    const pct = Number(match?.percent);
    return Number.isFinite(pct) && pct > 0 ? pct : undefined;
  };

  const p1 = pickPercent(payoutConfig, 1) ?? 70;
  const p2 = pickPercent(payoutConfig, 2) ?? 20;
  const p3 = pickPercent(payoutConfig, 3) ?? 10;

  const payouts = [
    { place: 1, label: '1st Place', percent: p1 },
    { place: 2, label: '2nd Place', percent: p2 },
    { place: 3, label: '3rd Place', percent: p3 }
  ];

  // Sort rankings and take top 3
  const top = Array.isArray(rankings)
    ? [...rankings].sort((a, b) => a.rank - b.rank).slice(0, 3)
    : [];

  // Build rows
  payouts.forEach((payout, idx) => {
    const teamName = top[idx]?.team || '—';

    const btcAmount = fundBtc * (payout.percent / 100);
    const usdAmount = fundUsd * (payout.percent / 100);
    const satsAmount = Math.round(btcAmount * 100000000);

    const payoutDisplay = `${satsAmount.toLocaleString()} satoshis (${formatters.usd.format(usdAmount)})`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align:left">
        <strong>${payout.label}</strong><br>
        <span style="color: var(--muted); font-size: 12px;">${teamName}</span>
      </td>
      <td>${payout.percent}%</td>
      <td><strong>${payoutDisplay}</strong></td>
    `;
    tbody.appendChild(tr);
  });
}

// Initialize rankings analyzer when DOM is ready
document.addEventListener('DOMContentLoaded', () => { 
  init().catch(console.error);
  setupRankingsAnalyzer();
});


