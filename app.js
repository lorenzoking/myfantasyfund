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
  usdValue: document.getElementById('usdValue'),
  cagrRange: document.getElementById('cagrRange'),
  cagrInput: document.getElementById('cagrInput'),
  p5: document.getElementById('p5'),
  p10: document.getElementById('p10'),
  p15: document.getElementById('p15'),
  projectionChart: document.getElementById('projectionChart'),
};

const STORAGE_KEYS = {
  address: 'bb_ff_btc_address',
  cagr: 'bb_ff_cagr',
};

const formatters = {
  usd: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }),
  btc: new Intl.NumberFormat('en-US', { minimumFractionDigits: 8, maximumFractionDigits: 8 }),
};

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
function renderChart({ years, values }) {
  const ctx = dom.projectionChart.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 160);
  gradient.addColorStop(0, 'rgba(255,138,0,0.35)');
  gradient.addColorStop(1, 'rgba(255,138,0,0)');
  const data = {
    labels: years.map((y) => `${y}y`),
    datasets: [{
      label: 'Projected Value (USD)',
      data: values,
      fill: true,
      backgroundColor: gradient,
      borderColor: '#ff8a00',
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.25,
    }]
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
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

function computeAndRenderProjections(usdNow) {
  const cagrPercent = Number(dom.cagrInput.value);
  const proj = computeProjections({ usdNow, cagrPercent });
  renderChart(proj);
  updateProjectionSummary({ usdNow, cagrPercent });
}

async function refreshAll() {
  const address = loadAddress();
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
    dom.usdValue.textContent = formatters.usd.format(usdValue);
    computeAndRenderProjections(usdValue);
    setLastUpdated();
  } catch (err) {
    console.error(err);
  }
}

async function loadConfigAddress() {
  try {
    const res = await fetch('./config.json', { cache: 'no-store' });
    if (!res.ok) return '';
    const cfg = await res.json();
    const addr = typeof cfg?.btcAddress === 'string' ? cfg.btcAddress.trim() : '';
    return addr;
  } catch (_) {
    return '';
  }
}

async function init() {
  // Init address and cagr
  const configAddress = await loadConfigAddress();
  let addressToUse = configAddress || loadAddress();
  if (configAddress) {
    saveAddress(configAddress);
    if (dom.addressInputs) dom.addressInputs.style.display = 'none';
  }
  dom.addressInput.value = addressToUse;
  updateAddressUi(addressToUse);

  const savedCagr = loadCagr();
  syncCagrInputs(savedCagr);

  // Events
  dom.saveAddressBtn.addEventListener('click', () => {
    const a = dom.addressInput.value.trim();
    if (!a) return;
    saveAddress(a);
    updateAddressUi(a);
    refreshAll();
  });
  dom.clearAddressBtn.addEventListener('click', () => {
    saveAddress('');
    dom.addressInput.value = '';
    updateAddressUi('');
    dom.usdValue.textContent = '—';
    dom.btcBalance.textContent = '—';
    dom.btcPrice.textContent = '—';
    setLastUpdated();
  });
  dom.refreshBtn.addEventListener('click', () => refreshAll());

  dom.cagrRange.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    syncCagrInputs(v);
    // Recompute if we have a current USD
    const usdText = dom.usdValue.textContent;
    const usdNow = Number(usdText.replace(/[^0-9.-]/g, ''));
    if (usdNow > 0) computeAndRenderProjections(usdNow);
  });
  dom.cagrInput.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    syncCagrInputs(v);
    const usdText = dom.usdValue.textContent;
    const usdNow = Number(usdText.replace(/[^0-9.-]/g, ''));
    if (usdNow > 0) computeAndRenderProjections(usdNow);
  });

  // Auto refresh every 60s
  setInterval(refreshAll, 60_000);
  await refreshAll();
}

document.addEventListener('DOMContentLoaded', () => { init().catch(console.error); });


