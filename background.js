// Possum Fetcher — background service worker
// Handles all cross-origin fetches on behalf of the content script.
// The content script cannot fetch FlightAware/AirNav directly due to CORS.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // ── GENERAL PAGE FETCH ────────────────────────────────────
  if (msg.action === 'ppFetchPage') {
    fetch(msg.url, {
      credentials: 'include',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    })
      .then(r => {
        console.log('[PossumFix] Fetched:', msg.url, 'Status:', r.status);
        return r.text();
      })
      .then(html => {
        console.log('[PossumFix] Response length:', html.length);
        console.log('[PossumFix] Contains history links:', html.includes('/history/'));
        console.log('[PossumFix] First 500 chars:', html.substring(0, 500));
        sendResponse({ html });
      })
      .catch(err => {
        console.error('[PossumFix] Fetch error:', err.toString());
        sendResponse({ error: err.toString() });
      });
    return true; // keep channel open for async response
  }

  // ── AIRNAV AIRPORT INFO ───────────────────────────────────
  if (msg.action === 'ppGetAirport') {
    const url = `http://www.airnav.com/airport/${msg.ident.toUpperCase()}`;
    fetch(url, { credentials: 'include' })
      .then(r => r.text())
      .then(html => {
        if (html.includes('not found') || html.includes('Unknown Airport')) {
          sendResponse({ isFound: false });
          return;
        }
        const headerMatch = html.match(/size="\+1"><b>([\s\S]*?)<\/b><br>([\s\S]*?)<\/font>/i);
        if (headerMatch) {
          const name     = headerMatch[1].replace(/<[^>]*>/g, '').trim();
          const location = headerMatch[2].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
          sendResponse({ isFound: true, name, location });
        } else {
          const nm = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
          const name = nm ? nm[1].replace(/<[^>]*>/g, '').replace(/AirNav:/gi, '').trim() : '';
          sendResponse({ isFound: !!name, name, location: '' });
        }
      })
      .catch(() => sendResponse({ isFound: false }));
    return true;
  }

  // ── AIRNAV NAVAID INFO ────────────────────────────────────
  if (msg.action === 'ppGetNavaid') {
    const url = `http://airnav.com/cgi-bin/navaid-info?id=${msg.ident}`;
    fetch(url, { credentials: 'include' })
      .then(r => r.text())
      .then(html => {
        if (html.includes('not found')) { sendResponse({ name: '', location: '' }); return; }
        let name = '', location = '';
        if (html.toLowerCase().includes('<dd>')) {
          let ddPart = html.split(/<dd>/i)[1].split(/<\/dd>/i)[0];
          if (ddPart.toLowerCase().includes('<h3')) ddPart = ddPart.split(/<h3/i)[0];
          const lines = ddPart.split(/<br\s*\/?>/i);
          name = lines[0].replace(/<[^>]*>/g, '')
                         .replace(/VORDME|VORTAC|TACAN|TAC|RADIO|NAV|H-VOR|NDB|VOR|DME/gi, '')
                         .replace(/\//g, '').replace(/\s+/g, ' ').trim();
          if (lines.length > 1) location = lines[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        } else {
          const h1 = html.split(/<h1[^>]*>/i);
          if (h1.length > 1) name = h1[1].split(/<\/h1>/i)[0].replace(/<[^>]*>/g, '').split('(')[0].trim();
        }
        sendResponse({ name: name.toLowerCase(), location });
      })
      .catch(() => sendResponse({ name: '', location: '' }));
    return true;
  }

  // ── AIRNAV FIX INFO ───────────────────────────────────────
  if (msg.action === 'ppGetFix') {
    const url = `http://www.airnav.com/airspace/fix/${msg.ident.toUpperCase()}`;
    fetch(url, { credentials: 'include' })
      .then(r => r.text())
      .then(html => {
        if (html.includes('not found')) { sendResponse({ location: '' }); return; }
        const cityMatch = html.match(/Nearest city:&nbsp;<\/th><td>([\s\S]*?)<\/td>/i);
        if (cityMatch) {
          const clean = cityMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
          sendResponse({ location: (clean && !clean.toLowerCase().includes('no known city')) ? clean : '' });
        } else {
          sendResponse({ location: '' });
        }
      })
      .catch(() => sendResponse({ location: '' }));
    return true;
  }

});