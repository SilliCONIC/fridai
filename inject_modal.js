(function(){
  if(window.__fridai_modal_installed) return; window.__fridai_modal_installed=true;
  const css = `
  #fridai-modal {position:fixed;right:18px;bottom:18px;background:rgba(0,0,0,0.88);color:#fff;padding:12px;border-radius:10px;z-index:2147483647;min-width:260px;box-shadow:0 8px 30px rgba(0,0,0,0.6);} 
  #fridai-modal .row{display:flex;gap:8px;margin-top:8px}
  #fridai-modal button{background:#2b72ff;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer}
  #fridai-modal .secondary{background:#444}
  `;
  const s = document.createElement('style'); s.textContent=css; document.documentElement.appendChild(s);
  const modal = document.createElement('div'); modal.id='fridai-modal';
  const args = (new URLSearchParams(location.hash.replace('#',''))).toString();
  // Create header without logo
  const hdr = document.createElement('div'); hdr.className = 'hdr';
  const strong = document.createElement('strong'); strong.textContent = 'Add to FridAI';
  hdr.appendChild(strong);
  const sub = document.createElement('div'); sub.className='sub'; sub.textContent = location.href;
  const row = document.createElement('div'); row.className='row';
  const btnAddTool = document.createElement('button'); btnAddTool.id='fridai-add-tool'; btnAddTool.textContent='Add as Tool';
  const btnAddFeed = document.createElement('button'); btnAddFeed.id='fridai-add-feed'; btnAddFeed.className='secondary'; btnAddFeed.textContent='Detect & Add Feed';
  const btnClose = document.createElement('button'); btnClose.id='fridai-close'; btnClose.className='secondary'; btnClose.textContent='Close';
  row.appendChild(btnAddTool); row.appendChild(btnAddFeed); row.appendChild(btnClose);
  modal.appendChild(hdr); modal.appendChild(sub); modal.appendChild(row);
  document.documentElement.appendChild(modal);
  document.getElementById('fridai-close').onclick = ()=>{ modal.remove(); s.remove(); window.__fridai_modal_installed=false; };
  document.getElementById('fridai-add-tool').onclick = ()=>{
    chrome.runtime.sendMessage({type:'fridai_add_tool',url:location.href,title:document.title});
    // show undo toast
    try{
      const t = document.createElement('div'); t.id='fridai-inpage-toast'; t.style.position='fixed'; t.style.right='18px'; t.style.bottom='18px'; t.style.background='rgba(0,0,0,0.9)'; t.style.color='#fff'; t.style.padding='8px 12px'; t.style.borderRadius='8px'; t.style.zIndex=2147483647; t.innerHTML = 'Added <button id="fridai-undo-inpage" style="margin-left:8px;padding:4px 8px;background:#444;color:#fff;border-radius:6px;border:none;">Undo</button>';
      document.documentElement.appendChild(t);
      document.getElementById('fridai-undo-inpage').onclick = async ()=>{ chrome.runtime.sendMessage({type:'undo_last'}); t.remove(); };
      setTimeout(()=>{ t.remove(); },6000);
    }catch(e){}
    modal.remove(); s.remove(); window.__fridai_modal_installed=false;
  };
  document.getElementById('fridai-add-feed').onclick = ()=>{
    chrome.runtime.sendMessage({type:'fridai_add_feed',url:location.href});
    try{
      const t = document.createElement('div'); t.id='fridai-inpage-toast'; t.style.position='fixed'; t.style.right='18px'; t.style.bottom='18px'; t.style.background='rgba(0,0,0,0.9)'; t.style.color='#fff'; t.style.padding='8px 12px'; t.style.borderRadius='8px'; t.style.zIndex=2147483647; t.innerHTML = 'Added <button id="fridai-undo-inpage" style="margin-left:8px;padding:4px 8px;background:#444;color:#fff;border-radius:6px;border:none;">Undo</button>';
      document.documentElement.appendChild(t);
      document.getElementById('fridai-undo-inpage').onclick = async ()=>{ chrome.runtime.sendMessage({type:'undo_last'}); t.remove(); };
      setTimeout(()=>{ t.remove(); },6000);
    }catch(e){}
    modal.remove(); s.remove(); window.__fridai_modal_installed=false;
  };
})();
