// poloniapp — cliente de la API propia (docs/api/, PHP + MySQL en el mismo hosting).
// Lo usan el sitio público (app.js) y el panel admin (admin.js).

const API_URL = new URL('../../api/', import.meta.url).href;

export async function api(action, { method = 'GET', params = {}, body } = {}) {
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  // X-Poloniapp: la API rechaza todo POST sin este header (protección CSRF).
  const opts = { method, credentials: 'same-origin', headers: { 'X-Poloniapp': '1' } };
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);
  let data = null;
  try {
    data = await res.json();
  } catch {
    // respuesta sin JSON (ej. el servidor devolvió una página de error)
  }
  if (!res.ok) throw new Error(data?.error || `Error ${res.status} del servidor`);
  return data;
}
