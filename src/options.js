
document.addEventListener('DOMContentLoaded', () => {
  // helpers
  const $ = s => document.querySelector(s);
  function showToast(msg, timeout = 2200) { const el = document.getElementById('toast'); if (!el) return; el.textContent = msg; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), timeout); }
  async function load(k, fb) { const o = await chrome.storage.sync.get(k); return o?.[k] ?? fb }
  function save(k, v) { return chrome.storage.sync.set({ [k]: v }) }

  // Navigation
  const back = document.getElementById('btnBack'); if (back) { back.addEventListener('click', () => { window.location.href = chrome.runtime.getURL('newtab.html'); }); }
  const saveTop = document.getElementById('btnSaveTop');

  // Accordion Logic
  document.addEventListener('click', e => {
    const h = e.target.closest('h2,h3');
    if (!h) return;
    h.parentElement.classList.toggle('collapsed');
  });

  // Boot settings
  (async function boot() {
    // --- 1. Load General Settings ---
    const s = await load('settings', { useProxy: false, autoSummarize: false, maxSummariesPerFeed: 3, hideFooter: false });
    $("#useProxy").checked = !!s.useProxy;
    $("#autoSumm").checked = !!s.autoSummarize;
    $("#maxSumm").value = s.maxSummariesPerFeed || 3;
    $("#hideFooter").checked = !!s.hideFooter;
    $("#maxCalEvents").value = (s.maxCalendarEvents == null) ? 10 : s.maxCalendarEvents;

    // --- 2. Load AI Settings (Need elements first) ---
    const aiProvider = document.getElementById('aiProvider');
    const aiKey = document.getElementById('aiKey');
    const testAiKey = document.getElementById('testAiKey');
    const storeKeyLocal = document.getElementById('storeKeyLocal');
    const customFields = document.getElementById('customProviderFields');
    const customBase = document.getElementById('customBase');
    const customPath = document.getElementById('customPath');
    const customAuthHeader = document.getElementById('customAuthHeader');
    const customModelInput = document.getElementById('customModel');
    const modelSelect = document.getElementById('modelSelect');

    // Add Test Saved Key button
    const testSavedKeyBtn = document.createElement('button');
    testSavedKeyBtn.textContent = 'Test saved key';
    testSavedKeyBtn.style.marginLeft = '8px';
    if ($("#aiKey") && $("#aiKey").parentElement) $("#aiKey").parentElement.appendChild(testSavedKeyBtn);

    const creds = await load('ai', { provider: 'openai', key: '' });
    const custom = await load('ai_custom', { base: '', path: '/v1/chat/completions', authHeader: 'Authorization' });
    const localKey = (await chrome.storage.local.get('ai_key'))?.ai_key || '';

    aiProvider.value = creds.provider || 'openai';
    storeKeyLocal.checked = !!(creds.storeLocal);
    aiKey.value = storeKeyLocal.checked ? localKey || creds.key || '' : creds.key || '';

    customBase.value = custom.base || '';
    customPath.value = custom.path || '/v1/chat/completions';
    customAuthHeader.value = custom.authHeader || 'Authorization';
    customModelInput.value = custom.model || '';

    // Model Select Logic
    const supported = ['meta-llama-3.1-8b-instruct', 'meta-llama-3.1-70b-instruct', 'openai-gpt-oss-120b', 'meta-llama-3.1-8b-rag', 'llama-3.1-sauerkrautlm-70b-instruct', 'llama-3.3-70b-instruct', 'gemma-3-27b-it', 'medgemma-27b-it', 'teuken-7b-instruct-research', 'mistral-large-instruct', 'qwen3-32b', 'qwen3-235b-a22b', 'qwen2.5-coder-32b-instruct', 'codestral-22b', 'internvl2.5-8b', 'qwen2.5-vl-72b-instruct', 'qwq-32b', 'deepseek-r1', 'gpt-3.5-turbo', 'gpt-4'];
    let currentModel = custom.model || 'meta-llama-3.1-70b-instruct';
    if (supported.includes(currentModel)) {
      modelSelect.value = currentModel;
      customModelInput.style.display = 'none';
    } else {
      modelSelect.value = 'custom';
      customModelInput.style.display = 'inline-block';
    }

    const updateCustomVis = () => {
      if (modelSelect.value === 'custom') customModelInput.style.display = 'inline-block';
      else customModelInput.style.display = 'none';
    };
    modelSelect.onchange = updateCustomVis;

    const updateProviderVis = () => {
      if (aiProvider.value === 'academiccloud') {
        customBase.value = 'https://chat-ai.academiccloud.de/v1';
        customPath.value = '/chat/completions';
        customAuthHeader.value = 'Authorization';
        if (!customModelInput.value) customModelInput.value = 'meta-llama-3.1-70b-instruct';
        modelSelect.value = customModelInput.value || 'meta-llama-3.1-70b-instruct';
        updateCustomVis();
        customFields.style.display = 'block';
      } else if (aiProvider.value === 'custom') {
        customFields.style.display = 'block';
      } else {
        customFields.style.display = 'none';
      }
    };
    aiProvider.addEventListener('change', updateProviderVis);
    // Init visibility
    updateProviderVis();
    // Manually override if not custom/academic but loaded that way? No, provider value sets it.
    // If provider is OpenAI, hide custom fields.
    if (aiProvider.value !== 'custom' && aiProvider.value !== 'academiccloud') customFields.style.display = 'none';


    // --- 3. Save Function ---
    async function doSave(navigateBack) {
      // General
      const ns = {
        useProxy: $("#useProxy").checked,
        autoSummarize: $("#autoSumm").checked,
        maxSummariesPerFeed: parseInt($("#maxSumm").value || '3', 10) || 3,
        hideFooter: $("#hideFooter").checked,
        maxCalendarEvents: parseInt($("#maxCalEvents").value || '10', 10) || 10
      };
      await save('settings', ns);

      // AI
      const aiConf = { provider: aiProvider.value || 'openai', key: aiKey.value || '', storeLocal: !!storeKeyLocal.checked };
      if (storeKeyLocal.checked) {
        await chrome.storage.local.set({ ai_key: aiKey.value || '' });
        aiConf.key = ''; // Don't sync key
      } else {
        await chrome.storage.local.remove('ai_key');
      }
      await save('ai', aiConf);

      // Custom AI
      const finalModel = (modelSelect.value === 'custom') ? customModelInput.value.trim() : modelSelect.value;
      await save('ai_custom', {
        base: customBase.value.trim(),
        path: customPath.value.trim(),
        authHeader: customAuthHeader.value.trim(),
        model: finalModel
      });

      if (navigateBack) { window.location.href = chrome.runtime.getURL('newtab.html'); }
      else { alert('Saved'); }
    }
    if (saveTop) saveTop.addEventListener('click', () => doSave(true));

    // --- 4. Feeds Logic ---
    async function renderFeeds() {
      const { feeds = [] } = await chrome.storage.sync.get('feeds');
      $("#feeds").innerHTML = feeds.map(f => `<div class="row wrap" data-id="${f.id}" style="border:1px solid var(--border);border-radius:10px;padding:6px;margin:6px 0">
          <input class="flex1 t" value="${f.title || f.url}"><input class="flex1 u" value="${f.url}">
          <input class="flex1 g" value="${(f.tags || []).join(', ')}"><label><input type="checkbox" class="e" ${f.enabled ? 'checked' : ''}> Enabled</label><button class="d">Delete</button>
        </div>`).join('') || '<div class="subrow">No feeds yet.</div>';
      $("#feeds").querySelectorAll('[data-id]').forEach(row => {
        const id = row.getAttribute('data-id');
        row.querySelector('.d').onclick = async () => { const { feeds = [] } = await chrome.storage.sync.get('feeds'); const i = feeds.findIndex(x => x.id === id); if (i >= 0) feeds.splice(i, 1); await chrome.storage.sync.set({ feeds }); renderFeeds(); };
        ['t', 'u', 'g', 'e'].forEach(cls => {
          row.querySelector('.' + cls).onchange = async () => {
            const { feeds = [] } = await chrome.storage.sync.get('feeds'); const f = feeds.find(x => x.id === id); if (!f) return;
            f.title = row.querySelector('.t').value.trim() || f.title; f.url = row.querySelector('.u').value.trim() || f.url; f.tags = row.querySelector('.g').value.split(',').map(s => s.trim()).filter(Boolean); f.enabled = row.querySelector('.e').checked;
            await chrome.storage.sync.set({ feeds });
          };
        });
      });
    }
    $("#addFeed").onclick = async () => { const u = $("#addFeedUrl").value.trim(); if (!u) return; const { feeds = [] } = await chrome.storage.sync.get('feeds'); feeds.push({ id: 'f' + Math.random().toString(36).slice(2, 8), url: u, title: u, tags: [], enabled: true, addedAt: Date.now() }); await chrome.storage.sync.set({ feeds }); $("#addFeedUrl").value = ''; renderFeeds(); };
    renderFeeds();

    // --- 5. Tools Logic ---
    async function renderToolsManager() {
      const { tools = [] } = await chrome.storage.sync.get('tools');
      $("#toolsManager").innerHTML = tools.map(t => `<div class="row wrap" data-id="${t.id}" style="border:1px solid var(--border);border-radius:10px;padding:6px;margin:6px 0">
          <input class="flex1 tn" value="${t.name || t.url}"><input class="flex1 tu" value="${t.url}"><label><input type="checkbox" class="tp" ${t.pinned ? 'checked' : ''}> Pinned</label><button class="td">Delete</button>
        </div>`).join('') || '<div class="subrow">No tools yet.</div>';
      $("#toolsManager").querySelectorAll('[data-id]').forEach(row => {
        const id = row.getAttribute('data-id');
        row.querySelector('.td').onclick = async () => { const { tools = [] } = await chrome.storage.sync.get('tools'); const i = tools.findIndex(x => x.id === id); if (i >= 0) tools.splice(i, 1); await chrome.storage.sync.set({ tools }); renderToolsManager(); };
        ['tn', 'tu', 'tp'].forEach(cls => row.querySelector('.' + cls).onchange = async () => { const { tools = [] } = await chrome.storage.sync.get('tools'); const t = tools.find(x => x.id === id); if (!t) return; t.name = row.querySelector('.tn').value.trim() || t.name; t.url = row.querySelector('.tu').value.trim() || t.url; t.pinned = row.querySelector('.tp').checked; await chrome.storage.sync.set({ tools }); });
      });
    }
    $("#addTool").onclick = async () => { const u = $("#addToolUrl").value.trim(); if (!u) return; const n = $("#addToolName").value.trim() || u; const { tools = [] } = await chrome.storage.sync.get('tools'); tools.push({ id: 't' + Math.random().toString(36).slice(2, 8), name: n, url: u, tags: [], pinned: false }); await chrome.storage.sync.set({ tools }); $("#addToolUrl").value = ''; $("#addToolName").value = ''; renderToolsManager(); renderTools(); };
    renderToolsManager();

    // --- 6. ICS Logic ---
    async function renderIcs() {
      const { icsUrls = [] } = await chrome.storage.sync.get('icsUrls');
      $("#ics").innerHTML = icsUrls.map((s, i) => `<div class="row wrap" data-i="${i}" style="border:1px solid var(--border);border-radius:10px;padding:6px;margin:6px 0">
          <input class="flex1 l" placeholder="Label" value="${s.label || ''}"><input class="flex1 u" value="${s.url || ''}">
          <button class="s">Save</button><button class="d">Delete</button>
        </div>`).join('') || '<div class="subrow">No ICS sources.</div>';
      $("#ics").querySelectorAll('[data-i]').forEach(row => {
        const i = parseInt(row.getAttribute('data-i'), 10);
        row.querySelector('.s').onclick = async () => { const { icsUrls = [] } = await chrome.storage.sync.get('icsUrls'); icsUrls[i] = { url: row.querySelector('.u').value.trim(), label: row.querySelector('.l').value.trim() }; await chrome.storage.sync.set({ icsUrls }); renderIcs(); };
        row.querySelector('.d').onclick = async () => { const { icsUrls = [] } = await chrome.storage.sync.get('icsUrls'); icsUrls.splice(i, 1); await chrome.storage.sync.set({ icsUrls }); renderIcs(); };
      });
    }
    $("#addIcs").onclick = async () => { const u = $("#addIcsUrl").value.trim(); if (!u) return; const { icsUrls = [] } = await chrome.storage.sync.get('icsUrls'); icsUrls.push({ url: u, label: '' }); await chrome.storage.sync.set({ icsUrls }); $("#addIcsUrl").value = ''; renderIcs(); };
    renderIcs();

    // --- 7. Toolbar Add Logic ---
    const params = new URLSearchParams(window.location.search);
    if (params.get('add') === '1') {
      const u = params.get('u') || ''; const t = params.get('t') || '';
      document.getElementById('addCard').style.display = 'block';
      document.getElementById('addUrl').textContent = u;
      document.getElementById('addTitle').textContent = t;

      document.getElementById('addAsTool').onclick = async () => {
        const { tools = [] } = await chrome.storage.sync.get('tools');
        tools.push({ id: 't' + Math.random().toString(36).slice(2, 8), name: t || u, url: u, tags: [], pinned: false });
        await chrome.storage.sync.set({ tools });
        showToast('Added to Tools');
        setTimeout(() => { window.location.href = 'chrome://newtab'; }, 800);
      };
      document.getElementById('detectAddFeed').onclick = async () => {
        try {
          let html = ''; let usedProxy = false;
          try { const res = await fetch(u); html = await res.text(); }
          catch (e) {
            try { const p = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(u)); html = await p.text(); usedProxy = true; }
            catch (e2) {
              const settings = await load('settings', {});
              if (settings.useProxy) { const res = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(u)); html = await res.text(); usedProxy = true; }
              else throw e2;
            }
          }
          const urls = [...html.matchAll(/<link[^>]+rel=["']alternate["'][^>]+>/gi)].map(m => m[0]).map(t => { const href = (t.match(/href=["']([^"']+)["']/i) || [])[1] || ''; return href; }).filter(Boolean);
          const abs = urls.map(h => { try { return new URL(h, u).toString() } catch { return null } }).filter(Boolean);
          const { feeds = [] } = await chrome.storage.sync.get('feeds');
          abs.forEach(link => feeds.push({ id: 'f' + Math.random().toString(36).slice(2, 8), url: link, title: link, tags: [], enabled: true, addedAt: Date.now() }));
          await chrome.storage.sync.set({ feeds });
          showToast(usedProxy ? 'Feeds added (via proxy)' : 'Feeds added');
        } catch (e) { console.error('detectAddFeed error', e); showToast('Feed detection failed (CORS or network)'); }
        setTimeout(() => { window.location.href = 'chrome://newtab'; }, 800);
      };
    }

    // --- 8. Import/Export ---
    document.getElementById('exportAll').onclick = async () => {
      const keys = await chrome.storage.sync.get(null);
      const blob = new Blob([JSON.stringify(keys, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'fridai-backup.json'; a.click(); URL.revokeObjectURL(url);
    };
    document.getElementById('importBtn').onclick = () => document.getElementById('importFile').click();
    document.getElementById('importFile').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return; const txt = await f.text();
      try {
        const obj = JSON.parse(txt);
        if (obj.settings) await chrome.storage.sync.set({ settings: obj.settings });
        if (obj.feeds) await chrome.storage.sync.set({ feeds: obj.feeds });
        if (obj.tools) await chrome.storage.sync.set({ tools: obj.tools });
        if (obj.icsUrls) await chrome.storage.sync.set({ icsUrls: obj.icsUrls });
        showToast('Imported'); renderFeeds(); renderToolsManager();
      } catch (err) { showToast('Import failed'); }
    });

    // --- 9. API Test Logic ---
    testAiKey.onclick = async () => {
      const k = aiKey.value.trim(); if (!k) return showToast('No key');
      const base = customBase.value.trim(); const path = customPath.value.trim(); const hdr = customAuthHeader.value.trim() || 'Authorization';
      const cfg = { provider: aiProvider.value, base, path, hdr, model: customModelInput.value || custom.model };
      testApi({ key: k, cfg, source: 'input' });
    };
    testSavedKeyBtn.onclick = async () => {
      const local = (await chrome.storage.local.get('ai_key'))?.ai_key; const sync = (await chrome.storage.sync.get('ai'))?.ai || {}; const key = local || sync.key || '';
      if (!key) return showToast('No saved key');
      const base = customBase.value.trim(); const path = customPath.value.trim(); const hdr = customAuthHeader.value.trim() || 'Authorization';
      const cfg = (await chrome.storage.sync.get('ai_custom'))?.ai_custom || { base, path, authHeader: hdr, model: custom.model };
      testApi({ key, cfg: { provider: (sync.provider || 'openai'), base: cfg.base, path: cfg.path, hdr: cfg.authHeader || hdr, model: cfg.model }, source: 'saved' });
    };
    async function testApi({ key, cfg, source }) {
      const modal = document.createElement('div'); modal.id = 'aiTestModal';
      Object.assign(modal.style, { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', background: '#0f1720', color: '#e6eef8', padding: '16px', borderRadius: '10px', zIndex: 2147483647, width: '720px', maxHeight: '70vh', overflow: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.6)' });
      modal.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><strong>API Test</strong><div><button id="aiTestClose">Close</button></div></div>
        <div style="margin-top:8px;font-size:13px;color:var(--muted)">Source: ${source}</div>
        <div id="aiTestStatus" style="margin-top:8px">Preparing test...</div>
        <div style="margin-top:10px"><strong>Request</strong><pre id="aiTestRequest" style="background:#081223;padding:8px;border-radius:6px;white-space:pre-wrap;word-break:break-word;font-size:12px"></pre></div>
        <div style="margin-top:10px"><strong>Response</strong><pre id="aiTestResponse" style="background:#081223;padding:8px;border-radius:6px;white-space:pre-wrap;word-break:break-word;font-size:12px">(waiting)</pre></div>
        <div style="margin-top:10px"><button id="aiCopyCurl">Copy curl</button> <button id="aiRetry">Retry</button></div>`;
      document.body.appendChild(modal);
      document.getElementById('aiTestClose').onclick = () => { modal.remove(); };
      function setStatus(t) { const s = document.getElementById('aiTestStatus'); if (s) s.textContent = t; }
      function setReq(t) { const r = document.getElementById('aiTestRequest'); if (r) r.textContent = t; }
      function setResp(t) { const r = document.getElementById('aiTestResponse'); if (r) r.textContent = t; }
      // build url and payload
      const provider = cfg.provider || 'openai';
      const base = (cfg.base || '').replace(/\/$/, '');
      let path = cfg.path || '';
      if (base.endsWith('/v1') && (!path || path === '/')) { path = '/chat/completions'; }
      const url = provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : (base + (path.startsWith('/') ? path : ('/' + path)));
      let headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      const hdrSpec = (cfg.hdr || 'Authorization');
      let hdrName = 'Authorization'; let hdrValue = key;
      if (hdrSpec.includes(':')) {
        const parts = hdrSpec.split(':'); hdrName = parts[0].trim(); const maybeVal = parts.slice(1).join(':').trim(); hdrValue = maybeVal || ((hdrName.toLowerCase() === 'authorization') ? ('Bearer ' + key) : key);
      } else { hdrName = hdrSpec.trim(); hdrValue = (hdrName.toLowerCase() === 'authorization') ? ('Bearer ' + key) : key; }
      headers[hdrName] = hdrValue;
      const payload = { model: cfg.model || 'meta-llama-3.1-70b-instruct', messages: [{ 'role': 'user', 'content': 'Test request: say ok' }], max_tokens: 15, temperature: 0 };
      const displayHeaders = Object.assign({}, headers); displayHeaders[hdrName] = (hdrName.toLowerCase() === 'authorization') ? 'Bearer *****' : '*****';
      setReq(JSON.stringify({ url, headers: displayHeaders, payload }, null, 2));
      setStatus('Running test...'); setResp('(running)');
      async function doFetch() {
        try {
          const t0 = Date.now();
          const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
          const dt = Date.now() - t0;
          let text = ''; try { text = await r.text(); } catch (e) { text = '(no body)'; }
          setStatus(`HTTP ${r.status} ${r.statusText} — ${dt}ms`);
          try { const j = JSON.parse(text); setResp(JSON.stringify(j, null, 2)); } catch (err) { setResp(text); }
          const displayHdrVal = (hdrName.toLowerCase() === 'authorization') ? 'Bearer *****' : '*****';
          const curl = `curl -X POST '${url}' -H 'Content-Type: application/json' -H '${hdrName}: ${displayHdrVal}' -d '${JSON.stringify(payload)}'`;
          document.getElementById('aiCopyCurl').onclick = () => { navigator.clipboard.writeText(curl); showToast('curl copied'); };
        } catch (err) {
          const msg = err && err.message ? err.message : String(err); setStatus('Error');
          setResp(msg + '\n\nHints: This may be a CORS error.');
        }
      }
      document.getElementById('aiRetry').onclick = () => { setStatus('Retrying...'); setResp('(running)'); doFetch(); };
      doFetch();
    }

    // --- 10. City Search ---
    const optCity = document.getElementById('optCity');
    const optCityFind = document.getElementById('optCityFind');
    const optCityResults = document.getElementById('optCityResults');
    async function searchCity(q) {
      const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=' + encodeURIComponent(q));
      if (!r.ok) throw new Error('geo failed'); return r.json();
    }
    optCityFind?.addEventListener('click', async () => {
      const q = (optCity.value || '').trim(); if (!q) return;
      try {
        const data = await searchCity(q); const list = data?.results || [];
        optCityResults.innerHTML = list.map(c => `<div class="chip" data-city='${JSON.stringify(c)}'>${c.name}${c.admin1 ? ', ' + c.admin1 : ''} — ${c.country} · TZ ${c.timezone}</div>`).join('') || '<div class="subrow">No results.</div>';
        optCityResults.querySelectorAll('[data-city]').forEach(el => el.addEventListener('click', async () => {
          const c = JSON.parse(el.getAttribute('data-city'));
          const city = { name: `${c.name}${c.admin1 ? ', ' + c.admin1 : ''}`, lat: c.latitude, lon: c.longitude, timezone: c.timezone };
          await chrome.storage.sync.set({ city });
          optCityResults.innerHTML = `<div class="subrow">Saved: ${city.name} (${city.timezone})</div>`;
        }));
      } catch (e) { optCityResults.textContent = 'Search failed'; }
    });

  })();
});