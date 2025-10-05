
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
      const urls=[...html.matchAll(/<link[^>]+rel=["']alternate["'][^>]+>/gi)].map(m=>m[0]).map(t=>{ const u=(t.match(/href=["']([^"']+)["']/i)||[])[1]||''; return u; }).filter(Boolean);
      const abs=urls.map(u=>{ try{return new URL(u, tab.url).toString()}catch{return null}}).filter(Boolean);
      const {feeds=[]}=await chrome.storage.sync.get('feeds');
      abs.forEach(u=>feeds.push({id:'f'+Math.random().toString(36).slice(2,8),url:u,title:u,tags:[],enabled:true,addedAt:Date.now()}));
      await chrome.storage.sync.set({feeds});
      if(abs.length){ const {feeds:updated=[]}=await chrome.storage.sync.get('feeds'); const last = updated[updated.length-1]; await chrome.storage.local.set({lastOp:{type:'feed', id:last.id, timestamp:Date.now(), viaProxy: usedProxy}}); }
    }catch(e){}
  }
});

// When the toolbar icon is clicked, open Options prefilled to add current page
chrome.action.onClicked.addListener(async (tab) => {
  try{
    const target = tab?.id;
    if(!target) return;
    // inject the modal UI into the page using a function so chrome.runtime.getURL is available
    await chrome.scripting.executeScript({
      target: { tabId: target },
      func: (icoUrl) => {
        if(window.__fridai_modal_installed) return; window.__fridai_modal_installed=true;
        const css = `
        #fridai-modal{position:fixed;right:18px;bottom:18px;background:rgba(0,0,0,0.92);color:#fff;padding:12px;border-radius:10px;z-index:2147483647;min-width:300px;box-shadow:0 8px 30px rgba(0,0,0,0.6);font-family:system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;font-size:13px}
        #fridai-modal .hdr{display:flex;align-items:center;gap:8px}
        #fridai-modal img{height:28px;width:28px;object-fit:contain}
        #fridai-modal .row{display:flex;gap:8px;margin-top:10px}
        #fridai-modal button{background:#2b72ff;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer}
        #fridai-modal .secondary{background:#444}
        #fridai-modal .sub{margin-top:6px;font-size:12px;color:#d0d6df;word-break:break-all}
        `;
        const s = document.createElement('style'); s.textContent=css; document.documentElement.appendChild(s);
        const modal = document.createElement('div'); modal.id='fridai-modal';
        const logo = `<img src='${icoUrl}' alt='FridAI'>`;
        modal.innerHTML = `<div class="hdr"><strong>${logo}Add to FridAI</strong></div><div class="sub">${location.href}</div><div class="row"><button id="fridai-add-tool">Add as Tool</button><button id="fridai-add-feed" class="secondary">Detect & Add Feed</button><button id="fridai-close" class="secondary">Close</button></div>`;
        document.documentElement.appendChild(modal);
        document.getElementById('fridai-close').onclick = ()=>{ modal.remove(); s.remove(); window.__fridai_modal_installed=false; };
        document.getElementById('fridai-add-tool').onclick = ()=>{ chrome.runtime.sendMessage({type:'fridai_add_tool',url:location.href,title:document.title}); modal.remove(); s.remove(); window.__fridai_modal_installed=false; };
        document.getElementById('fridai-add-feed').onclick = ()=>{ chrome.runtime.sendMessage({type:'fridai_add_feed',url:location.href}); modal.remove(); s.remove(); window.__fridai_modal_installed=false; };
      },
      args: [ chrome.runtime.getURL('ico.png') ]
    });
  }catch(e){ }
});

// Handle messages from injected modal
chrome.runtime.onMessage.addListener(async (msg, _sender) => {
  // AI summarize request
  if(msg?.type==='summarize_ai' && msg.url){
    const aiConf = (await chrome.storage.sync.get('ai'))?.ai || {}; const custom = (await chrome.storage.sync.get('ai_custom'))?.ai_custom || {}; const local = (await chrome.storage.local.get('ai_key'))?.ai_key;
    const key = local || aiConf.key || '';
    // fetch page content (try direct, then no proxy here)
    try{
      const r = await fetch(msg.url); const html = await r.text();
  // naive text extract
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  // token estimator (approx): 1 token ~= 4 characters for many languages
  const approxTokens = s=> Math.max(1, Math.ceil(s.length / 4));
  const maxTokensPerReq = 3000; // conservative default
  const maxCharsPerReq = maxTokensPerReq * 4;
  const chunks = [];
  for(let i=0;i<text.length;i+=maxCharsPerReq){ chunks.push(text.slice(i,i+maxCharsPerReq)); }
  // write initial progress
  await chrome.storage.local.set({summ_progress: {state:'started',total:chunks.length,done:0}});
  if(!key) return Promise.resolve({ok:false,error:'no_key'});
      // pick endpoint and headers based on provider selection/custom config
      const provider = aiConf.provider || 'openai';
      // support academiccloud preset
      if(provider === 'academiccloud'){
        // set custom base/path/model defaults
        custom.base = custom.base || 'https://chat-ai.academiccloud.de/v1';
        custom.path = custom.path || '/chat/completions';
        custom.authHeader = custom.authHeader || 'Authorization';
        custom.model = custom.model || 'meta-llama-3.1-8b-instruct';
      }
      let url='https://api.openai.com/v1/chat/completions'; let headers={'Content-Type':'application/json'}; let body=null;
      if(provider==='custom'){
        const base = (custom && custom.base) ? custom.base.replace(/\/$/,'') : ''; const path = custom && custom.path ? custom.path : '/v1/chat/completions';
        if(!base) return Promise.resolve({ok:false,error:'no_base'});
        url = base + (path.startsWith('/')?path:('/'+path));
        // parse auth header spec: allow "Name: value" or just "Name"
        const hdrSpec = (custom && custom.authHeader) ? custom.authHeader : 'Authorization';
        let hdrName = 'Authorization'; let hdrValue = key;
        if(hdrSpec.includes(':')){
          const parts = hdrSpec.split(':'); hdrName = parts[0].trim(); const maybeVal = parts.slice(1).join(':').trim(); hdrValue = maybeVal || ((hdrName.toLowerCase()==='authorization')?('Bearer '+key):key);
        } else { hdrName = hdrSpec.trim(); hdrValue = (hdrName.toLowerCase()==='authorization')?('Bearer '+key):key; }
        headers[hdrName] = hdrValue;
        // If the custom path looks like a completions endpoint (/completions), send a prompt-style body
        if((path||'').toLowerCase().includes('completions')){
          const prompt = 'Summarize the following content into 3 short sentences and 3 bullet highlights:\n\n' + text;
          body = JSON.stringify({ model: custom.model || 'meta-llama-3.1-8b-instruct', prompt, max_tokens: 300, temperature: 0 });
        } else {
          // default to chat-like body
          body = JSON.stringify({ model: custom.model || 'gpt-3.5-turbo', messages: [{role:'system',content:'You are a helpful summarizer.'},{role:'user',content:'Summarize the following content into 3 short sentences and 3 bullet highlights:\n\n'+text}], max_tokens:300 });
        }
      }else{
        headers['Authorization'] = 'Bearer '+key;
        body = JSON.stringify({ model: 'gpt-3.5-turbo', messages: [{role:'system',content:'You are a helpful summarizer.'},{role:'user',content:'Summarize the following content into 3 short sentences and 3 bullet highlights:\n\n'+text}], max_tokens:300 });
      }
      try{
        const summaries = [];
        let idx = 0;
        for(const c of chunks){
          idx++;
          await chrome.storage.local.set({summ_progress:{state:'running', total:chunks.length, done: idx-1, current: idx}});
          // build per-chunk body similarly
          let perBody = body;
          // replace prompt if present
          try{
            const parsed = JSON.parse(body);
            if(parsed.prompt) parsed.prompt = 'Summarize the following content into 2 short sentences and 2 bullet highlights:\n\n' + c;
            if(parsed.messages) parsed.messages = [{role:'system',content:'You are a helpful summarizer.'},{role:'user',content:'Summarize the following content into 2 short sentences and 2 bullet highlights:\n\n'+c}];
            perBody = JSON.stringify(parsed);
          }catch(e){ perBody = body; }
          // retries with exponential backoff
          let resp=null; let attempt=0; const maxAttempts=3; let lastErr=null;
          while(attempt<maxAttempts){
            try{ resp = await fetch(url, { method:'POST', headers, body: perBody });
              if(resp && resp.ok) break; else { lastErr = resp; }
            }catch(e){ lastErr = e; }
            attempt++; await new Promise(r=>setTimeout(r, 300 * Math.pow(2, attempt)));
          }
          if(!resp || !resp.ok) { return Promise.resolve({ok:false,error:'api_error', detail: String(lastErr)}); }
          const json = await resp.json();
          let out = '';
          if(json.choices && json.choices[0]){ out = (json.choices[0].message && json.choices[0].message.content) || json.choices[0].text || ''; }
          if(!out && json.result && (json.result.summary || json.result.text)) out = json.result.summary || json.result.text;
          if(!out && json.data && json.data[0] && json.data[0].text) out = json.data[0].text;
          summaries.push(out||'');
          // small delay to avoid rate limits
          await new Promise(r=>setTimeout(r,150));
        }
        // Combine summaries into a final meta-summary
        const combined = summaries.join('\n\n');
        // Optionally run one more summarization pass through the provider for a concise result
        try{
          const finalPayload = JSON.stringify({ model: custom.model || 'meta-llama-3.1-8b-instruct', prompt: 'Create a concise 3-sentence summary and 3 bullets from the following excerpts:\n\n' + combined, max_tokens: 300, temperature: 0 });
          const finalResp = await fetch(url, { method:'POST', headers, body: finalPayload });
          if(finalResp.ok){ const fj = await finalResp.json(); const fout = (fj.choices && fj.choices[0] && (fj.choices[0].text || (fj.choices[0].message && fj.choices[0].message.content))) || fj.result?.summary || fj.data?.[0]?.text || ''; return Promise.resolve({ok:true,summary:fout||combined}); }
        }catch(e){}
        return Promise.resolve({ok:true,summary:combined});
      }catch(e){ return Promise.resolve({ok:false,error:'api_exception'}); }
    }catch(e){ return Promise.resolve({ok:false,error:'fetch_failed'}); }
  }
  if(msg?.type==='fridai_add_tool' && msg.url){
    const {tools=[]}=await chrome.storage.sync.get('tools');
    tools.push({id:'t'+Math.random().toString(36).slice(2,8),name:msg.title||msg.url,url:msg.url,tags:[],pinned:false});
    await chrome.storage.sync.set({tools});
    // record last operation for undo
    const last = {type:'tool', id: tools[tools.length-1].id, timestamp: Date.now()};
    await chrome.storage.local.set({lastOp:last});
    return;
  }
  if(msg?.type==='fridai_add_feed' && msg.url){
    try{
      let html=''; let usedProxy=false;
      try{ const r=await fetch(msg.url); html=await r.text(); }
      catch(e){
        // try proxy fallback to avoid CORS blocking when invoked from toolbar/context
        try{ const p = await fetch('https://api.allorigins.win/raw?url='+encodeURIComponent(msg.url)); html = await p.text(); usedProxy = true; }
        catch(e2){ /* give up if proxy also fails */ }
      }
      if(!html) return;
      const urls=[...html.matchAll(/<link[^>]+rel=["']alternate["'][^>]+>/gi)].map(m=>m[0]).map(t=>{const u=(t.match(/href=["']([^"']+)["']/i)||[])[1]||''; return u;}).filter(Boolean);
      const abs=urls.map(u=>{ try{return new URL(u, msg.url).toString()}catch{return null}}).filter(Boolean);
      const {feeds=[]}=await chrome.storage.sync.get('feeds');
      abs.forEach(u=>feeds.push({id:'f'+Math.random().toString(36).slice(2,8),url:u,title:u,tags:[],enabled:true,addedAt:Date.now()}));
      await chrome.storage.sync.set({feeds});
      // record last op (if any feeds added, record the last one's id)
      if(abs.length){
        const {feeds:updated=[]}=await chrome.storage.sync.get('feeds');
        const last = updated[updated.length-1];
        await chrome.storage.local.set({lastOp:{type:'feed', id:last.id, timestamp:Date.now(), viaProxy: usedProxy}});
      }
    }catch(e){ console.error('fridai_add_feed failed', e); }
  }
  // handle undo message
  if(msg?.type==='undo_last'){
    const obj = (await chrome.storage.local.get('lastOp'))?.lastOp;
    if(!obj) return;
    if(obj.type==='tool'){
      const {tools=[]}=await chrome.storage.sync.get('tools');
      const i=tools.findIndex(t=>t.id===obj.id); if(i>=0) { tools.splice(i,1); await chrome.storage.sync.set({tools}); }
    }else if(obj.type==='feed'){
      const {feeds=[]}=await chrome.storage.sync.get('feeds');
      const i=feeds.findIndex(f=>f.id===obj.id); if(i>=0) { feeds.splice(i,1); await chrome.storage.sync.set({feeds}); }
    }
    await chrome.storage.local.remove('lastOp');
    return;
  }
});
