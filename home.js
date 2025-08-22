const dom = {
  leagueSearch: document.getElementById('leagueSearch'),
  leaguesTable: document.getElementById('leaguesTable'),
  noLeagues: document.getElementById('noLeagues'),
};

async function fetchLeaguesIndex() {
  try {
    const res = await fetch('/leagues/index.json', { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function renderLeagues(leagues, filter = '') {
  const q = filter.trim().toLowerCase();
  // Resolve names from per-league config.json
  const withNames = await Promise.all(leagues.map(async (l) => {
    try {
      const res = await fetch(`/leagues/${l.slug}/config.json`, { cache: 'no-store' });
      if (res.ok) {
        const cfg = await res.json();
        return { ...l, name: cfg.leagueName || l.slug };
      }
    } catch {}
    return { ...l, name: l.slug };
  }));
  const filtered = q ? withNames.filter(l => l.slug.toLowerCase().startsWith(q) || (l.name || '').toLowerCase().startsWith(q)) : withNames;
  dom.leaguesTable.innerHTML = filtered.map(l => `<tr><td>${l.name || l.slug}</td><td><a href="/leagues/${l.slug}/">/leagues/${l.slug}</a></td></tr>`).join('');
  dom.noLeagues.style.display = filtered.length ? 'none' : '';
}

async function init() {
  const leagues = await fetchLeaguesIndex();
  await renderLeagues(leagues);
  dom.leagueSearch.addEventListener('input', async (e) => {
    await renderLeagues(leagues, e.target.value);
  });
}

document.addEventListener('DOMContentLoaded', init);


