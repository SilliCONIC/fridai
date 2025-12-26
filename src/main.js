
import { $, logLine } from './utils/dom.js';
import { state } from './state.js';
import { refreshCity, refreshIran, updateTimeIn } from './services/weather.js';
import { bootFeeds, refreshFeeds } from './services/feeds.js';
import { refreshCalendar } from './services/calendar.js';
import { runSearch } from './services/search.js';
import { renderTools } from './ui/tools.js';
import { loadModels, initChat } from './ui/chat.js';

(async function boot() {
    try {
        $("#ver").textContent = 'v' + chrome.runtime.getManifest().version;

        // Settings
        Object.assign(state.settings, (await chrome.storage.sync.get('settings'))?.settings || {});
        if (state.settings.hideFooter) { const ft = document.querySelector('.footer'); if (ft) ft.style.display = 'none'; }

        // Tools
        state.tools = (await chrome.storage.sync.get('tools'))?.tools || [
            { id: 't1', name: 'ChatGPT', url: 'https://chat.openai.com', tags: ['LLM', 'chat'], pinned: true },
            { id: 't2', name: 'Perplexity', url: 'https://www.perplexity.ai', tags: ['search', 'LLM'], pinned: true },
            { id: 't3', name: 'Claude', url: 'https://claude.ai', tags: ['LLM', 'chat'], pinned: false },
            { id: 't4', name: 'Hugging Face', url: 'https://huggingface.co', tags: ['models', 'ml'], pinned: false }
        ];
        renderTools();

        // Weather
        state.city = (await chrome.storage.sync.get('city'))?.city || null;
        if (state.city) {
            await refreshCity();
        } else {
            const blk = $("#cityBlock");
            if (blk) blk.innerHTML = '<div class="subrow">Set your city in <a href="#" id="linkOpt">Settings (⚙️)</a> to see weather here.</div>';
            $("#linkOpt")?.addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
        }

        $("#cityFind")?.addEventListener('click', findCity);
        $("#cityInput")?.addEventListener('keydown', e => { if (e.key === 'Enter') findCity(); });

        async function findCity() {
            const inp = $("#cityInput");
            const q = (inp?.value || '').trim();
            if (!q) return;
            try {
                const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(q));
                const data = await r.json();
                const c = data?.results?.[0];
                if (c) {
                    const city = { name: `${c.name}${c.admin1 ? ', ' + c.admin1 : ''}`, lat: c.latitude, lon: c.longitude, timezone: c.timezone };
                    await chrome.storage.sync.set({ city });
                    state.city = city;
                    await refreshCity();
                    if (inp) inp.value = '';
                } else {
                    alert('City not found');
                }
            } catch (e) {
                console.error(e);
                logLine('error', 'find city failed');
            }
        }

        await refreshIran();
        setInterval(() => { updateTimeIn($("#cityBlock")); updateTimeIn($("#iranBlock")); }, 1000);

        await bootFeeds();
        $("#calRefresh")?.addEventListener('click', refreshCalendar);
        await refreshCalendar();

        let active = 'google';
        document.querySelectorAll('.provider').forEach(p => p.addEventListener('click', () => { active = p.dataset.p; runSearch(active); }));
        $("#qs")?.addEventListener('keydown', e => { if (e.key === 'Enter') runSearch('google'); });

        // Tool Filter Listener (Updated ID)
        $("#cardToolFilter")?.addEventListener('input', () => {
            // We can re-use the same implementation, just need to make sure renderTools looks at new ID
            // But renderTools relies on $("#toolFilter").value which doesn't exist anymore or...
            // Let's just pass the value or update renderTools separately.
            // Actually, the simplest fix is to update renderTools to look at #cardToolFilter if #toolFilter is missing
            // OR just aliasing here.
            renderTools();
        });

        loadModels();
        initChat();

        // Global listeners
        $("#logClear")?.addEventListener('click', () => { $("#log").innerHTML = ''; });
        document.addEventListener('click', e => { const h = e.target.closest('h2,h3'); if (!h) return; h.parentElement.classList.toggle('collapsed'); });
        $("#btnOpt")?.addEventListener('click', () => chrome.runtime.openOptionsPage());

    } catch (e) {
        logLine('error', 'boot failed: ' + (e.message || e));
    }
})();
