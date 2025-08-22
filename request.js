const dom = {
  form: document.getElementById('requestForm'),
  leagueName: document.getElementById('leagueName'),
  slug: document.getElementById('slug'),
  btc: document.getElementById('btcAddress'),
  contact: document.getElementById('contact'),
  notes: document.getElementById('notes'),
  payWrap: document.getElementById('payWrap'),
  payLink: document.getElementById('payLink'),
  submitBtn: document.getElementById('submitBtn'),
};

function isValidSlug(v) {
  return /^[a-z0-9-]{2,40}$/.test(v);
}

function isValidBech32(v) {
  // Basic check for bc1 or tb1 prefix and length
  return /^(bc1|tb1)[0-9ac-hj-np-z]{20,60}$/i.test(v.trim());
}

async function init() {
  try {
    const res = await fetch('/config.json', { cache: 'no-store' });
    if (res.ok) {
      const cfg = await res.json();
      if (cfg?.pwywLink) {
        dom.payLink.href = cfg.pwywLink;
        dom.payWrap.style.display = '';
      }
      window.__formEndpoint = cfg?.formEndpoint || '';
      window.__contactEmail = cfg?.contactEmail || '';
    }
  } catch {}

  dom.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = dom.leagueName.value.trim();
    const slug = dom.slug.value.trim();
    const btc = dom.btc.value.trim();
    const contact = dom.contact.value.trim();
    const notes = dom.notes.value.trim();

    if (!name) { alert('Enter league name'); return; }
    if (!isValidSlug(slug)) { alert('Slug should be lowercase letters, numbers, dashes (2-40 chars).'); return; }
    if (!isValidBech32(btc)) { alert('Enter a valid Bitcoin address (bc1…).'); return; }

    const payload = {
      leagueName: name,
      slug,
      btcAddress: btc,
      contact,
      notes,
      userAgent: navigator.userAgent,
      submittedAt: new Date().toISOString(),
      origin: location.href
    };

    // Always persist locally for instant preview during development
    try {
      const leaguesKey = 'mff_leagues';
      const leagueKey = `mff_league:${slug}`;
      const existing = JSON.parse(localStorage.getItem(leaguesKey) || '[]');
      if (!existing.find((l) => l && l.slug === slug)) {
        existing.push({ slug });
        localStorage.setItem(leaguesKey, JSON.stringify(existing));
      }
      localStorage.setItem(leagueKey, JSON.stringify({ leagueName: name, btcAddress: btc }));
      // Also store a preview title for backward compatibility
      localStorage.setItem('mff_last_preview', JSON.stringify({ slug, leagueName: name }));
    } catch {}

    const endpoint = window.__formEndpoint;
    if (endpoint) {
      try {
        dom.submitBtn.disabled = true;
        dom.submitBtn.textContent = 'Submitting…';
        // Try JSON first (Formspree supports this with Accept header)
        let res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload),
        });
        // Fallback to FormData if not OK
        if (!res.ok) {
          const fd = new FormData();
          Object.entries(payload).forEach(([k, v]) => fd.append(k, String(v)));
          res = await fetch(endpoint, { method: 'POST', body: fd });
        }
        if (res.ok) {
          // Accepted; continue to preview
        } else {
          throw new Error('Submission failed');
        }
      } catch (err) {
        console.error(err);
        // Ignore in dev preview; we still redirect to preview below
      } finally {
        dom.submitBtn.disabled = false;
      }
    }

    // Redirect to immediate preview of the new league
    location.assign(`/app.html?slug=${encodeURIComponent(slug)}#preview`);
  });
}

document.addEventListener('DOMContentLoaded', () => { init().catch(console.error); });


