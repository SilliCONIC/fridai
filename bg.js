
chrome.runtime.onInstalled.addListener(()=>{
  chrome.contextMenus.create({id:'fridai_root',title:'Add to FridAI',contexts:['page','link']});
  chrome.contextMenus.create({id:'fridai_add_tool',parentId:'fridai_root',title:'Add page as Tool',contexts:['page','link']});
  chrome.contextMenus.create({id:'fridai_add_feed',parentId:'fridai_root',title:'Detect & Add Feeds',contexts:['page','link']});
});

chrome.contextMenus.onClicked.addListener(async(info,tab)=>{
  if(info.menuItemId==='fridai_add_tool' && tab?.url){
    const url = info.linkUrl || tab.url;
    const title = info.selectionText || tab.title || url;
    const {tools=[]}=await chrome.storage.sync.get('tools');
    const newTool = {id:'t'+Math.random().toString(36).slice(2,8),name:title||'Page',url:url,tags:[],pinned:false};
    tools.push(newTool);
    await chrome.storage.sync.set({tools});
    await chrome.storage.local.set({lastOp:{type:'tool', id:newTool.id, timestamp:Date.now()}});
  }
  if(info.menuItemId==='fridai_add_feed' && tab?.url){
    try{
      const targetUrl = info.linkUrl || tab.url;
      let html=''; let usedProxy=false;
      try{ const res=await fetch(targetUrl); html=await res.text(); }
      catch(e){ try{ const p = await fetch('https://api.allorigins.win/raw?url='+encodeURIComponent(targetUrl)); html = await p.text(); usedProxy = true; }catch(e2){} }
      if(!html) return;
      const urls=[...html.matchAll(/<link[^>]+rel=['"]alternate['"][^>]+>/gi)].map(m=>m[0]).map(t=>{ const u=(t.match(/href=['"]([^'"]+)['"]/i)||[])[1]||''; return u; }).filter(Boolean);
      const abs=urls.map(u=>{ try{return new URL(u, tab.url).toString()}catch{return null}}).filter(Boolean);
      const {feeds=[]}=await chrome.storage.sync.get('feeds');
      abs.forEach(u=>feeds.push({id:'f'+Math.random().toString(36).slice(2,8),url:u,title:u,tags:[],enabled:true,addedAt:Date.now()}));
      await chrome.storage.sync.set({feeds});
      if(abs.length){
        const {feeds:updated=[]}=await chrome.storage.sync.get('feeds');
        const last = updated[updated.length-1];
        await chrome.storage.local.set({lastOp:{type:'feed', id:last.id, timestamp:Date.now()}});
      }
    }catch(e){}
  }
});

async function performAiChat(request, sendResponse) {
  try {
    const { message, model } = request;
    const { ai, ai_custom } = await chrome.storage.sync.get(['ai', 'ai_custom']);
    const { ai_key } = await chrome.storage.local.get('ai_key');
    const key = ai_key || ai.key;

    if (!key) {
      sendResponse({ error: 'API key not found' });
      return;
    }

    let url, headers, body;

    if (ai.provider === 'openai') {
      url = 'https://api.openai.com/v1/chat/completions';
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` };
      body = JSON.stringify({ model: model || 'gpt-3.5-turbo', messages: [{ role: 'user', content: message }] });
    } else if (ai.provider === 'custom' || ai.provider === 'academiccloud') {
      const base = (ai_custom.base || '').replace(/\/$/, '');
      const path = ai_custom.path || '/v1/chat/completions';
      url = base + (path.startsWith('/') ? path : '/' + path);
      headers = { 'Content-Type': 'application/json' };
      const authHeader = ai_custom.authHeader || 'Authorization';
      if (authHeader.toLowerCase() === 'authorization') {
        headers[authHeader] = `Bearer ${key}`;
      } else {
        headers[authHeader] = key;
      }
      body = JSON.stringify({ model: model || ai_custom.model, messages: [{ role: 'user', content: message }] });
    }

    const res = await fetch(url, { method: 'POST', headers, body });
    const data = await res.json();

    if (data.choices && data.choices[0] && data.choices[0].message) {
      sendResponse({ text: data.choices[0].message.content });
    } else {
      sendResponse({ error: 'Unexpected API response', data });
    }
  } catch (e) {
    sendResponse({ error: e.message });
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'chat_request') {
    performAiChat(request, sendResponse);
    return true; // Indicates that the response is sent asynchronously
  } else if (request.type === 'get_models') {
    // This can be expanded to fetch models from the provider
    const models = [
      { id: 'meta-llama-3.1-8b-instruct', name: 'Llama 3.1 8B' },
      { id: 'meta-llama-3.1-70b-instruct', name: 'Llama 3.1 70B' },
      { id: 'openai-gpt-oss-120b', name: 'GPT-OSS 120B' },
    ];
    sendResponse({ models });
  }
  return false;
});
