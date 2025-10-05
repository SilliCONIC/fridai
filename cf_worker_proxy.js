// Example Cloudflare Worker to proxy requests to a custom AI provider and inject the API key server-side.
// Deploy this on Cloudflare Workers and set the SECRET_API_KEY as an environment variable (wrangler secret put SECRET_API_KEY).

addEventListener('fetch', event => {
  event.respondWith(handle(event.request));
});

async function handle(req){
  // Only allow POST
  if(req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const url = new URL(req.url);
  // Expect the target path in a query param, e.g. /proxy?path=/v1/completions
  const path = url.searchParams.get('path') || '/v1/completions';
  const providerBase = 'https://chat-ai.academiccloud.de'; // or set via env
  const target = providerBase.replace(/\/$/,'') + (path.startsWith('/')?path:('/'+path));

  // Forward the body and set Authorization header server-side
  const body = await req.text();
  const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SECRET_API_KEY };

  const resp = await fetch(target, { method: 'POST', headers, body });
  const text = await resp.text();
  return new Response(text, { status: resp.status, headers: { 'Content-Type': 'application/json' } });
}
