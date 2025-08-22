async function init() {
  try {
    const res = await fetch('/config.json', { cache: 'no-store' });
    const cfg = res.ok ? await res.json() : {};
    const ln = cfg?.lightningAddress || '';
    const btc = cfg?.tipBtcAddress || '';
    const pwyw = cfg?.pwywLink || '';
    const btcAddr = document.getElementById('btcAddr');
    if (btcAddr && btc) btcAddr.value = btc; // only override if provided in config
    const pwywLink = document.getElementById('pwywLink');
    if (pwyw) { pwywLink.href = pwyw; pwywLink.style.display = ''; }
    document.getElementById('copyLnSpeed').addEventListener('click', async () => { await navigator.clipboard.writeText(document.getElementById('lnSpeed').value); });
    document.getElementById('copyLnStrike').addEventListener('click', async () => { await navigator.clipboard.writeText(document.getElementById('lnStrike').value); });
    document.getElementById('copyBtc').addEventListener('click', async () => { await navigator.clipboard.writeText(btcAddr.value); });
  } catch (e) { console.error(e); }
}

document.addEventListener('DOMContentLoaded', () => { init().catch(console.error); });


