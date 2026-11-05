/**
 * Standalone HTML documents the main process shows in the window while the gateway is not serving
 * yet (splash) or has failed (error). Inlined so there is no separate renderer bundle to build:
 * the real UI is the dashboard the gateway serves. Loaded via a data: URL.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const shell = (title: string, body: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
  `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">` +
  `<title>${escapeHtml(title)}</title><style>` +
  `:root{color-scheme:dark}body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;` +
  `font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0f14;color:#e6edf3}` +
  `.card{max-width:640px;padding:32px;text-align:center}.spinner{width:36px;height:36px;margin:0 auto 16px;` +
  `border:3px solid #2b333d;border-top-color:#25d366;border-radius:50%;animation:spin 1s linear infinite}` +
  `@keyframes spin{to{transform:rotate(360deg)}}pre{white-space:pre-wrap;text-align:left;background:#11161c;` +
  `padding:12px;border-radius:8px;max-height:240px;overflow:auto;font-size:12px}.err{color:#ff7b72}` +
  `button{margin-top:12px;background:#25d366;color:#04110a;border:0;border-radius:6px;padding:8px 16px;` +
  `cursor:pointer;font-weight:600}</style></head><body><div class="card">${body}</div></body></html>`;

export function splashDocument(message = 'Starting OpenWA gateway…'): string {
  return shell('OpenWA', `<div class="spinner"></div><div>${escapeHtml(message)}</div>`);
}

export function errorDocument(reason: string, logTail: string): string {
  const body =
    `<h2 class="err">Gateway failed to start</h2>` +
    `<p>${escapeHtml(reason)}</p>` +
    `<pre>${escapeHtml(logTail || '(no output)')}</pre>` +
    `<button onclick="location.reload()">Retry</button>`;
  return shell('OpenWA — error', body);
}

/** Encode a document for a data: URL navigation. */
export function asDataUrl(html: string): string {
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}
