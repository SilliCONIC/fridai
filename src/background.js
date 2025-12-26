
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'fridai_root', title: 'Add to FridAI', contexts: ['page', 'link'] });
  chrome.contextMenus.create({ id: 'fridai_add_tool', parentId: 'fridai_root', title: 'Add page as Tool', contexts: ['page', 'link'] });
  chrome.contextMenus.create({ id: 'fridai_add_feed', parentId: 'fridai_root', title: 'Detect & Add Feeds', contexts: ['page', 'link'] });
});

/* Context Menus */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'fridai_add_tool' && tab?.url) {
    await addTool(info.linkUrl || tab.url, info.selectionText || tab.title || (info.linkUrl || tab.url));
  }
  if (info.menuItemId === 'fridai_add_feed' && tab?.url) {
    await addFeed(info.linkUrl || tab.url);
  }
});

/* Toolbar Icon Click -> Inject Modal */
chrome.action.onClicked.addListener((tab) => {
  if (tab.id && tab.url && !tab.url.startsWith('chrome://')) {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  }
});

/* Logic */
async function addTool(url, title) {
  const { tools = [] } = await chrome.storage.sync.get('tools');
  const newTool = { id: 't' + Math.random().toString(36).slice(2, 8), name: title || 'Page', url: url, tags: [], pinned: false };
  tools.push(newTool);
  await chrome.storage.sync.set({ tools });
  await chrome.storage.local.set({ lastOp: { type: 'tool', id: newTool.id, timestamp: Date.now() } });
}

async function addFeed(targetUrl) {
  try {
    let html = '';
    try { const res = await fetch(targetUrl); html = await res.text(); }
    catch (e) { try { const p = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(targetUrl)); html = await p.text(); } catch (e2) { } }
    if (!html) return;
    const urls = [...html.matchAll(/<link[^>]+rel=['"]alternate['"][^>]+>/gi)].map(m => m[0]).map(t => { const u = (t.match(/href=['"]([^'"]+)['"]/i) || [])[1] || ''; return u; }).filter(Boolean);
    const abs = urls.map(u => { try { return new URL(u, targetUrl).toString() } catch { return null } }).filter(Boolean);
    const { feeds = [] } = await chrome.storage.sync.get('feeds');
    let added = false;
    abs.forEach(u => {
      if (!feeds.find(x => x.url === u)) {
        feeds.push({ id: 'f' + Math.random().toString(36).slice(2, 8), url: u, title: u, tags: [], enabled: true, addedAt: Date.now() });
        added = true;
      }
    });
    if (added) {
      await chrome.storage.sync.set({ feeds });
      const { feeds: updated = [] } = await chrome.storage.sync.get('feeds');
      const last = updated[updated.length - 1]; // logic for undo relies on last one added
      await chrome.storage.local.set({ lastOp: { type: 'feed', id: last.id, timestamp: Date.now() } });
    }
  } catch (e) { console.error(e); }
}

async function undoLast() {
  const { lastOp } = await chrome.storage.local.get('lastOp');
  if (!lastOp || (Date.now() - lastOp.timestamp > 60000)) return; // 1 min limit
  if (lastOp.type === 'tool') {
    const { tools = [] } = await chrome.storage.sync.get('tools');
    const idx = tools.findIndex(x => x.id === lastOp.id);
    if (idx >= 0) { tools.splice(idx, 1); await chrome.storage.sync.set({ tools }); }
  }
  if (lastOp.type === 'feed') {
    const { feeds = [] } = await chrome.storage.sync.get('feeds');
    const idx = feeds.findIndex(x => x.id === lastOp.id);
    if (idx >= 0) { feeds.splice(idx, 1); await chrome.storage.sync.set({ feeds }); }
  }
  await chrome.storage.local.remove('lastOp');
}

/* Chat Logic */
async function performAiChat(request, sendResponse) {
  try {
    const { message, model, images } = request; // images is array of base64 strings
    const { ai, ai_custom } = await chrome.storage.sync.get(['ai', 'ai_custom']);
    const { ai_key } = await chrome.storage.local.get('ai_key');
    const key = ai_key || ai?.key;

    if (!key) { return sendResponse({ error: 'API key not found' }); }

    let url, headers, userContent;

    // Prepare content (text or multimodal)
    if (images && images.length > 0) {
      userContent = [
        { type: "text", text: message },
        ...images.map(img => ({ type: "image_url", image_url: { url: img } }))
      ];
    } else {
      userContent = message;
    }

    // Build Request
    if (ai.provider === 'academiccloud') {
      const base = 'https://saia.gwdg.de/v1';
      url = `${base}/chat/completions`;
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` };
    } else if (ai.provider === 'openai') {
      url = 'https://api.openai.com/v1/chat/completions';
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` };
    } else { // custom
      const base = (ai_custom?.base || '').replace(/\/$/, '');
      const path = ai_custom?.path || '/v1/chat/completions';
      url = base + (path.startsWith('/') ? path : '/' + path);
      headers = { 'Content-Type': 'application/json' };
      const authHeader = ai_custom?.authHeader || 'Authorization';
      if (authHeader.toLowerCase() === 'authorization') headers[authHeader] = `Bearer ${key}`;
      else headers[authHeader] = key;
    }

    const body = JSON.stringify({
      model: model || ((ai.provider === 'openai') ? 'gpt-3.5-turbo' : ai_custom?.model),
      messages: [{ role: 'user', content: userContent }]
    });

    const res = await fetch(url, { method: 'POST', headers, body });
    const data = await res.json();
    if (data.choices?.[0]?.message) {
      sendResponse({ text: data.choices[0].message.content });
    } else {
      sendResponse({ error: 'Unexpected API response', data });
    }
  } catch (e) {
    sendResponse({ error: e.message });
  }
}

async function generateImage(request, sendResponse) {
  try {
    const { prompt } = request;
    const { ai } = await chrome.storage.sync.get(['ai']);
    const { ai_key } = await chrome.storage.local.get('ai_key');
    const key = ai_key || ai?.key;

    if (!key) return sendResponse({ error: 'API key not found' });

    let url = '', headers = {};
    if (ai.provider === 'academiccloud') {
      url = 'https://saia.gwdg.de/v1/images/generations';
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` };
    } else {
      return sendResponse({ error: 'Image generation only supported on Academic Cloud (configured) for now.' });
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt, size: "512x512", n: 1 })
    });
    const data = await res.json();

    if (data.data && data.data.length > 0 && data.data[0].url) {
      sendResponse({ imageUrl: data.data[0].url });
    } else if (data.data && data.data.length > 0 && data.data[0].b64_json) {
      sendResponse({ imageUrl: 'data:image/png;base64,' + data.data[0].b64_json });
    } else {
      sendResponse({ error: 'Failed to generate image', data });
    }
  } catch (e) {
    sendResponse({ error: e.message });
  }
}

async function transcribeAudio(request, sendResponse) {
  try {
    const { audioBlob } = request; // base64 encoded data url of audio
    // Need to convert base64 data URL back to blob/file to send as multipart
    const res2 = await fetch(audioBlob);
    const blob = await res2.blob();

    const { ai } = await chrome.storage.sync.get(['ai']);
    const { ai_key } = await chrome.storage.local.get('ai_key');
    const key = ai_key || ai?.key;
    if (!key) return sendResponse({ error: 'API key not found' });

    if (ai.provider !== 'academiccloud') return sendResponse({ error: 'Voice only supported on Academic Cloud.' });

    const formData = new FormData();
    formData.append('file', blob, 'recording.webm');
    formData.append('model', 'whisper-large-v2');
    formData.append('response_format', 'text');

    const res = await fetch('https://saia.gwdg.de/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}` },
      body: formData
    });

    if (res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      sendResponse({ text: data.text || JSON.stringify(data) });
    } else {
      const text = await res.text();
      sendResponse({ text: text });
    }

  } catch (e) {
    sendResponse({ error: e.message });
  }
}

async function getModels(sendResponse) {
  try {
    const { ai } = await chrome.storage.sync.get('ai');
    const { ai_key } = await chrome.storage.local.get('ai_key');
    const key = ai_key || ai?.key;

    if (ai?.provider === 'academiccloud' && key) {
      const res = await fetch('https://saia.gwdg.de/v1/models', { headers: { 'Authorization': `Bearer ${key}` } });
      const data = await res.json();
      if (data.data) {
        sendResponse({
          models: data.data.map(m => {
            let caps = m.input || ['text'];
            // Heuristic for vision if not explicitly stated
            const id = (m.id || '').toLowerCase();
            if (id.includes('vl') || id.includes('vision') || id.includes('gpt-4-turbo') || id.includes('gpt-4o')) {
              if (!caps.includes('image')) caps = [...caps, 'image'];
            }
            return { id: m.id, name: m.name || m.id, capabilities: caps };
          })
        });
        return;
      }
    }
    // Fallback
    sendResponse({ models: [{ id: 'error', name: 'Could not fetch. Check Key.' }] });
  } catch (e) {
    console.error(e);
    sendResponse({ models: [] });
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'chat_request') {
    performAiChat(request, sendResponse);
    return true;
  } else if (request.type === 'image_request') {
    generateImage(request, sendResponse);
    return true;
  } else if (request.type === 'audio_request') {
    transcribeAudio(request, sendResponse);
    return true;
  } else if (request.type === 'get_models') {
    getModels(sendResponse);
    return true;
  } else if (request.type === 'fridai_add_tool') {
    addTool(request.url, request.title);
  } else if (request.type === 'fridai_add_feed') {
    addFeed(request.url);
  } else if (request.type === 'undo_last') {
    undoLast();
  }
  return false;
});
