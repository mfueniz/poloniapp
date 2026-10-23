// poloniapp — app.js
// Fetch client-side a Supabase (anon key, RLS pública) + render de toda la SPA.
// Fase 2b: navegación real Home → Actividades (grilla de categorías) → categoría → detalle.
// Fase 2c: bubble chat → WhatsApp (número editable en site_content.contact.whatsapp).

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Raíz real del sitio (docs/), calculada desde la ubicación de este script — así las rutas
// relativas de assets (fotos, símbolo) resuelven igual sin importar desde qué profundidad
// se cargó la página (raíz, /preview/, etc).
const ASSETS_BASE = new URL('../../', import.meta.url).href;
function assetUrl(relPath) {
  return relPath ? ASSETS_BASE + relPath : '';
}

const BUCKET_LABELS = {
  formacion: 'espiritual',
  laboral: 'trabajo',
  familia: 'familia',
};

const WEEKDAY_ORDER = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtWhen(session) {
  if (!session) return '';
  if (session.date) {
    const d = new Date(session.date + 'T00:00:00');
    const label = d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
    return `${label}${session.time_start ? ' · ' + session.time_start.slice(0, 5) : ''}`;
  }
  if (session.weekday) {
    return `${session.weekday}${session.time_start ? ' · ' + session.time_start.slice(0, 5) : ''}`;
  }
  return '';
}

function nextSession(activity) {
  const sessions = activity.sessions || [];
  if (sessions.length === 0) return null;
  const dated = sessions.filter((s) => s.date).sort((a, b) => a.date.localeCompare(b.date));
  if (dated.length) return dated[0];
  const recurring = [...sessions].sort(
    (a, b) => WEEKDAY_ORDER.indexOf(a.weekday) - WEEKDAY_ORDER.indexOf(b.weekday)
  );
  return recurring[0];
}

// ---------------------------------------------------------------------------
// Estado global (fetch una sola vez, se reusa entre vistas)
// ---------------------------------------------------------------------------
const state = { content: {}, categories: [], categoriesById: {}, activities: [], posts: [], dailyText: null };

async function loadData() {
  const [
    { data: content, error: e1 },
    { data: categories, error: e2 },
    { data: activities, error: e3 },
    { data: posts, error: e4 },
    { data: dailyTexts, error: e5 },
  ] = await Promise.all([
    sb.from('site_content').select('key,value'),
    sb.from('categories').select('*').eq('visible', true).order('sort_order'),
    sb.from('activities').select('*, sessions(*)').eq('visible', true),
    sb.from('posts').select('*').eq('visible', true).order('published_at', { ascending: false }).limit(3),
    sb.from('daily_texts').select('*').order('date', { ascending: false }).limit(1),
  ]);
  const err = e1 || e2 || e3 || e4 || e5;
  if (err) throw err;

  state.content = Object.fromEntries((content || []).map((c) => [c.key, c.value]));
  state.categories = categories || [];
  state.categoriesById = Object.fromEntries(state.categories.map((c) => [c.id, c]));
  state.activities = activities || [];
  state.posts = posts || [];
  state.dailyText = (dailyTexts && dailyTexts[0]) || null;
}

// ---------------------------------------------------------------------------
// Componentes de tarjeta reutilizables
// ---------------------------------------------------------------------------
function activityCard(a) {
  const category = state.categoriesById[a.category_id];
  const when = fmtWhen(nextSession(a));
  const bucketLabel = category ? category.bucket : '';
  const href = `#/actividad/${a.id}`;
  if (a.photo_url) {
    return `
      <a class="activity-card" style="background-image:url('${assetUrl(a.photo_url)}')" href="${href}">
        <div class="scrim"></div>
        <span class="tag">${esc(bucketLabel)}</span>
        <div class="info">
          <p class="title">${esc(a.title)}</p>
          <p class="when">${esc(when)}</p>
        </div>
      </a>`;
  }
  return `
    <a class="activity-card placeholder" href="${href}">
      <span class="tag">${esc(bucketLabel)}</span>
      <img src="${assetUrl('assets/poloniapp-symbol.svg')}" alt="">
      <div class="info">
        <p class="title">${esc(a.title)}</p>
        <p class="when">${esc(when)}</p>
      </div>
    </a>`;
}

function postCard(p) {
  return `
    <a class="post-card" href="${esc(p.external_url)}" target="_blank" rel="noopener">
      <div class="thumb" style="${p.image_url ? `background-image:url('${assetUrl(p.image_url)}')` : ''}"></div>
      <p class="title">${esc(p.title)}</p>
    </a>`;
}

// ---------------------------------------------------------------------------
// Header + tab bar (persistentes, se re-renderizan por vista para marcar activo)
// ---------------------------------------------------------------------------
function renderChrome(activeTab) {
  document.getElementById('site-header').innerHTML = `
    <a href="#/" style="display:flex;align-items:center;gap:10px;text-decoration:none;">
      <img src="${assetUrl('assets/poloniapp-symbol.svg')}" alt="Poloniapp">
      <span class="wordmark">Poloniapp</span>
    </a>`;
  const tabs = [
    { href: '#/', label: 'Inicio', key: 'home' },
    { href: '#/actividades', label: 'Actividades', key: 'actividades' },
    { href: '#/quienes-somos', label: 'Quiénes somos', key: 'quienes-somos' },
  ];
  document.getElementById('tabbar').innerHTML = tabs
    .map((t) => `<a href="${t.href}" class="${t.key === activeTab ? 'active' : ''}">${t.label}</a>`)
    .join('');
}

// ---------------------------------------------------------------------------
// Vista: Home
// ---------------------------------------------------------------------------
function renderHome() {
  renderChrome('home');
  const view = document.getElementById('view');
  view.innerHTML = `
    <section class="hero">
      <h1>${esc(state.content['hero.title'])}</h1>
      <p>${esc(state.content['hero.subtitle'])}</p>
    </section>
    <nav class="chips" id="chips"></nav>
    <nav class="subchips" id="subchips"></nav>
    <section class="section"><h2 class="section-title">Actividades</h2></section>
    <div class="activities-grid" id="activities-grid"></div>
    <a class="see-all" href="#/actividades">ver todas →</a>
    ${
      state.dailyText
        ? `<section class="section"><h2 class="section-title">Texto diario</h2></section>
    <a class="daily-text-card" href="${esc(state.dailyText.external_url)}" target="_blank" rel="noopener">
      <p class="title">${esc(state.dailyText.title)}</p>
      <p class="excerpt">${esc(state.dailyText.excerpt)}</p>
      <span class="see-all" style="padding:0;">leer completo →</span>
    </a>`
        : ''
    }
    <section class="section"><h2 class="section-title">Publicaciones de O.</h2></section>
    <div class="posts-list">${state.posts.map(postCard).join('')}</div>
    <div class="about-teaser">
      <h2>Quiénes somos</h2>
      <p>${esc(state.content['quienes_somos.teaser'])}</p>
      <a href="#/quienes-somos">conocer el centro →</a>
    </div>`;

  const bucketOrder = ['formacion', 'laboral', 'familia'];
  const bucketsPresent = bucketOrder.filter((b) => state.categories.some((c) => c.bucket === b));
  const chipsEl = document.getElementById('chips');
  chipsEl.innerHTML =
    `<button class="chip active" data-bucket="todas">todas</button>` +
    bucketsPresent.map((b) => `<button class="chip" data-bucket="${b}">${BUCKET_LABELS[b]}</button>`).join('');

  const subchipsEl = document.getElementById('subchips');

  function renderSubchips(bucket) {
    if (bucket === 'todas') {
      subchipsEl.innerHTML = '';
      return;
    }
    const cats = state.categories.filter((c) => c.bucket === bucket);
    subchipsEl.innerHTML = cats.map((c) => `<button class="chip" data-category="${c.id}">${esc(c.name)}</button>`).join('');
  }

  function renderActivities(filterCategoryId, filterBucket) {
    let list = state.activities;
    if (filterCategoryId) {
      list = list.filter((a) => a.category_id === filterCategoryId);
    } else if (filterBucket && filterBucket !== 'todas') {
      list = list.filter((a) => state.categoriesById[a.category_id]?.bucket === filterBucket);
    }
    list = [...list].sort((x, y) => (x.photo_url ? 0 : 1) - (y.photo_url ? 0 : 1));
    document.getElementById('activities-grid').innerHTML = list.slice(0, 4).map(activityCard).join('');
  }

  const defaultBucket = bucketsPresent.includes('formacion') ? 'formacion' : 'todas';
  chipsEl.querySelector(`[data-bucket="${defaultBucket}"]`)?.classList.add('active');
  renderSubchips(defaultBucket);
  renderActivities(null, defaultBucket);

  chipsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    chipsEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    renderSubchips(btn.dataset.bucket);
    renderActivities(null, btn.dataset.bucket);
  });

  subchipsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    subchipsEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    renderActivities(btn.dataset.category, null);
  });
}

// ---------------------------------------------------------------------------
// Vista: grilla de categorías (Actividades)
// ---------------------------------------------------------------------------
function renderCategorias() {
  renderChrome('actividades');
  const view = document.getElementById('view');
  view.innerHTML = `
    <section class="hero" style="padding-bottom:8px;">
      <h1 style="font-size:1.3rem;">Actividades</h1>
    </section>
    <div class="categories-grid">
      ${state.categories
        .filter((c) => c.slug !== 'publicaciones')
        .map((c) => {
          const count = state.activities.filter((a) => a.category_id === c.id).length;
          const countLabel =
            c.slug === 'confesiones' && state.content['confesiones.booking_url']
              ? 'reservar hora'
              : count > 0
              ? `${count} actividad${count > 1 ? 'es' : ''}`
              : 'próximamente';
          return `
            <a class="category-card" href="#/actividades/${c.slug}">
              <p class="cat-name">${esc(c.name)}</p>
              <p class="cat-count">${countLabel}</p>
            </a>`;
        })
        .join('')}
    </div>`;
}

// ---------------------------------------------------------------------------
// Vista: lista de actividades de una categoría
// ---------------------------------------------------------------------------
function renderCategoria(slug) {
  renderChrome('actividades');
  const category = state.categories.find((c) => c.slug === slug);
  const view = document.getElementById('view');
  if (!category) {
    view.innerHTML = `<p class="loading-note">Categoría no encontrada. <a href="#/actividades">Volver</a></p>`;
    return;
  }
  const list = state.activities
    .filter((a) => a.category_id === category.id)
    .sort((a, b) => {
      const sa = nextSession(a);
      const sb_ = nextSession(b);
      const da = sa?.date || (sa?.weekday ? '9999-' + WEEKDAY_ORDER.indexOf(sa.weekday) : '');
      const db = sb_?.date || (sb_?.weekday ? '9999-' + WEEKDAY_ORDER.indexOf(sb_.weekday) : '');
      return String(da).localeCompare(String(db));
    });

  const bookingUrl = category.slug === 'confesiones' ? state.content['confesiones.booking_url'] : null;

  view.innerHTML = `
    <section class="hero" style="padding-bottom:8px;">
      <a href="#/actividades" style="font-size:0.8rem;color:var(--color-primary);text-decoration:none;">← volver</a>
      <h1 style="font-size:1.3rem;margin-top:8px;">${esc(category.name)}</h1>
      ${category.description ? `<p>${esc(category.description)}</p>` : ''}
    </section>
    ${
      bookingUrl
        ? `<a class="booking-card" href="${esc(bookingUrl)}" target="_blank" rel="noopener">
             <p class="title">Reservar hora de confesión</p>
             <p class="sub">Elegís día y horario disponible, en pocos minutos.</p>
             <span class="cta">Reservar →</span>
           </a>`
        : list.length === 0
        ? `<p class="loading-note">Todavía no hay actividades cargadas en esta categoría — próximamente.</p>`
        : `<div class="activities-list">${list.map(activityListRow).join('')}</div>`
    }`;
}

function activityListRow(a) {
  const when = fmtWhen(nextSession(a));
  return `
    <a class="activity-row" href="#/actividad/${a.id}">
      <div class="thumb ${a.photo_url ? '' : 'placeholder'}" style="${a.photo_url ? `background-image:url('${assetUrl(a.photo_url)}')` : ''}">
        ${a.photo_url ? '' : `<img src="${assetUrl('assets/poloniapp-symbol.svg')}" alt="">`}
      </div>
      <div>
        <p class="title">${esc(a.title)}</p>
        <p class="when">${esc(when)}</p>
      </div>
    </a>`;
}

// ---------------------------------------------------------------------------
// Vista: detalle de actividad
// ---------------------------------------------------------------------------
async function renderActividad(id) {
  renderChrome('actividades');
  const view = document.getElementById('view');
  const activity = state.activities.find((a) => a.id === id);
  if (!activity) {
    view.innerHTML = `<p class="loading-note">Actividad no encontrada. <a href="#/actividades">Volver</a></p>`;
    return;
  }
  const category = state.categoriesById[activity.category_id];
  view.innerHTML = `<p class="loading-note">Cargando…</p>`;

  const locationIds = [...new Set((activity.sessions || []).map((s) => s.location_id).filter(Boolean))];
  let locationsById = {};
  if (locationIds.length) {
    const { data: locs } = await sb.from('locations_public').select('id,name').in('id', locationIds);
    locationsById = Object.fromEntries((locs || []).map((l) => [l.id, l.name]));
  }

  const sessions = [...(activity.sessions || [])].sort((a, b) => {
    const da = a.date || '9999-' + WEEKDAY_ORDER.indexOf(a.weekday);
    const db = b.date || '9999-' + WEEKDAY_ORDER.indexOf(b.weekday);
    return String(da).localeCompare(String(db));
  });

  view.innerHTML = `
    <section class="hero" style="padding-bottom:8px;">
      <a href="#/actividades/${category?.slug || ''}" style="font-size:0.8rem;color:var(--color-primary);text-decoration:none;">← ${esc(category?.name || 'volver')}</a>
    </section>
    ${
      activity.photo_url
        ? `<div class="detail-photo" style="background-image:url('${assetUrl(activity.photo_url)}')"></div>`
        : `<div class="detail-photo placeholder"><img src="${assetUrl('assets/poloniapp-symbol.svg')}" alt=""></div>`
    }
    <section class="section">
      <h1 class="section-title" style="font-size:1.3rem;">${esc(activity.title)}</h1>
      ${activity.description ? `<p style="font-size:0.9rem;color:#4d4d48;line-height:1.4;">${esc(activity.description)}</p>` : ''}
    </section>
    <div class="sessions-list">
      ${sessions
        .map(
          (s) => `
        <div class="session-row">
          <p class="when">${esc(fmtWhen(s))}${s.time_end ? ' – ' + esc(s.time_end.slice(0, 5)) : ''}</p>
          ${s.topic ? `<p class="topic">${esc(s.topic)}</p>` : ''}
          ${s.speaker ? `<p class="speaker">${esc(s.speaker)}</p>` : ''}
          <p class="location">${s.location_id && locationsById[s.location_id] ? esc(locationsById[s.location_id]) : ''} — dirección disponible al inscribirte</p>
          ${s.price ? `<p class="price">${esc(s.price)}</p>` : ''}
        </div>`
        )
        .join('')}
    </div>
    <div class="section">
      <button class="cta-inscribir" disabled title="Próximamente">Inscribirme (próximamente)</button>
    </div>`;

  renderChatBubble(activity.contact_phone ? { name: activity.contact_name, phone: activity.contact_phone } : null);
}

// ---------------------------------------------------------------------------
// Vista: Quiénes somos
// ---------------------------------------------------------------------------
function renderQuienesSomos() {
  renderChrome('quienes-somos');
  const view = document.getElementById('view');
  const imagen = state.content['quienes_somos.imagen'];
  const categoriasList = state.categories.filter((c) => c.slug !== 'publicaciones').map((c) => c.name);
  const address = state.content['contact.address'];
  const mapUrl = state.content['contact.map_url'];

  view.innerHTML = `
    <section class="hero">
      <h1 style="font-size:1.3rem;">Quiénes somos</h1>
    </section>
    <section class="section">
      <p class="about-p">${esc(state.content['quienes_somos.parrafo1'])}</p>
    </section>
    ${imagen ? `<div class="about-photo" style="background-image:url('${assetUrl(imagen)}')"></div>` : ''}
    <section class="section">
      <p class="about-p">${esc(state.content['quienes_somos.parrafo2'])}</p>
    </section>
    <section class="section about-block">
      <h2 class="section-title" style="font-size:0.85rem;letter-spacing:0.04em;color:#8a8a84;text-transform:uppercase;">Qué se hace acá</h2>
      <ul class="about-list">${categoriasList.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
    </section>
    ${
      address
        ? `<section class="section about-block">
      <h2 class="section-title" style="font-size:0.85rem;letter-spacing:0.04em;color:#8a8a84;text-transform:uppercase;">Cómo llegar</h2>
      <p class="about-p">${esc(address)}</p>
      ${mapUrl ? `<a href="${esc(mapUrl)}" target="_blank" rel="noopener" class="see-all" style="text-align:left;padding:0;">ver en el mapa →</a>` : ''}
    </section>`
        : ''
    }`;
}

// ---------------------------------------------------------------------------
// Bubble chat → WhatsApp (persistente en todas las vistas)
// ---------------------------------------------------------------------------
function renderChatBubble(override) {
  document.querySelector('.chat-bubble')?.remove();

  // Si la actividad tiene contacto propio (ej. Joaquín en Círculos), se usa ese;
  // si no, cae al número general del centro (site_content.contact.whatsapp).
  const phone = override?.phone || state.content['contact.whatsapp'];
  if (!phone) return; // sin número cargado, no se muestra el bubble

  const digits = phone.replace(/\D/g, '');
  const greeting = override?.name
    ? `Hola ${override.name}, escribo desde Poloniapp 👋`
    : 'Hola, escribo desde Poloniapp 👋';
  const bubble = document.createElement('a');
  bubble.className = 'chat-bubble';
  bubble.href = `https://wa.me/${digits}?text=${encodeURIComponent(greeting)}`;
  bubble.target = '_blank';
  bubble.rel = 'noopener';
  bubble.setAttribute('aria-label', override?.name ? `Escribir a ${override.name} por WhatsApp` : 'Escribir por WhatsApp');
  bubble.innerHTML = `<svg viewBox="0 0 24 24" fill="#fff"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.72.45 3.39 1.3 4.87L2 22l5.36-1.4a9.9 9.9 0 0 0 4.68 1.19h.01c5.46 0 9.9-4.45 9.9-9.91S17.5 2 12.04 2Zm5.8 14.03c-.24.68-1.4 1.3-1.94 1.38-.5.08-1.12.11-1.8-.11-.42-.13-.95-.31-1.64-.6-2.88-1.24-4.76-4.14-4.9-4.33-.14-.19-1.17-1.55-1.17-2.96 0-1.4.74-2.09 1-2.38.26-.28.57-.35.76-.35.19 0 .38 0 .55.01.18.01.42-.07.65.5.24.58.81 2 .88 2.14.07.14.12.31.02.5-.1.19-.15.31-.29.48-.14.17-.3.37-.43.5-.14.14-.29.29-.13.57.17.28.75 1.24 1.62 2 1.11.99 2.05 1.3 2.33 1.44.28.14.44.12.6-.07.17-.19.71-.83.9-1.11.19-.28.38-.24.63-.14.26.09 1.65.78 1.94.92.28.14.47.21.54.33.07.12.07.7-.17 1.38Z"/></svg>`;
  document.querySelector('.app').appendChild(bubble);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/').filter(Boolean);
  window.scrollTo(0, 0);
  // Default: número general del centro. renderActividad lo sobreescribe si la actividad tiene contacto propio.
  renderChatBubble(null);
  if (parts.length === 0) return renderHome();
  if (parts[0] === 'actividades' && parts.length === 1) return renderCategorias();
  if (parts[0] === 'actividades' && parts.length === 2) return renderCategoria(parts[1]);
  if (parts[0] === 'actividad' && parts[1]) return renderActividad(parts[1]);
  if (parts[0] === 'quienes-somos') return renderQuienesSomos();
  return renderHome();
}

async function init() {
  try {
    await loadData();
    window.addEventListener('hashchange', route);
    route();
  } catch (err) {
    console.error('[poloniapp] error cargando datos:', err);
    document.getElementById('view').innerHTML = `<p class="loading-note">No se pudo cargar el contenido. Intentá recargar la página.</p>`;
  }
}

init();
