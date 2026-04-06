(function () {
  'use strict';

  // ── HELPERS ───────────────────────────────────────────────
  function bgFetch(url) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Fetch timed out after 15s')), 15000);
      chrome.runtime.sendMessage({ action: 'ppFetchPage', url }, res => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!res || res.error) {
          reject(new Error(res ? res.error : 'fetch failed'));
        } else {
          resolve(res.html);
        }
      });
    });
  }

  function formatMonthDDYYYY(dStr) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(dStr.slice(4,6),10)-1]} ${dStr.slice(6,8)} ${dStr.slice(0,4)}`;
  }

  // ── PARSE FA HISTORY PAGE → CANDIDATE LIST ────────────────
  function findCandidates(html, targetDate, callsign) {
    const timeGroups = new Map();
    const regex = /history\/(\d{8})\/(\d{4}Z)\/([A-Z0-9]{3,4})\/([A-Z0-9]{3,4})/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const d = match[1], t = match[2].toUpperCase();
      const orig = match[3].toUpperCase(), dest = match[4].toUpperCase();
      const ts = Date.UTC(
        parseInt(d.slice(0,4)), parseInt(d.slice(4,6))-1, parseInt(d.slice(6,8)),
        parseInt(t.slice(0,2)), parseInt(t.slice(2,4))
      );
      const hour = Math.floor(ts / 3600000);
      if (!timeGroups.has(hour)) timeGroups.set(hour, []);
      timeGroups.get(hour).push({
        timeLabel: t,
        dateLabel: formatMonthDDYYYY(d),
        diff: Math.abs(ts - (targetDate ? targetDate.getTime() : Date.now())),
        timestamp: ts,
        url: `https://www.flightaware.com/live/flight/${callsign}/history/${d}/${t}/${orig}/${dest}/route`,
        orig,
        dest
      });
    }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (timeGroups.size === 0) {
      const tll = doc.querySelector('.nonMobileTrackLogLink a, a[href*="/tracklog"]');
      if (tll) {
        const m = tll.getAttribute('href').match(/history\/(\d{8})\/(\d{4}Z)\/([A-Z0-9]{3,4})\/([A-Z0-9]{3,4})/i);
        if (m) {
          return [{
            timeLabel: m[2].toUpperCase(),
            dateLabel: formatMonthDDYYYY(m[1]),
            diff: 0,
            timestamp: Date.now(),
            url: `https://www.flightaware.com/live/flight/${callsign}/history/${m[1]}/${m[2].toUpperCase()}/${m[3].toUpperCase()}/${m[4].toUpperCase()}/route`,
            orig: m[3].toUpperCase(),
            dest: m[4].toUpperCase()
          }];
        }
      }
    }

    const final = [];
    timeGroups.forEach(entries => {
      const main = entries.sort((a,b) => a.diff - b.diff)[0];
      if (entries.length > 1) {
        const twin = entries.find(e => e.dest !== main.dest);
        if (twin) main.intended = twin.dest;
      }
      final.push(main);
    });
    return final.sort((a,b) => a.timestamp - b.timestamp);
  }

  // ── PARSE ROUTE PAGE → TOKEN LIST ─────────────────────────
  function parseRoutePage(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const fixes = [];
    const tables = doc.querySelectorAll('.prettyTable, .track-details-table');

    tables.forEach(table => {
      const headerEl = table.querySelector('thead th, th[colspan]');
      const headerText = headerEl ? headerEl.textContent.trim().toUpperCase() : '';
      const rows = table.querySelectorAll('tbody tr');
      const tableFixes = [];

      rows.forEach(r => {
        const cells = r.querySelectorAll('td');
        if (cells.length < 5) return;
        const ident = cells[0].textContent.trim().split(/\s+/)[0].toUpperCase();
        if (!ident || ident === 'NAME') return;
        tableFixes.push({
          ident,
          lat: parseFloat(cells[1].textContent),
          lon: parseFloat(cells[2].textContent)
        });
      });

      tableFixes.forEach(f => {
        let finalIdent = f.ident;
        let isProc = false;
        const procRegex = new RegExp(`\\b${f.ident}\\.?(\\d)\\b`);
        const m = headerText.match(procRegex);
        if (m) { finalIdent = f.ident + m[1]; isProc = true; }
        fixes.push({ ident: finalIdent, type: isProc ? 'procedure' : 'fix', lat: f.lat, lon: f.lon });
      });
    });

    if (fixes.length === 0) {
      const bodyText = doc.body ? (doc.body.innerText || doc.body.textContent) : '';
      if (bodyText.includes('Unable to decode route')) {
        const m = bodyText.match(/Unable to decode route\s*\(([^)]+)\)/i);
        if (m && m[1]) {
          m[1].trim().split(/\s+/).forEach(token => {
            const t = token.trim().toUpperCase();
            if (t) fixes.push({ ident: t, type: 'fix', lat: null, lon: null });
          });
        }
      }
    }

    return fixes;
  }

  // ── PARSE TRACKLOG PAGE → ALT/SPEED PER LAT/LON ──────────
  function parseTrackLog(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const trackData = [];
    const table = doc.querySelector('.prettyTable') || doc.querySelector('.track-details-table');
    if (!table) return trackData;

    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(r => {
      const cells = r.querySelectorAll('td');
      if (cells.length < 8) return;
      const lat = parseFloat(cells[1].textContent.trim());
      const lon = parseFloat(cells[2].textContent.trim());

      const findFormatted = (text) => {
        const m = text.match(/\d{1,3}(,\d{3})+/);
        if (m) return m[0];
        const sm = text.match(/\d+/);
        return sm ? sm[0] : '';
      };

      const speed = findFormatted(cells[4].textContent);
      const alt   = findFormatted(cells[6].textContent);
      if (!isNaN(lat) && !isNaN(lon) && (speed || alt)) {
        trackData.push({ lat, lon, alt, speed });
      }
    });
    return trackData;
  }

  // ── MATCH EACH FIX TO NEAREST TRACKLOG POINT ─────────────
  function findClosest(waypoint, trackLog) {
    if (!waypoint.lat || !waypoint.lon || !trackLog || trackLog.length === 0) return null;
    let closest = null, minDist = Infinity;
    trackLog.forEach(pt => {
      const d = Math.sqrt(Math.pow(pt.lat - waypoint.lat, 2) + Math.pow(pt.lon - waypoint.lon, 2));
      if (d < minDist) { minDist = d; closest = pt; }
    });
    return closest;
  }

  // ── LISTEN: possum:fetch ───────────────────────────────────
  window.addEventListener('possum:fetch', async (e) => {
    const { callsign, date } = e.detail;
    console.log('[PossumFix] possum:fetch received!', callsign, date);
    if (!callsign) return;

    let targetDate = null;
    if (date) {
      targetDate = new Date(date + 'T12:00:00Z');
      if (isNaN(targetDate.getTime())) targetDate = null;
    }

    try {
      const histUrl = `https://www.flightaware.com/live/flight/${callsign}/history/160`;
      console.log('[PossumFix] Fetching:', histUrl);
      let histHtml = await bgFetch(histUrl);

      console.log('[PossumFix] History page length:', histHtml.length);
      console.log('[PossumFix] Contains history links:', histHtml.includes('/history/'));
      console.log('[PossumFix] First 500 chars:', histHtml.substring(0, 500));

      let candidates = findCandidates(histHtml, targetDate, callsign);

      if (candidates.length === 0) {
        console.log('[PossumFix] No candidates from history page, trying live page...');
        const liveHtml = await bgFetch(`https://www.flightaware.com/live/flight/${callsign}`);
        console.log('[PossumFix] Live page length:', liveHtml.length);
        console.log('[PossumFix] Live contains history links:', liveHtml.includes('/history/'));
        candidates = findCandidates(liveHtml, targetDate, callsign);
      }

      console.log('[PossumFix] Final candidates:', candidates.length);

      window.dispatchEvent(new CustomEvent('possum:result', {
        detail: {
          candidates,
          error: candidates.length === 0 ? 'No flight history links found on FlightAware page. You may need to log in to FlightAware first.' : null
        }
      }));

    } catch (err) {
      console.error('[PossumFix] Fetch error:', err);
      window.dispatchEvent(new CustomEvent('possum:result', {
        detail: { candidates: [], error: 'Fetch failed: ' + err.message }
      }));
    }
  });

  // ── LISTEN: possum:load ────────────────────────────────────
  window.addEventListener('possum:load', async (e) => {
    const { candidate, callsign } = e.detail;
    if (!candidate) return;

    try {
      const trackUrl = candidate.url.replace('/route', '/tracklog');

      const [routeHtml, trackHtml] = await Promise.all([
        bgFetch(candidate.url),
        bgFetch(trackUrl)
      ]);

      let tokens = parseRoutePage(routeHtml);
      const trackLog = parseTrackLog(trackHtml);

      tokens.forEach(token => {
        const match = findClosest(token, trackLog);
        if (match) { token.actualAlt = match.alt; token.actualSpeed = match.speed; }
      });

      const urlParts = candidate.url.split('/');
      const dest = urlParts[urlParts.length - 2].toUpperCase();
      const orig = urlParts[urlParts.length - 3].toUpperCase();

      tokens = tokens.filter(t => t.ident.toUpperCase() !== orig && t.ident.toUpperCase() !== dest);
      tokens.unshift({ ident: orig, type: 'airport' });
      tokens.push({ ident: dest, type: 'airport' });

      if (candidate.intended && candidate.intended.toUpperCase() !== dest) {
        tokens.push({ ident: candidate.intended.toUpperCase(), isDiverted: true, type: 'airport' });
      }

      const doc = new DOMParser().parseFromString(routeHtml, 'text/html');
      const headerTable = doc.querySelector('.prettyTable thead th');
      const routeStrText = headerTable ? headerTable.textContent.trim() : tokens.map(t => t.ident).join(' ');

      window.dispatchEvent(new CustomEvent('possum:tokens', {
        detail: { tokens, routeStrText }
      }));

    } catch (err) {
      console.error('[PossumFix] Load error:', err);
      window.dispatchEvent(new CustomEvent('possum:tokens', {
        detail: { tokens: [], routeStrText: '', error: err.message }
      }));
    }
  });

  // ── LISTEN: possum:getAirport ──────────────────────────────
  window.addEventListener('possum:getAirport', (e) => {
    const { ident } = e.detail;
    chrome.runtime.sendMessage({ action: 'ppGetAirport', ident }, res => {
      if (chrome.runtime.lastError) { console.warn('[PossumFix] getAirport error:', chrome.runtime.lastError.message); return; }
      if (res && res.isFound) {
        window.dispatchEvent(new CustomEvent('possum:locationUpdate', {
          detail: { ident, name: res.name, location: res.location, type: 'airport' }
        }));
      }
    });
  });

  // ── LISTEN: possum:getNavaid ───────────────────────────────
  window.addEventListener('possum:getNavaid', (e) => {
    const { ident } = e.detail;
    chrome.runtime.sendMessage({ action: 'ppGetNavaid', ident }, res => {
      if (chrome.runtime.lastError) { console.warn('[PossumFix] getNavaid error:', chrome.runtime.lastError.message); return; }
      if (res && res.name) {
        window.dispatchEvent(new CustomEvent('possum:locationUpdate', {
          detail: { ident, name: res.name, location: res.location, type: 'navaid' }
        }));
      }
    });
  });

  // ── LISTEN: possum:getFix ──────────────────────────────────
  window.addEventListener('possum:getFix', (e) => {
    const { ident } = e.detail;
    chrome.runtime.sendMessage({ action: 'ppGetFix', ident }, res => {
      if (chrome.runtime.lastError) { console.warn('[PossumFix] getFix error:', chrome.runtime.lastError.message); return; }
      if (res && res.location) {
        window.dispatchEvent(new CustomEvent('possum:locationUpdate', {
          detail: { ident, name: '', location: res.location, type: 'fix' }
        }));
      }
    });
  });

  // ── SIGNAL READY (must be LAST so all listeners are registered) ──
  console.log('[PossumFix] Content script loaded, dispatching possum:ready');
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('possum:ready'));
  }, 0);

})();