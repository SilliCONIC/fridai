export function runSearch(p) {
    const q = (document.getElementById("qs")?.value || '').trim();
    if (!q) return;
    const map = {
        google: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
        chatgpt: `https://chat.openai.com/?q=${encodeURIComponent(q)}`,
        perplexity: `https://www.perplexity.ai/search?q=${encodeURIComponent(q)}`,
        ddg: `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
        pubmed: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(q)}`
    };
    const url = map[p];
    if (url) chrome.tabs.create({ url });
}
