import { $ } from '../utils/dom.js';
import { state } from '../state.js';

export function renderTools() {
    const f = ($("#cardToolFilter")?.value || $("#toolFilter")?.value || '').toLowerCase(), tg = ($("#toolTag")?.value || '').toLowerCase();
    const list = [...state.tools].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.name.localeCompare(b.name))
        .filter(t => (!f || t.name.toLowerCase().includes(f)) && (!tg || (t.tags || []).some(x => x.toLowerCase().includes(tg))));

    $("#tools").innerHTML = list.map(t => `<div class="tool"><div class="name">${t.name}</div><a class="url" href="${t.url}" target="_blank">${t.url}</a><div class="tags">${(t.tags || []).map(x => `<span class="chip">${x}</span>`).join('')}</div></div>`).join('');

    document.querySelectorAll('#tools .tool').forEach((el, i) => {
        const t = list[i];
        const btn = document.createElement('button');
        btn.className = 'iconbtn';
        btn.textContent = t.pinned ? '★' : '☆';
        btn.title = 'Pin/Unpin';
        btn.onclick = async () => {
            t.pinned = !t.pinned;
            const { tools = [] } = await chrome.storage.sync.get('tools');
            const idx = tools.findIndex(x => x.id === t.id);
            if (idx >= 0) tools[idx].pinned = t.pinned; else tools.push(t);
            await chrome.storage.sync.set({ tools });
            renderTools();
        };
        el.insertBefore(btn, el.firstChild);
    });
}
