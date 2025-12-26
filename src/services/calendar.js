import { $ } from '../utils/dom.js';
import { icsToDate } from '../utils/datetime.js';

export async function refreshCalendar() {
    const { icsUrls = [] } = await chrome.storage.sync.get('icsUrls');
    const events = [];
    for (const s of icsUrls) {
        try {
            const fetchUrl = (s.url || s).replace(/^webcal:/i, 'https:');
            const txt = await fetch(fetchUrl).then(r => r.text());
            parseICS(txt).forEach(e => events.push({ ...e, _src: s }));
        } catch (e) { /* silently ignore */ }
    }
    const sourcesHtml = (icsUrls && icsUrls.length) ? (`<div class="subrow">Sources: ${icsUrls.map(s => {
        let label = '';
        try { label = s.label || new URL(s.url || s).host; } catch (err) { label = s.label || (s.url || s) || 'source'; }
        const href = (s.url || s) || '#';
        return `<a class="chip" href="${href}" target="_blank">${label}</a>`;
    }).join(' ')}</div>`) : '';

    const s = (await chrome.storage.sync.get('settings'))?.settings || {};
    const maxEvents = (s.maxCalendarEvents == null) ? 10 : s.maxCalendarEvents;
    const futureAll = events.filter(e => e.startDate && e.startDate >= new Date(Date.now() - 6 * 60 * 60 * 1000)).sort((a, b) => a.startDate - b.startDate);
    const future = futureAll.slice(0, maxEvents);

    const eventsHtml = future.map(e => {
        const dateStr = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit', weekday: 'short', timeZone: (e._src && e._src.timezone) || undefined }).format(e.startDate);
        const timeStr = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: (e._src && e._src.timezone) || undefined }).format(e.startDate);
        const title = e.summary || 'Untitled';
        const srcChip = (e._src?.label || e._src?.url) ? ` <span class="chip">${e._src.label || (() => { try { return new URL(e._src.url).host } catch { return e._src.url || '' } })()}</span>` : '';
        const loc = e.location ? (' • ' + e.location) : '';
        const open = e.url ? ` <a href="${e.url}" target="_blank">Open</a>` : '';
        return `<div class="cal-entry"><div class="when">${dateStr} · ${timeStr}${loc}</div><div class="title">${title}${srcChip}${open}</div></div>`;
    }).join('');

    $("#calList").innerHTML = (sourcesHtml + (eventsHtml || '<div class="subrow">No upcoming events.</div>'));
}

function parseICS(text) {
    const lines = text.split(/\r?\n/); const evs = []; let cur = null;
    for (const ln of lines) {
        if (ln.startsWith('BEGIN:VEVENT')) cur = {};
        else if (ln.startsWith('END:VEVENT')) { if (cur) evs.push(cur); cur = null; }
        else if (cur) {
            if (ln.startsWith('SUMMARY:')) cur.summary = ln.slice(8).trim();
            else if (ln.startsWith('LOCATION:')) cur.location = ln.slice(9).trim();
            else if (ln.startsWith('URL:')) cur.url = ln.slice(4).trim();
            else if (ln.startsWith('DTSTART')) {
                const m = ln.match(/:(\d{8}T\d{6}Z?)/);
                if (m) cur.startDate = icsToDate(m[1]);
                else { const m2 = ln.match(/:(\d{8})/); if (m2) cur.startDate = icsToDate(m2[1]); }
            }
            else if (ln.startsWith('DTEND')) {
                const m = ln.match(/:(\d{8}T\d{6}Z?)/);
                if (m) cur.endDate = icsToDate(m[1]);
                else { const m2 = ln.match(/:(\d{8})/); if (m2) cur.endDate = icsToDate(m2[1]); }
            }
        }
    }
    return evs;
}
