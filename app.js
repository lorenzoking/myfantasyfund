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

async function refreshAll() {
  const address = (__leagueMode && __configAddress) ? __configAddress : loadAddress();
  updateAddressUi(address);
  if (!address) return;
  try {
    const [price, balance] = await Promise.all([
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
    computeAndRenderProjections(usdValue, price);
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
  const path = location.pathname.replace(/\/+/g, '/').replace(/\/$/, '');
  // Expecting /leagues/slug or root
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'leagues' && parts[1]) return parts[1];
  return '';
}

async function loadConfigAddress() {
  try {
    const slug = getSlugFromPath();
    const url = slug ? `/leagues/${slug}/config.json` : '/config.json';
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return '';
    const cfg = await res.json();
    const addr = typeof cfg?.btcAddress === 'string' ? cfg.btcAddress.trim() : '';
    if (cfg?.leagueName && dom.titleLeagueName) dom.titleLeagueName.textContent = cfg.leagueName;
    return addr;
  } catch (_) {
    return '';
  }
}

async function init() {
  // Init address and cagr
  const slug = getSlugFromPath();
  __leagueMode = Boolean(slug);
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

document.addEventListener('DOMContentLoaded', () => { init().catch(console.error); });


