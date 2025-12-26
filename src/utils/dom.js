export const $ = (s) => document.querySelector(s);

export function logLine(type, msg) {
    const el = $("#log");
    if (!el) return;
    const d = document.createElement('div');
    d.className = type === 'error' ? 'err' : '';
    d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    el.prepend(d);
}

export function showToast(msg, timeout = 2200) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), timeout);
}

export function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[c]);
}
