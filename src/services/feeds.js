import { $, logLine, escapeHtml, showToast } from '../utils/dom.js';
import { state } from '../state.js';

export async function bootFeeds() {
    state.settings = Object.assign(state.settings, (await chrome.storage.sync.get('settings'))?.settings || {});
    state.feeds = (await chrome.storage.sync.get('feeds'))?.feeds || [];
    state.items = (await chrome.storage.local.get('feedItems'))?.feedItems || {};

    $("#feedsRefresh")?.addEventListener('click', (e) => { e.stopPropagation(); refreshFeeds(true); });
    $("#todayRefresh")?.addEventListener('click', (e) => { e.stopPropagation(); refreshFeeds(); });
    const feedSel = document.getElementById('feedSelect');
    if (feedSel) feedSel.addEventListener('change', () => {
        delete feedSel.dataset.filter;
        renderFeeds();
    });

    await refreshFeeds();
}

async function fetchText(url) {
    try {
        const r = await fetch(url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.text();
    } catch (e) {
        if (state.settings.useProxy) {
            const r = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(url));
            if (!r.ok) throw new Error('Proxy HTTP ' + r.status);
            return await r.text();
        }
        throw e;
    }
}

function parseFeed(text, url) {
    try {
        const o = JSON.parse(text);
        if (o.items || o.entries) {
            const items = (o.items || o.entries).map(it => ({
                id: it.id || it.url || it.title,
                title: it.title || 'Untitled',
                url: it.url || o.home_page_url || url,
                date: it.date_published || it.published || '',
                summary: it.summary || it.content_text || ''
            }));
            return { title: o.title || url, items };
        }
    } catch { }

    const doc = new DOMParser().parseFromString(text, 'text/xml');
    const strip = s => (s || '').replace(/<[^>]*>/g, '').trim();

    const rss = doc.querySelector('rss, channel');
    if (rss) {
        const ch = doc.querySelector('channel');
        const title = ch?.querySelector('title')?.textContent || url;
        const items = [...doc.getElementsByTagName('item')].map(it => {
            const enc = it.getElementsByTagName('content:encoded')[0] || it.getElementsByTagNameNS?.('*', 'encoded')?.[0];
            const sum = enc?.textContent || it.getElementsByTagName('description')[0]?.textContent || '';
            return {
                id: it.getElementsByTagName('guid')[0]?.textContent || it.getElementsByTagName('link')[0]?.textContent,
                title: strip(it.getElementsByTagName('title')[0]?.textContent),
                url: it.getElementsByTagName('link')[0]?.textContent,
                date: it.getElementsByTagName('pubDate')[0]?.textContent,
                summary: strip(sum)
            };
        });
        return { title, items };
    }

    const atom = doc.querySelector('feed');
    if (atom) {
        const items = [...doc.querySelectorAll('entry')].map(it => ({
            id: it.querySelector('id')?.textContent || it.querySelector('title')?.textContent,
            title: strip(it.querySelector('title')?.textContent),
            url: (it.querySelector('link[rel="alternate"]') || it.querySelector('link'))?.getAttribute('href'),
            date: it.querySelector('updated')?.textContent || it.querySelector('published')?.textContent,
            summary: strip(it.querySelector('summary')?.textContent || it.querySelector('content')?.textContent)
        }));
        return { title: doc.querySelector('feed>title')?.textContent || url, items };
    }
    return { title: url, items: [] };
}

export async function refreshFeeds(specific = false) {
    $("#feedErr").textContent = '';
    const sel = document.getElementById('feedSelect');
    const selVal = sel ? sel.value : 'all';

    const toRefresh = [];
    if (specific && selVal !== 'all') {
        const f = state.feeds.find(x => x.id === selVal);
        if (f) toRefresh.push(f);
    } else {
        state.feeds.filter(f => f.enabled).forEach(f => toRefresh.push(f));
    }

    const updated = Object.assign({}, state.items);
    let changed = false;

    for (const f of toRefresh) {
        try {
            const txt = await fetchText(f.url);
            const p = parseFeed(txt, f.url);
            f.title = p.title || f.url;

            const prev = updated[f.id] || [];
            const map = new Map(prev.map(it => [it.id, it]));
            updated[f.id] = (p.items || []).map(it => ({
                id: it.id, title: it.title, url: it.url, date: it.date, summary: it.summary,
                read: map.get(it.id)?.read || false,
                starred: map.get(it.id)?.starred || false,
                localSummary: map.get(it.id)?.localSummary || ''
            })).slice(0, 200);

            if (state.settings.autoSummarize) {
                (updated[f.id] || []).forEach(async it => {
                    if (!it.localSummary) {
                        setTimeout(() => { chrome.runtime.sendMessage({ type: 'summarize_ai', url: it.url }); }, 800);
                    }
                });
            }
            changed = true;
        } catch (e) {
            let host = f.url;
            try { host = new URL(f.url).host; } catch (e) { }
            $("#feedErr").textContent = '⚠︎ Could not fetch: ' + host;
            logLine('error', 'feed fetch failed ' + f.url);
        }
    }

    if (changed) {
        state.items = updated;
        await chrome.storage.local.set({ feedItems: updated });
        await chrome.storage.sync.set({ feeds: state.feeds });
        renderFeedSelect(); renderFeeds(); renderToday();
    }
}

export function renderFeedSelect() {
    const allUnread = state.feeds.reduce((a, f) => a + (state.items[f.id]?.filter(x => !x.read).length || 0), 0);
    $("#feedSelect").innerHTML = `<option value="all">All feeds (${allUnread})</option>` + state.feeds.filter(f => f.enabled).map(f => `<option value="${f.id}">${(f.title || f.url)} (${state.items[f.id]?.filter(x => !x.read).length || 0})</option>`).join('');
}

export function renderFeeds() {
    const selEl = document.getElementById('feedSelect');
    const sel = selEl ? selEl.value : 'all';
    const feedSearchEl = document.getElementById('feedSearch');
    const q = ((feedSearchEl && feedSearchEl.value) || '').toLowerCase();
    const toggleStarEl = document.getElementById('toggleStar');
    const onlyStar = toggleStarEl ? (toggleStarEl.dataset.on === '1') : false;

    if (sel === 'all' && !(selEl && selEl.dataset && selEl.dataset.filter === 'today')) {
        $("#feedsList").innerHTML = '<div class="subrow">Select a feed from Today to view its items, or choose a feed from the dropdown.</div>';
        return;
    }

    let pairs = [];
    state.feeds.forEach(f => { if (!f.enabled) return; if (sel !== 'all' && f.id !== sel) return; (state.items[f.id] || []).forEach(it => pairs.push([f, it])); });

    const isTodayFilter = selEl && selEl.dataset && selEl.dataset.filter === 'today';
    if (isTodayFilter) { const now = Date.now(); const oneDay = 24 * 60 * 60 * 1000; pairs = pairs.filter(([f, it]) => { const t = new Date(it.date || 0).getTime(); return t && (now - t) < oneDay; }); }

    pairs.sort((a, b) => new Date(b[1].date || 0) - new Date(a[1].date || 0));
    const filtered = pairs.filter(([f, it]) => (!q || (it.title || '').toLowerCase().includes(q)) && (!onlyStar || it.starred));

    $("#feedsList").innerHTML = filtered.map(([f, it]) => `<div class="feed collapsed" data-f="${f.id}" data-id="${it.id}">
    <div class="title">${it.title || 'Untitled'}</div>
    <div class="subrow">${f.title || f.url}${it.date ? (' • ' + new Date(it.date).toLocaleString()) : ''}</div>
    <div class="prev">${(it.localSummary || it.summary || '').slice(0, 220)}</div>
    <div class="row wrap"><button class="summ">Summarize</button><button class="rd">${it.read ? 'Mark unread' : 'Mark read'}</button><button class="st">${it.starred ? '★' : '☆'}</button><button class="cp">Copy</button></div>
  </div>`).join('') || '<div class="subrow">No items.</div>';

    $("#feedsList").querySelectorAll('.feed').forEach(card => {
        const fid = card.getAttribute('data-f'); const iid = card.getAttribute('data-id'); const arr = state.items[fid] || []; const item = arr.find(x => x.id === iid);
        card.querySelector('.title').onclick = () => card.classList.toggle('collapsed');
        card.querySelector('.prev').onclick = () => item?.url && chrome.tabs.create({ url: item.url });
        card.querySelector('.rd').onclick = () => { item.read = !item.read; chrome.storage.local.set({ feedItems: state.items }); renderFeedSelect(); renderFeeds(); renderToday(); };
        card.querySelector('.st').onclick = () => { item.starred = !item.starred; chrome.storage.local.set({ feedItems: state.items }); renderFeeds(); renderToday(); };
        card.querySelector('.cp').onclick = () => item?.url && navigator.clipboard.writeText(item.url);
        card.querySelector('.summ').onclick = () => handleSummarize(card, item);
    });
}

function handleSummarize(card, item) {
    const btn = card.querySelector('.summ'); const orig = btn.textContent; btn.textContent = 'AI Summarizing...'; btn.disabled = true;
    let pollId = null;
    async function startPoll() { pollId = setInterval(async () => { const p = (await chrome.storage.local.get('summ_progress'))?.summ_progress; if (p) { if (p.state === 'running') { btn.textContent = `AI Summarizing ${p.current}/${p.total}`; } else if (p.state === 'started') { btn.textContent = 'AI Summarizing...'; } else if (p.state === 'done') { btn.textContent = 'AI Summarize done'; clearInterval(pollId); } } }, 400); }
    startPoll();
    chrome.runtime.sendMessage({ type: 'summarize_ai', url: item.url }, async (resp) => {
        try {
            if (resp && resp.ok && resp.summary) { item.localSummary = resp.summary; await chrome.storage.local.set({ feedItems: state.items }); }
            else { await summarize(item); }
        } catch (e) { await summarize(item); }
        await chrome.storage.local.set({ summ_progress: { state: 'done', total: 0, done: 0 } });
        if (pollId) clearInterval(pollId);
        btn.textContent = orig; btn.disabled = false; renderFeeds(); renderToday();
    });
}

export function renderToday() {
    const now = Date.now(), oneDay = 24 * 60 * 60 * 1000;
    const feedCounts = state.feeds.reduce((acc, f) => { if (!f.enabled) return acc; const list = (state.items[f.id] || []).filter(it => { const t = new Date(it.date || 0).getTime(); return t && (now - t) < oneDay; }); if (list.length) acc.push({ feed: f, items: list }); return acc; }, []);
    if (feedCounts.length === 0) { $("#todayList").innerHTML = '<div class="subrow">No items from the last 24 hours.</div>'; $("#todayCount").textContent = ''; return; }
    $("#todayList").innerHTML = `<div class="today-container">` + feedCounts.map(fc => {
        const title = fc.feed.title || fc.feed.url; const n = fc.items.length;
        return `<div class="today-feed" data-fid="${fc.feed.id}"><div class="title link">${escapeHtml(title)} (${n})</div></div>`;
    }).join('') + `</div>`;
    $("#todayCount").textContent = feedCounts.reduce((a, b) => a + b.items.length, 0) + ' items in the last 24 hours';
    document.querySelectorAll('#todayList .today-feed').forEach(el => {
        const fid = el.getAttribute('data-fid');
        el.querySelector('.title').onclick = () => {
            const sel = document.getElementById('feedSelect');
            if (!sel) return;
            const opt = sel.querySelector(`option[value="${fid}"]`);
            if (!opt) renderFeedSelect();
            sel.value = fid;
            sel.dataset.filter = 'today';
            renderFeeds();
            const feedsList = document.getElementById('feedsList'); if (feedsList) feedsList.scrollIntoView({ behavior: 'smooth' });
        };
    });
}

async function summarize(item) {
    if (!item || item.localSummary) return;
    try {
        const r = await fetch(item.url); const html = await r.text();
        const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
        const sents = text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).filter(Boolean);
        const summary = sents.slice(0, 3).join(' ');
        item.localSummary = summary; await chrome.storage.local.set({ feedItems: state.items });
    } catch (e) { logLine('error', 'summarize failed'); }
}
