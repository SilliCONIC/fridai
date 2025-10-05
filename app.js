
const $=s=>document.querySelector(s);
const state={city:null, tools:[], feeds:[], items:{}, settings:{useProxy:false,autoSummarize:false,maxSummariesPerFeed:3,hideFooter:false}};

function logLine(type,msg){const el=$("#log"); if(!el) return; const d=document.createElement('div'); d.className=type==='error'?'err':''; d.textContent=`[${new Date().toLocaleTimeString()}] ${msg}`; el.prepend(d);}
$("#logClear")?.addEventListener('click',()=>{$("#log").innerHTML=''});

document.addEventListener('click',e=>{const h=e.target.closest('h2,h3'); if(!h) return; h.parentElement.classList.toggle('collapsed');});

$("#btnOpt")?.addEventListener('click',()=> chrome.runtime.openOptionsPage());

(async function boot(){
  $("#ver").textContent='v'+chrome.runtime.getManifest().version;
  // AI status badge
  (async ()=>{
    const ai = (await chrome.storage.sync.get('ai'))?.ai || {};
    const local = (await chrome.storage.local.get('ai_key'))?.ai_key;
    const el = document.createElement('div'); el.style.fontSize='12px'; el.style.color='var(--muted)'; el.style.textAlign='right'; el.style.padding='4px 8px';
    el.id='aiStatus'; el.textContent = ai.provider ? `${ai.provider}${(local||ai.key)?' • key set':''}` : 'AI: none';
    const hdr = document.querySelector('.header'); if(hdr) hdr.appendChild(el);
  })();
  Object.assign(state.settings, (await chrome.storage.sync.get('settings'))?.settings || {});
  if(state.settings.hideFooter){ const ft=document.querySelector('.footer'); if(ft) ft.style.display='none'; }

  // tools
  state.tools=(await chrome.storage.sync.get('tools'))?.tools || [
    {id:'t1',name:'ChatGPT',url:'https://chat.openai.com',tags:['LLM','chat'],pinned:true},
    {id:'t2',name:'Perplexity',url:'https://www.perplexity.ai',tags:['search','LLM'],pinned:true},
    {id:'t3',name:'Claude',url:'https://claude.ai',tags:['LLM','chat'],pinned:false},
    {id:'t4',name:'Hugging Face',url:'https://huggingface.co',tags:['models','ml'],pinned:false}
  ];
  renderTools();

  // city from storage
  state.city=(await chrome.storage.sync.get('city'))?.city || null;
  if(state.city){ await refreshCity(); } else { const blk=$("#cityBlock"); if(blk) blk.innerHTML='<div class="subrow">Set your city in Settings (⚙️) to see weather here.</div>'; }
  $("#cityFind")?.addEventListener('click', findCity);
  $("#cityInput")?.addEventListener('keydown', e=>{ if(e.key==='Enter') findCity(); });

  // Iran block
  await refreshIran();
  setInterval(()=>{ updateTimeIn($("#cityBlock")); updateTimeIn($("#iranBlock")); }, 1000);

  // feeds
  await bootFeeds();

  
  const tRef=$("#todayRefresh"); if(tRef){ tRef.addEventListener('click', (e)=>{ e.stopPropagation(); refreshFeeds(); }); }
  const fRef=$("#feedsRefresh"); if(fRef){ fRef.addEventListener('click', (e)=>{ e.stopPropagation();
      const sel = document.getElementById('feedSelect'); const selVal = sel ? sel.value : 'all';
      if(selVal === 'all') { refreshFeeds(); }
      else {
        (async ()=>{
          const f = state.feeds.find(x=>x.id===selVal); if(!f) return;
          try{
            const txt = await fetchText(f.url); const p = parseFeed(txt,f.url); f.title = p.title || f.url;
            const prev = state.items[f.id]||[]; const map = new Map(prev.map(it=>[it.id,it]));
            state.items[f.id] = (p.items||[]).map(it=>({id:it.id,title:it.title,url:it.url,date:it.date,summary:it.summary,read:map.get(it.id)?.read||false,starred:map.get(it.id)?.starred||false,localSummary:map.get(it.id)?.localSummary||''})).slice(0,200);
            await chrome.storage.local.set({feedItems: state.items}); await chrome.storage.sync.set({feeds: state.feeds}); renderFeedSelect(); renderFeeds(); renderToday();
          }catch(e){ showToast('Could not refresh selected feed'); }
        })();
      }
    }); }

  // calendar
  $("#calRefresh")?.addEventListener('click', refreshCalendar);
  
  await refreshCalendar();

  // search
  let active='google';
  document.querySelectorAll('.provider').forEach(p=> p.addEventListener('click',()=>{ active=p.dataset.p; runSearch(active); }));
  $("#qs")?.addEventListener('keydown',e=>{ if(e.key==='Enter') runSearch('google'); });

  // header search filters tools
  $("#hdrSearch")?.addEventListener('input',()=>{ $("#toolFilter").value=$("#hdrSearch").value; renderTools(); });
})().catch(e=> logLine('error','boot failed: '+(e.message||e)));

function runSearch(p){
  const q=($("#qs")?.value||'').trim(); if(!q) return;
  const map={google:`https://www.google.com/search?q=${encodeURIComponent(q)}`,
    chatgpt:`https://chat.openai.com/?q=${encodeURIComponent(q)}`,
    perplexity:`https://www.perplexity.ai/search?q=${encodeURIComponent(q)}`,
    ddg:`https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
    pubmed:`https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(q)}`};
  const url=map[p]; if(url) chrome.tabs.create({url});
}

function showToast(msg,timeout=2200){ const el=document.getElementById('toast'); if(!el) return; el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),timeout); }

/* Tools */
function renderTools(){
  const f=($("#toolFilter")?.value||'').toLowerCase(), tg=($("#toolTag")?.value||'').toLowerCase();
  const list=[...state.tools].sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||a.name.localeCompare(b.name))
    .filter(t=> (!f || t.name.toLowerCase().includes(f)) && (!tg || (t.tags||[]).some(x=>x.toLowerCase().includes(tg))));
  $("#tools").innerHTML = list.map(t=>`<div class="tool"><div class="name">${t.name}</div><a class="url" href="${t.url}" target="_blank">${t.url}</a><div class="tags">${(t.tags||[]).map(x=>`<span class="chip">${x}</span>`).join('')}</div></div>`).join('');
  document.querySelectorAll('#tools .tool').forEach((el,i)=>{
    const t = list[i]; const btn=document.createElement('button'); btn.className='iconbtn'; btn.textContent = t.pinned? '★' : '☆'; btn.title='Pin/Unpin'; btn.onclick=async ()=>{ t.pinned=!t.pinned; const {tools=[]}=await chrome.storage.sync.get('tools'); const idx=tools.findIndex(x=>x.id===t.id); if(idx>=0) tools[idx].pinned=t.pinned; else tools.push(t); await chrome.storage.sync.set({tools}); renderTools(); };
    el.insertBefore(btn, el.firstChild);
  });
}

/* Weather/Time */

async function refreshCity(){
  if(!state.city) return;
  try{
    const url=new URL("https://api.open-meteo.com/v1/forecast"); url.searchParams.set("latitude",state.city.lat); url.searchParams.set("longitude",state.city.lon); url.searchParams.set("current_weather","true"); url.searchParams.set("daily","temperature_2m_max,temperature_2m_min,weathercode"); url.searchParams.set("timezone",state.city.timezone||'auto');
    const r=await fetch(url); const data=await r.json(); $("#cityBlock").innerHTML = weatherBlock(data, state.city.name, state.city.timezone, false);
  }catch(e){ logLine('error','weather failed'); }
}
async function refreshIran(){
  try{
    const url=new URL("https://api.open-meteo.com/v1/forecast"); url.searchParams.set("latitude",35.6892); url.searchParams.set("longitude",51.3890); url.searchParams.set("current_weather","true"); url.searchParams.set("daily","temperature_2m_max,temperature_2m_min,weathercode"); url.searchParams.set("timezone","Asia/Tehran");
    const r=await fetch(url); const data=await r.json(); $("#iranBlock").innerHTML = weatherBlock(data, "Tehran", "Asia/Tehran", true);
  }catch(e){ logLine('error','tehran weather failed'); }
}
function weatherBlock(data, label, tz, jalali){
  const map={0:'☀️',1:'🌤️',2:'⛅',3:'☁️',45:'🌫️',48:'🌫️',51:'🌦️',53:'🌦️',55:'🌦️',56:'🌧️',57:'🌧️',61:'🌧️',63:'🌧️',65:'🌧️',66:'🌧️',67:'🌧️',71:'❄️',73:'❄️',75:'❄️',77:'🌨️',80:'🌧️',81:'🌧️',82:'🌧️',85:'❄️',86:'❄️',95:'⛈️',96:'⛈️',99:'⛈️'};
  const cw=data?.current_weather||{}; const min=data?.daily?.temperature_2m_min?.[0], max=data?.daily?.temperature_2m_max?.[0], icon=map[cw.weathercode]||'🌡️';
  const dateStr = jalali ? jalaliString(new Date(), tz) : new Intl.DateTimeFormat(undefined,{year:'numeric',month:'long',day:'numeric',weekday:'short', timeZone:tz}).format(new Date());

    return `<div class="weathertime">
    <div class="left"><div class="iconbig">${icon}</div><div class="tempbig">${Math.round(cw.temperature||0)}°</div></div>
    <div class="right"><div class="timebig" data-tz="${tz}"></div></div>
  </div>
  <div class="weathertime">
    <div class="subrow">Wind ${Math.round(cw.windspeed||0)} km/h</div><div class="subrow">Today: ${min!=null?Math.round(min):'-'}° / ${max!=null?Math.round(max):'-'}°</div>
  </div>
  <div class="weathertime">
    <div class="subrow"><span class="datebold" data-date="${tz}" data-j="${jalali?'1':'0'}">${dateStr}</span><br><span class="tzsmall">TZ: ${tz}</span> . <span class="tzsmall">${label}</span></div>
  </div>
  `;
}
function updateTimeIn(root){
  if(!root) return;
  root.querySelectorAll('.timebig').forEach(el=>{
    const tz=el.getAttribute('data-tz');
    el.textContent='🕒 '+new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:tz}).format(new Date());
  });
  root.querySelectorAll('[data-date]').forEach(el=>{
    const tz=el.getAttribute('data-date'); const jal=el.getAttribute('data-j')==='1';
    el.textContent = jal ? jalaliString(new Date(), tz) : new Intl.DateTimeFormat(undefined,{year:'numeric',month:'long',day:'numeric',weekday:'short', timeZone:tz}).format(new Date());
  });
}
function jalaliString(date,tz){ // simple Jalali conversion via Intl + algorithm
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).reduce((a,p)=>(a[p.type]=p.value,a),{});
  const gy=parseInt(parts.year,10), gm=parseInt(parts.month,10), gd=parseInt(parts.day,10);
  const jdn=gregorianToJdn(gy,gm,gd); const [jy,jm,jd]=jdnToJalaali(jdn); const m=['Farvardin','Ordibehesht','Khordad','Tir','Mordad','Shahrivar','Mehr','Aban','Azar','Dey','Bahman','Esfand']; return `${jd} ${m[jm-1]} ${jy}`;
}
function div(a,b){return Math.floor(a/b)}
function gregorianToJdn(gy,gm,gd){let a=div(14-gm,12),y=gy+4800-a,m=gm+12*a-3;return gd+div(153*m+2,5)+365*y+div(y,4)-div(y,100)+div(y,400)-32045}
function jalaaliToJdn(jy,jm,jd){let epbase=jy-(jy>=0?474:473),epyear=474+(epbase%2820);return jd+(jm<=7?(jm-1)*31:(jm-7)*30+186)+div((epyear*682-110),2816)+(epyear-1)*365+div(epbase,2820)*1029983+(1948320-1)}
function jdnToJalaali(jdn){let depoch=jdn-jalaaliToJdn(475,1,1),cycle=div(depoch,1029983),cyear=depoch%1029983,ycycle;if(cyear===1029982){ycycle=2820}else{let aux1=div(cyear,366),aux2=cyear%366;ycycle=div(2134*aux1+2816*aux2+2815,1028522)+aux1+1}let jy=ycycle+2820*cycle+474;if(jy<=0)--jy;let jdn1f=jalaaliToJdn(jy,1,1),jd=jdn-jdn1f+1,jm=jd<=186?Math.ceil(jd/31):Math.ceil((jd-186)/30)+6,firstDay=jd<=186?((jm-1)*31):(186+(jm-7)*30),day=jd-firstDay;return [jy,jm,day]}

/* Feeds & Today */
async function bootFeeds(){
  state.settings = Object.assign(state.settings, (await chrome.storage.sync.get('settings'))?.settings || {});
  state.feeds=(await chrome.storage.sync.get('feeds'))?.feeds;
  // feed items can be large; store them in local storage to avoid chrome.storage.sync per-item size quotas
  state.items=(await chrome.storage.local.get('feedItems'))?.feedItems || {};
  $("#feedsRefresh")?.addEventListener('click', refreshFeeds);
  
  $("#todayRefresh")?.addEventListener('click', refreshFeeds);
  // feedSearch and toggleStar controls removed from the UI; guard their usage in renderFeeds
  await refreshFeeds();
  // ensure feedSelect change updates feeds list and clear any today-filter when user picks manually
  const feedSel = document.getElementById('feedSelect'); if(feedSel) feedSel.addEventListener('change', ()=>{ delete feedSel.dataset.filter; renderFeeds(); });
}
async function fetchText(url){
  try{ const r=await fetch(url); if(!r.ok) throw new Error('HTTP '+r.status); return await r.text(); }
  catch(e){ if(state.settings.useProxy){ const r=await fetch('https://api.allorigins.win/raw?url='+encodeURIComponent(url)); if(!r.ok) throw new Error('Proxy HTTP '+r.status); return await r.text(); } throw e; }
}
function parseFeed(text, url){
  try{ const o=JSON.parse(text); if(o.items||o.entries){ const items=(o.items||o.entries).map(it=>({id:it.id||it.url||it.title,title:it.title||'Untitled',url:it.url||o.home_page_url||url,date:it.date_published||it.published||'',summary:it.summary||it.content_text||''})); return {title:o.title||url,items}; } }catch{}
  const doc=new DOMParser().parseFromString(text,'text/xml');
  const rss=doc.querySelector('rss, channel'); const atom=doc.querySelector('feed');
  const strip=s=>(s||'').replace(/<[^>]*>/g,'').trim();
  if(rss){ const ch=doc.querySelector('channel'); const title=ch?.querySelector('title')?.textContent||url; const items=[...doc.getElementsByTagName('item')].map(it=>{const enc=it.getElementsByTagName('content:encoded')[0]||it.getElementsByTagNameNS?.('*','encoded')?.[0]; const sum=enc?.textContent||it.getElementsByTagName('description')[0]?.textContent||''; return {id:it.getElementsByTagName('guid')[0]?.textContent||it.getElementsByTagName('link')[0]?.textContent,title:strip(it.getElementsByTagName('title')[0]?.textContent),url:it.getElementsByTagName('link')[0]?.textContent,date:it.getElementsByTagName('pubDate')[0]?.textContent,summary:strip(sum)};}); return {title,items}; }
  if(atom){ const items=[...doc.querySelectorAll('entry')].map(it=>({id:it.querySelector('id')?.textContent||it.querySelector('title')?.textContent,title:strip(it.querySelector('title')?.textContent),url:(it.querySelector('link[rel="alternate"]')||it.querySelector('link'))?.getAttribute('href'),date:it.querySelector('updated')?.textContent||it.querySelector('published')?.textContent,summary:strip(it.querySelector('summary')?.textContent||it.querySelector('content')?.textContent)})); return {title:doc.querySelector('feed>title')?.textContent||url,items}; }
  return {title:url,items:[]};
}
async function refreshFeeds(){
  $("#feedErr").textContent='';
  const updated=Object.assign({}, state.items);
  for(const f of state.feeds){
    if(!f.enabled) continue;
    try{
      const txt=await fetchText(f.url); const p=parseFeed(txt,f.url); f.title=p.title||f.url;
      const prev=updated[f.id]||[]; const map=new Map(prev.map(it=>[it.id,it]));
      updated[f.id]=(p.items||[]).map(it=>({id:it.id,title:it.title,url:it.url,date:it.date,summary:it.summary,read:map.get(it.id)?.read||false,starred:map.get(it.id)?.starred||false,localSummary:map.get(it.id)?.localSummary||''})).slice(0,200);
      // if autoSummarize is enabled, schedule summarization for new items without localSummary
      if(state.settings.autoSummarize){ (updated[f.id]||[]).forEach(async it=>{ if(!it.localSummary){ // schedule with small delay to avoid rate limits
          setTimeout(()=>{ chrome.runtime.sendMessage({type:'summarize_ai', url: it.url}); }, 800);
        }});
      }
    }catch(e){ $("#feedErr").textContent = '⚠︎ Could not fetch: '+(new URL(f.url).host); logLine('error','feed fetch failed '+f.url); }
  }
  state.items=updated;
  // store large feed items in local storage; keep feeds synced
  await chrome.storage.local.set({feedItems:updated});
  await chrome.storage.sync.set({feeds:state.feeds});
  renderFeedSelect(); renderFeeds(); renderToday();
}
function renderFeedSelect(){
  const allUnread = state.feeds.reduce((a,f)=> a + (state.items[f.id]?.filter(x=>!x.read).length||0), 0);
  $("#feedSelect").innerHTML = `<option value="all">All feeds (${allUnread})</option>` + state.feeds.filter(f=>f.enabled).map(f=>`<option value="${f.id}">${(f.title||f.url)} (${state.items[f.id]?.filter(x=>!x.read).length||0})</option>`).join('');
}
function renderFeeds(){
  const selEl = document.getElementById('feedSelect');
  const sel = selEl ? selEl.value : 'all';
  const feedSearchEl = document.getElementById('feedSearch');
  const q = ((feedSearchEl && feedSearchEl.value)||'').toLowerCase();
  const toggleStarEl = document.getElementById('toggleStar');
  const onlyStar = toggleStarEl ? (toggleStarEl.dataset.on==='1') : false;
  // If 'All feeds' is selected and there's no 'today' filter active, don't auto-load items
  if(sel === 'all' && !(selEl && selEl.dataset && selEl.dataset.filter === 'today')){
    $("#feedsList").innerHTML = '<div class="subrow">Select a feed from Today to view its items, or choose a feed from the dropdown.</div>';
    return;
  }
  let pairs = [];
  state.feeds.forEach(f=>{ if(!f.enabled) return; if(sel!=='all' && f.id!==sel) return; (state.items[f.id]||[]).forEach(it=> pairs.push([f,it])); });
  // If feedSelect has a today filter, restrict items to last 24 hours
  const isTodayFilter = selEl && selEl.dataset && selEl.dataset.filter==='today';
  if(isTodayFilter){ const now = Date.now(); const oneDay = 24*60*60*1000; pairs = pairs.filter(([f,it])=>{ const t=new Date(it.date||0).getTime(); return t && (now - t) < oneDay; }); }
  pairs.sort((a,b)=> new Date(b[1].date||0)-new Date(a[1].date||0));
  const filtered=pairs.filter(([f,it])=> (!q|| (it.title||'').toLowerCase().includes(q)) && (!onlyStar || it.starred));
  $("#feedsList").innerHTML = filtered.map(([f,it])=>`<div class="feed collapsed" data-f="${f.id}" data-id="${it.id}">
    <div class="title">${it.title||'Untitled'}</div>
    <div class="subrow">${f.title||f.url}${it.date?(' • '+new Date(it.date).toLocaleString()):''}</div>
    <div class="prev">${(it.localSummary||it.summary||'').slice(0,220)}</div>
    <div class="row wrap"><button class="summ">Summarize</button><button class="rd">${it.read?'Mark unread':'Mark read'}</button><button class="st">${it.starred?'★':'☆'}</button><button class="cp">Copy</button></div>
  </div>`).join('') || '<div class="subrow">No items.</div>';
  $("#feedsList").querySelectorAll('.feed').forEach(card=>{
    const fid=card.getAttribute('data-f'); const iid=card.getAttribute('data-id'); const arr=state.items[fid]||[]; const item=arr.find(x=>x.id===iid);
    card.querySelector('.title').onclick=()=> card.classList.toggle('collapsed');
    card.querySelector('.prev').onclick=()=> item?.url && chrome.tabs.create({url:item.url});
  card.querySelector('.rd').onclick=()=>{ item.read=!item.read; chrome.storage.local.set({feedItems:state.items}); renderFeedSelect(); renderFeeds(); renderToday(); };
  card.querySelector('.st').onclick=()=>{ item.starred=!item.starred; chrome.storage.local.set({feedItems:state.items}); renderFeeds(); renderToday(); };
    card.querySelector('.cp').onclick=()=> item?.url && navigator.clipboard.writeText(item.url);
    card.querySelector('.summ').onclick=()=> {
      const btn = card.querySelector('.summ'); const orig = btn.textContent; btn.textContent='AI Summarizing...'; btn.disabled=true;
      // start a progress poller
      let pollId=null; async function startPoll(){ pollId = setInterval(async ()=>{ const p = (await chrome.storage.local.get('summ_progress'))?.summ_progress; if(p){ if(p.state==='running'){ btn.textContent = `AI Summarizing ${p.current}/${p.total}`; } else if(p.state==='started'){ btn.textContent='AI Summarizing...'; } else if(p.state==='done'){ btn.textContent='AI Summarize done'; clearInterval(pollId); } } },400); }
      startPoll();
      // try background AI summarize first
      chrome.runtime.sendMessage({type:'summarize_ai', url: item.url}, async (resp) => {
        try{
          if(resp && resp.ok && resp.summary){ item.localSummary = resp.summary; await chrome.storage.local.set({feedItems:state.items}); }
          else { await summarize(item); }
        }catch(e){ await summarize(item); }
        // mark progress done
        await chrome.storage.local.set({summ_progress:{state:'done', total:0, done:0}});
        if(pollId) clearInterval(pollId);
        btn.textContent=orig; btn.disabled=false; renderFeeds(); renderToday();
      });
    };
  });
}
function renderToday(){
  const now=Date.now(), oneDay=24*60*60*1000;
  // build counts per feed for items in last 24h
  const feedCounts = state.feeds.reduce((acc,f)=>{ if(!f.enabled) return acc; const list = (state.items[f.id]||[]).filter(it=>{ const t=new Date(it.date||0).getTime(); return t && (now - t) < oneDay; }); if(list.length) acc.push({feed:f,items:list}); return acc; }, []);
  // render: Title (+N)
  if(feedCounts.length===0){ $("#todayList").innerHTML = '<div class="subrow">No items from the last 24 hours.</div>'; $("#todayCount").textContent = ''; return; }
  // render inline boxes
  $("#todayList").innerHTML = `<div class="today-container">` + feedCounts.map(fc=>{
    const title = fc.feed.title || fc.feed.url; const n = fc.items.length;
    return `<div class="today-feed" data-fid="${fc.feed.id}"><div class="title link">${escapeHtml(title)} (${n})</div></div>`;
  }).join('') + `</div>`;
  $("#todayCount").textContent = feedCounts.reduce((a,b)=>a+b.items.length,0) + ' items in the last 24 hours';
  // attach click handlers: clicking a feed title filters the Feeds panel to that feed
  document.querySelectorAll('#todayList .today-feed').forEach(el=>{
    const fid = el.getAttribute('data-fid'); const titleEl = el.querySelector('.title');
    titleEl.onclick = ()=>{
      const sel = document.getElementById('feedSelect');
      if(!sel) return;
      // ensure the option exists (in case feeds were reloaded); if not, rebuild the select first
      const opt = sel.querySelector(`option[value="${fid}"]`);
      if(!opt){ renderFeedSelect(); }
      sel.value = fid;
      // set a marker so renderFeeds shows only today's items for this feed
      sel.dataset.filter = 'today';
      renderFeeds();
      const feedsList = document.getElementById('feedsList'); if(feedsList) feedsList.scrollIntoView({behavior:'smooth'});
    };
  });
}

// small helper to escape HTML used in titles/previews
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
async function summarize(item){
  if(!item || item.localSummary) return;
  try{
    const r=await fetch(item.url); const html=await r.text();
    const text=html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ');
    const sents=text.replace(/\s+/g,' ').split(/(?<=[.!?])\s+/).filter(Boolean);
    const summary=sents.slice(0,3).join(' ');
  item.localSummary=summary; await chrome.storage.local.set({feedItems:state.items});
  }catch(e){ logLine('error','summarize failed'); }
}

/* Calendar (ICS) */
async function refreshCalendar(){
  const {icsUrls=[]}=await chrome.storage.sync.get('icsUrls');
  const events=[];
  for(const s of icsUrls){
    try{
      const fetchUrl = (s.url||s).replace(/^webcal:/i,'https:');
      const txt = await fetch(fetchUrl).then(r=>r.text());
      parseICS(txt).forEach(e=>events.push({...e,_src:s}));
    }catch(e){ /* silently ignore individual source failures */ }
  }

  // Render sources (labels or hostnames) at the top
  const sourcesHtml = (icsUrls && icsUrls.length) ? (`<div class="subrow">Sources: ${icsUrls.map(s=>{
    let label = '';
    try{ label = s.label || new URL(s.url||s).host; }catch(err){ label = s.label || (s.url||s) || 'source'; }
    const href = (s.url||s) || '#';
    return `<a class="chip" href="${href}" target="_blank">${label}</a>`;
  }).join(' ')}</div>`) : '';

  // Read max events from settings (default 10)
  const s = (await chrome.storage.sync.get('settings'))?.settings || {};
  const maxEvents = (s.maxCalendarEvents==null) ? 10 : s.maxCalendarEvents;

  const futureAll = events.filter(e=> e.startDate && e.startDate>=new Date(Date.now()-6*60*60*1000)).sort((a,b)=> a.startDate-b.startDate);
  const future = futureAll.slice(0, maxEvents);

  const eventsHtml = future.map(e=>{
    // date then time
    const dateStr = new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'2-digit',weekday:'short', timeZone: (e._src && e._src.timezone) || undefined}).format(e.startDate);
    const timeStr = new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',hour12:false, timeZone: (e._src && e._src.timezone) || undefined}).format(e.startDate);
    const title = e.summary || 'Untitled';
    const srcChip = (e._src?.label||e._src?.url)?` <span class="chip">${e._src.label||(()=>{try{return new URL(e._src.url).host}catch{return e._src.url||''}})()}</span>`:'';
    const loc = e.location?(' • '+e.location):'';
    const open = e.url?` <a href="${e.url}" target="_blank">Open</a>`:'';
    return `<div class="cal-entry"><div class="when">${dateStr} · ${timeStr}${loc}</div><div class="title">${title}${srcChip}${open}</div></div>`;
  }).join('');

  $("#calList").innerHTML = (sourcesHtml + (eventsHtml || '<div class="subrow">No upcoming events.</div>'));
}
function parseICS(text){
  const lines=text.split(/\r?\n/); const evs=[]; let cur=null;
  for(const ln of lines){
    if(ln.startsWith('BEGIN:VEVENT')) cur={};
    else if(ln.startsWith('END:VEVENT')){ if(cur) evs.push(cur); cur=null; }
    else if(cur){
      if(ln.startsWith('SUMMARY:')) cur.summary=ln.slice(8).trim();
      else if(ln.startsWith('LOCATION:')) cur.location=ln.slice(9).trim();
      else if(ln.startsWith('URL:')) cur.url=ln.slice(4).trim();
      else if(ln.startsWith('DTSTART')){
        const m=ln.match(/:(\d{8}T\d{6}Z?)/);
        if(m) cur.startDate=icsToDate(m[1]);
        else { const m2=ln.match(/:(\d{8})/); if(m2) cur.startDate=icsToDate(m2[1]); }
      }
      else if(ln.startsWith('DTEND')){
        const m=ln.match(/:(\d{8}T\d{6}Z?)/);
        if(m) cur.endDate=icsToDate(m[1]);
        else { const m2=ln.match(/:(\d{8})/); if(m2) cur.endDate=icsToDate(m2[1]); }
      }
    }
  }
  return evs;
}
function icsToDate(s){
  // s is either YYYYMMDD or YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
  if(/\d{8}T\d{6}Z?/.test(s)){
    const y=s.slice(0,4),m=s.slice(4,6),d=s.slice(6,8),hh=s.slice(9,11),mi=s.slice(11,13),ss=s.slice(13,15);
    // Build an ISO 8601 string for reliable parsing. If the original had a trailing Z, keep it (UTC).
    const iso = `${y}-${m}-${d}T${hh}:${mi}:${ss}` + (s.endsWith('Z') ? 'Z' : '');
    return new Date(iso);
  }
  if(/\d{8}/.test(s)){
    const y=s.slice(0,4),m=s.slice(4,6),d=s.slice(6,8);
    return new Date(`${y}-${m}-${d}T00:00:00`);
  }
  return null;
}