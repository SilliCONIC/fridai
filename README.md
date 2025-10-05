FridAI — A small productivity new-tab extension

FridAI turns your new tab into a compact dashboard for quick access to tools, feeds, calendar events and simple AI-powered summaries. It is designed to be light and private by default, with an option to use a proxy for API calls and feed detection when sites block direct requests.

Highlights
- Quick access to pinned AI tools and search providers 🔎
- Today view showing recent items from saved feeds (click a feed to see today's items) 📅
- Feed reader with local item storage (avoids sync quota issues) 🗂️
- Optional AI summarization for pages and feed items (uses a provider you configure) 🤖
- Detect & Add feed from pages or links, with a CORS proxy fallback when needed 🌐

Install / Development
1. Load unpacked extension in Chrome / Edge (Manifest V3):
   - Open chrome://extensions → Developer mode → Load unpacked → choose this project folder.
2. The main files:
   - `newtab.html` — the UI shown on the new tab.
   - `app.js` — front-end logic for the dashboard.
   - `bg.js` — background service worker (context menus, toolbar actions, AI summarization handler).
   - `options.html` + `opt.js` — settings page for feeds, AI provider and keys.
   - `styles.css` — styles.

Quick usage
- Click the extension toolbar icon to open the in-page modal for adding the current page as a tool or detecting feeds.
- Right-click a page or link → Add to FridAI → Detect & Add Feeds to quickly add feeds.
- In Today, click the feed box (Title (N)) to view only today's items from that feed in the Feeds panel.
- Use the Feeds refresh button to refresh only the selected feed (or refresh all if 'All feeds' is selected).

AI Summaries
- Configure your provider in Options. You can use OpenAI (or compatible services) or set a custom provider base + path + auth header.
- For privacy, store API keys locally (the extension supports storing the key in `chrome.storage.local`).
- When a page or feed item is summarized, the result is stored locally with the item (`localSummary`) so you avoid repeated requests.

Proxy and CORS
- Some sites block direct fetches from the new-tab or background context. The extension uses an AllOrigins fallback to read page HTML when needed. You can deploy your own proxy (Cloudflare Worker example is included) and then update the Options to use it if you want to keep keys on a server.

Storage notes
- Small settings and the feeds list are stored in `chrome.storage.sync` so they sync across devices.
- Full feed item lists and API keys (when stored) are kept in `chrome.storage.local` to avoid sync quota limits and to keep secrets local to the device.

Troubleshooting
- If "Detect & Add Feeds" does not find anything:
  - Try opening the page in the browser and using the toolbar modal (it will try a proxy fallback).
  - If you run a self-hosted proxy, add its URL in Options and re-test.
- If AI tests return CORS or authorization errors:
  - Check your custom auth header format in Options. Use `Name: value` or just `Name` (the extension will add `Bearer <key>` for Authorization headers).

Contributing
- This is a small vanilla JS project. If you want to help:
  - Fork and submit a PR with focused changes.
  - Keep changes small and avoid adding heavy dependencies.
  - Add tests or a small demo page if you change parsing or chunking logic.

License
- Use as you like. No warranty.

Thanks for trying FridAI — enjoy a faster new tab! ✨
