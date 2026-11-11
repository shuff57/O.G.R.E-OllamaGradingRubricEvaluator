// Sends one request to Canvas's REST API from a page on the Canvas site. The
// browser attaches the teacher's session cookies itself; no API token is used.
// Called as a function with
//   { method, path, query: [[name, value]], form: null | [[name, value]],
//     all_pages, max_pages }
// and returns a promise of
//   { status, json, data, text, problem, detail }.
// `problem` is null whenever Canvas answered, whatever the status; otherwise it
// names what stopped the request. This script decides nothing about grades:
// canvas.rs builds every request and reads every answer.
//
// What it relies on in Canvas (sources are listed in canvas.rs):
//   Accept: application/json+canvas-string-ids   ids arrive as strings, since
//                                                they can exceed 2^53
//   cookie _csrf_token, URL-encoded              sent back as X-CSRF-Token on
//                                                anything that is not a GET
//   Link: <url>; rel="next"                      the next page of a list; the
//                                                URL is opaque and absolute
async (args) => {
  const reply = (fields) =>
    Object.assign({ status: 0, json: false, data: null, text: null, problem: null, detail: null }, fields);

  const csrfToken = () => {
    for (const part of document.cookie.split(';')) {
      const eq = part.indexOf('=');
      if (eq < 0 || part.slice(0, eq).trim() !== '_csrf_token') continue;
      const raw = part.slice(eq + 1).trim();
      if (!raw) return null;
      try { return decodeURIComponent(raw); } catch (e) { return raw; }
    }
    return null;
  };

  // Header names and rel values are matched without regard to case.
  const nextLink = (header) => {
    for (const m of (header || '').matchAll(/<([^>]*)>\s*((?:;[^,<]*)*)/g)) {
      if (/;\s*rel\s*=\s*"?next"?\s*(;|$)/i.test(m[2])) return m[1];
    }
    return null;
  };

  const headers = { Accept: 'application/json+canvas-string-ids' };
  const init = { method: args.method, headers, credentials: 'same-origin', cache: 'no-store' };
  if (args.method !== 'GET') {
    const token = csrfToken();
    if (!token) return reply({ problem: 'no_csrf_cookie' });
    headers['X-CSRF-Token'] = token;
    init.body = new URLSearchParams(args.form || []);
  }

  let url;
  try {
    url = new URL(args.path, location.origin);
  } catch (e) {
    return reply({ problem: 'not_a_web_page', detail: location.href });
  }
  for (const [name, value] of args.query || []) url.searchParams.append(name, value);

  const items = [];
  let pages = 0;
  for (;;) {
    let response;
    let body;
    try {
      response = await fetch(url, init);
      body = await response.text();
    } catch (e) {
      return reply({ problem: 'network', detail: String((e && e.message) || e) });
    }

    let data;
    try {
      // Older Canvas versions put this guard in front of JSON sent to a browser session.
      data = JSON.parse(body.replace(/^while\(1\);/, ''));
    } catch (e) {
      return reply({ status: response.status, text: body.slice(0, 300) });
    }
    if (!response.ok || !args.all_pages) return reply({ status: response.status, json: true, data });

    if (!Array.isArray(data)) return reply({ status: response.status, problem: 'not_a_list' });
    for (const item of data) items.push(item);
    pages += 1;

    const next = nextLink(response.headers.get('Link'));
    if (!next) return reply({ status: response.status, json: true, data: items });
    if (pages >= args.max_pages) return reply({ status: response.status, problem: 'too_many_pages' });
    let nextUrl;
    try {
      nextUrl = new URL(next, location.origin);
    } catch (e) {
      return reply({ status: response.status, problem: 'bad_page_link', detail: next });
    }
    // Session cookies must never follow a link to somewhere else.
    if (nextUrl.origin !== location.origin) {
      return reply({ status: response.status, problem: 'bad_page_link', detail: nextUrl.origin });
    }
    url = nextUrl;
  }
}
