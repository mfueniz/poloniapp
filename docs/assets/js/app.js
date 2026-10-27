// poloniapp — app.js
// Datos desde la API propia (docs/api/, PHP + MySQL) + render de toda la SPA (router por hash).
// Home: frase + bajada → banner de la app (solo celular) → actividades próximas → Para rezar hoy.

import { api } from './api.js';
import { renderAppBanner } from './pwa.js?v=20261028';

// Raíz real del sitio (docs/), calculada desde la ubicación de este script.
const ASSETS_BASE = new URL('../../', import.meta.url).href;
function assetUrl(relPath) {
  if (!relPath) return '';
  return /^https?:\/\//.test(relPath) ? relPath : ASSETS_BASE + relPath;
}
const MARK = assetUrl('assets/img/favicon.svg');

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']; // índice = Date.getDay()
const HOME_LIMIT = 6;

const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------------------
// Fechas y próximas sesiones
// ---------------------------------------------------------------------------
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
// "Miércoles" / "miercoles" / "MIÉRCOLES" → índice de getDay()
function weekdayIndex(name) {
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  return WEEKDAYS.map(norm).indexOf(norm(name));
}
const hhmm = (t) => (t ? t.slice(0, 5) : '');

/**
 * Próxima ocurrencia de una actividad desde hoy: sesiones con fecha (hoy o después) y
 * sesiones semanales (próximo día que corresponda). Con onlyTodayRecurring, las semanales
 * solo cuentan si son hoy (así la Home muestra los círculos del día y no los de toda la semana).
 */
function nextOccurrence(activity, { onlyTodayRecurring = false } = {}) {
  const today = new Date();
  const todayIso = isoDate(today);
  let best = null;
  for (const s of activity.sessions || []) {
    let date = null;
    if (s.date) {
      if (s.date >= todayIso) date = s.date;
    } else if (s.weekday) {
      const idx = weekdayIndex(s.weekday);
      if (idx < 0) continue;
      const diff = (idx - today.getDay() + 7) % 7;
      if (onlyTodayRecurring && diff !== 0) continue;
      date = isoDate(addDays(today, diff));
    }
    if (!date) continue;
    const key = `${date} ${s.time_start || '99:99'}`;
    if (!best || key < best.key) best = { key, date, session: s, recurring: !s.date };
  }
  return best;
}

function fmtDay(dateIso) {
  const today = isoDate(new Date());
  if (dateIso === today) return 'Hoy';
  if (dateIso === isoDate(addDays(new Date(), 1))) return 'Mañana';
  const d = new Date(dateIso + 'T00:00:00');
  const label = d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function fmtOccurrence(occ) {
  if (!occ) return '';
  const time = hhmm(occ.session.time_start);
  return `${fmtDay(occ.date)}${time ? ' · ' + time : ''}`;
}

// Texto para una sesión puntual o semanal (detalle y listas por categoría)
function fmtSession(s) {
  const time = hhmm(s.time_start) + (s.time_end ? ' – ' + hhmm(s.time_end) : '');
  if (s.date) return `${fmtDay(s.date)}${time ? ' · ' + time : ''}`;
  if (s.weekday) return `Todos los ${s.weekday.toLowerCase()}${time ? ' · ' + time : ''}`;
  return time;
}

function registrationLink(activity) {
  const digits = (activity.registration_whatsapp || '').replace(/\D/g, '');
  if (digits) {
    const text = `Hola, quiero inscribirme en "${activity.title}".`;
    return { href: `https://wa.me/${digits}?text=${encodeURIComponent(text)}`, note: 'Se abrirá WhatsApp para enviar tu inscripción.' };
  }
  const url = (activity.registration_url || '').trim();
  if (/^https?:\/\//i.test(url)) return { href: url, note: '' };
  return null;
}

// ---------------------------------------------------------------------------
// Estado global (fetch una sola vez, se reusa entre vistas)
// ---------------------------------------------------------------------------
const state = { content: {}, categories: [], categoriesById: {}, activities: [], locationsById: {}, projects: [], prayer: null };

async function loadData() {
  const data = await api('public');
  state.content = data.content || {};
  state.categories = (data.categories || []).filter((c) => c.slug !== 'publicaciones');
  state.categoriesById = Object.fromEntries(state.categories.map((c) => [c.id, c]));
  state.activities = (data.activities || []).filter((a) => state.categoriesById[a.category_id]);
  // Solo nombres: la dirección real nunca viene en la API pública.
  state.locationsById = Object.fromEntries((data.locations || []).map((l) => [l.id, l.name]));
  state.projects = data.projects || [];
}

// Lugar de una sesión: Polonia (ubicación fija) o lo que se escribió a mano en el panel.
const placeOf = (s) => (s?.location_id ? state.locationsById[s.location_id] : s?.location_text) || '';

// Texto enriquecido de los proyectos: **negrita**, links y números de WhatsApp clickeables,
// línea en blanco = párrafo nuevo. Con inline=true solo negrita (para usar dentro de un link).
function richText(text, { inline = false } = {}) {
  let html = esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  if (inline) return html.replace(/\n/g, ' ');
  html = html
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/(\+?56\s?9(?:\s?\d){8})/g, (m) => `<a href="https://wa.me/${m.replace(/\D/g, '')}" target="_blank" rel="noopener">${m}</a>`);
  return html
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function buttonHref(url) {
  const value = (url || '').trim();
  if (/^https?:\/\//i.test(value)) return value;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 8 && !/[a-z]/i.test(value) ? `https://wa.me/${digits}` : '';
}

// ---------------------------------------------------------------------------
// Header (logo + menú hamburguesa) y barra inferior: mismas 3 secciones en ambos
// ---------------------------------------------------------------------------
const NAV = [
  { href: '#/', label: 'Inicio', key: 'home', icon: ICONS.home },
  { href: '#/actividades', label: 'Actividades', key: 'actividades', icon: ICONS.calendar },
  { href: '#/quienes-somos', label: 'Quiénes somos', key: 'quienes-somos', icon: ICONS.info },
];

const menuBtn = document.getElementById('menu-btn');
const menuPanel = document.getElementById('menu-panel');

function setMenu(open) {
  menuPanel.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
}
menuBtn.addEventListener('click', () => setMenu(menuPanel.hidden));
document.addEventListener('click', (e) => {
  if (!menuPanel.hidden && !e.target.closest('#site-header')) setMenu(false);
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && setMenu(false));
window.addEventListener('scroll', () => {
  document.getElementById('site-header').classList.toggle('scrolled', window.scrollY > 4);
}, { passive: true });

function renderChrome(activeTab) {
  setMenu(false);
  menuPanel.innerHTML = NAV.map((t) => `<a href="${t.href}" class="${t.key === activeTab ? 'active' : ''}">${t.label}</a>`).join('');
  document.getElementById('tabbar').innerHTML = NAV.map(
    (t) => `<a href="${t.href}" class="${t.key === activeTab ? 'active' : ''}">${t.icon}<span>${t.label}</span></a>`
  ).join('');
}

// "Volver" vuelve a donde estaba la persona (ej. la Home); si llegó directo por un link,
// va a la página indicada como respaldo.
let navigatedInApp = false;
let restoreScroll = false;
const scrollPositions = {};
function goBack(fallbackHash) {
  if (navigatedInApp && history.length > 1) {
    restoreScroll = true;
    history.back();
  } else {
    location.hash = fallbackHash;
  }
}

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------
function activityCard(a, occ) {
  const category = state.categoriesById[a.category_id];
  const isToday = occ && occ.date === isoDate(new Date());
  return `
    <a class="activity-card" href="#/actividad/${a.id}">
      ${
        a.photo_url
          ? `<div class="photo" style="background-image:url('${esc(assetUrl(a.photo_url))}')">${isToday ? '<span class="badge-today">HOY</span>' : ''}</div>`
          : `<div class="photo placeholder"><img src="${MARK}" alt="">${isToday ? '<span class="badge-today">HOY</span>' : ''}</div>`
      }
      <div class="info">
        <p class="cat">${esc(category?.name)}</p>
        <p class="title">${esc(a.title)}</p>
        <p class="when">${esc(fmtOccurrence(occ))}</p>
      </div>
    </a>`;
}

function activityListRow(a) {
  const occ = nextOccurrence(a);
  const first = (a.sessions || [])[0];
  const when = occ ? (occ.recurring ? fmtSession(occ.session) : fmtOccurrence(occ)) : first ? fmtSession(first) : '';
  const place = placeOf(occ?.session);
  return `
    <a class="activity-row" href="#/actividad/${a.id}">
      <div class="thumb ${a.photo_url ? '' : 'placeholder'}" style="${a.photo_url ? `background-image:url('${esc(assetUrl(a.photo_url))}')` : ''}">
        ${a.photo_url ? '' : `<img src="${MARK}" alt="">`}
      </div>
      <div>
        <p class="title">${esc(a.title)}</p>
        <p class="when">${esc(when)}</p>
        ${place ? `<p class="meta">${esc(place)}</p>` : ''}
      </div>
    </a>`;
}

function prayerSection() {
  const cover = assetUrl('assets/img/para-rezar-hoy.webp');
  const today = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  return `
    <article class="prayer-card">
      <div class="cover" style="background-image:url('${cover}')" role="img" aria-label="Persona leyendo un libro al aire libre">
        <h2>Para rezar hoy<small>${esc(today.charAt(0).toUpperCase() + today.slice(1))}</small></h2>
      </div>
      <ul class="prayer-list" id="prayer-list">
        ${state.prayer ? prayerItems(state.prayer) : '<li><div class="skeleton"></div></li><li><div class="skeleton"></div></li><li><div class="skeleton"></div></li>'}
      </ul>
    </article>`;
}

function prayerItems(prayer) {
  return prayer.items
    .map((i) => `<li><a href="${esc(i.url)}" target="_blank" rel="noopener"><span>${esc(i.title)}</span>${ICONS.external}</a></li>`)
    .join('');
}

async function loadPrayer() {
  const today = isoDate(new Date());
  if (state.prayer && state.prayer.date === today) return;
  try {
    state.prayer = await api('prayer');
  } catch {
    // Sin API: mismos links, títulos genéricos.
    state.prayer = {
      date: today,
      items: [
        { title: 'Evangelio del día', url: 'https://opusdei.org/es-cl/gospel/' },
        { title: 'Meditación del día', url: 'https://opusdei.org/es-cl/meditation/' },
        { title: 'Un texto para meditar hoy', url: 'https://opusdei.org/es-cl/dailytext/' },
      ],
    };
  }
  const list = document.getElementById('prayer-list');
  if (list) list.innerHTML = prayerItems(state.prayer);
}

// ---------------------------------------------------------------------------
// Vista: Home
// ---------------------------------------------------------------------------
function projectTeaser(p) {
  return `
    <a class="project-teaser" href="#/quienes-somos/proyectos/${esc(p.slug)}">
      ${p.logo_url ? `<img class="pt-logo" src="${esc(assetUrl(p.logo_url))}" alt="${esc(p.title)}">` : `<p class="pt-title">${esc(p.title)}</p>`}
      ${p.tagline ? `<p class="pt-tag">${esc(p.tagline)}</p>` : ''}
      ${p.summary ? `<p class="pt-summary">${richText(p.summary, { inline: true })}</p>` : ''}
      <span class="pt-more">Ver más →</span>
    </a>`;
}

function renderHome() {
  renderChrome('home');
  const view = document.getElementById('view');
  const homeProjects = state.projects.filter((p) => Number(p.show_on_home));
  view.innerHTML = `
    <section class="hero">
      <h1>${esc(state.content['hero.title'])}</h1>
      <p>${esc(state.content['hero.subtitle'])}</p>
    </section>
    <div id="app-banner-slot"></div>
    <section class="section" style="padding-bottom:10px;">
      <h2 class="section-title" style="margin:0;">Actividades</h2>
    </section>
    <nav class="chips" id="chips" aria-label="Filtrar por categoría"></nav>
    <div id="home-activities"></div>
    <a class="see-all" href="#/actividades">Ver todas las actividades →</a>
    ${prayerSection()}
    ${
      state.content['confesiones.booking_url']
        ? `<section class="confession-card">
             <h2>${esc(state.content['confesiones.titulo'] || 'Confesiones')}</h2>
             <p>${esc(state.content['confesiones.texto'] || 'Agenda para confesiones o hablar con un sacerdote')}</p>
             <a class="btn" href="${esc(state.content['confesiones.booking_url'])}" target="_blank" rel="noopener">Agendar →</a>
           </section>`
        : ''
    }
    ${
      homeProjects.length
        ? `<section class="section" style="padding-top:30px;"><h2 class="section-title" style="margin:0;">Proyectos</h2></section>
           <div class="projects-list">${homeProjects.map(projectTeaser).join('')}</div>`
        : ''
    }
    <div class="about-teaser">
      <h2>Quiénes somos</h2>
      <p>${esc(state.content['quienes_somos.teaser'])}</p>
      <a href="#/quienes-somos">Conocer el centro →</a>
    </div>`;

  renderAppBanner(document.getElementById('app-banner-slot'));
  loadPrayer();

  // Solo las categorías con actividades próximas o semanales; las demás se ocultan hasta
  // que tengan una actividad nueva.
  const activeCategories = state.categories.filter((c) =>
    state.activities.some((a) => a.category_id === c.id && nextOccurrence(a))
  );
  const chipsEl = document.getElementById('chips');
  chipsEl.innerHTML = activeCategories.length
    ? `<button class="chip active" data-category="">Todas</button>` +
      activeCategories.map((c) => `<button class="chip" data-category="${c.id}">${esc(c.name)}</button>`).join('')
    : '';

  // "Todas": la más cercana primero, y las semanales (círculos) solo el día que tocan.
  // Una categoría: todas sus próximas, incluidas las semanales de otros días.
  function renderActivities(categoryId = '') {
    const list = categoryId ? state.activities.filter((a) => a.category_id === categoryId) : state.activities;
    const upcoming = list
      .map((a) => ({ a, occ: nextOccurrence(a, { onlyTodayRecurring: !categoryId }) }))
      .filter((x) => x.occ)
      .sort((x, y) => x.occ.key.localeCompare(y.occ.key))
      .slice(0, categoryId ? undefined : HOME_LIMIT);
    document.getElementById('home-activities').innerHTML = upcoming.length
      ? `<div class="activities-grid">${upcoming.map((x) => activityCard(x.a, x.occ)).join('')}</div>`
      : `<p class="empty-note">No hay actividades para hoy. <a href="#/actividades">Ver todas las actividades</a></p>`;
  }

  renderActivities();

  chipsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    chipsEl.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === btn));
    renderActivities(btn.dataset.category);
  });
}

// ---------------------------------------------------------------------------
// Vista: grilla de categorías (Actividades)
// ---------------------------------------------------------------------------
function renderCategorias() {
  renderChrome('actividades');
  const view = document.getElementById('view');
  view.innerHTML = `
    <section class="page-title"><h1>Actividades</h1></section>
    <div class="categories-grid">
      ${state.categories
        .map((c) => {
          const count = state.activities.filter((a) => a.category_id === c.id).length;
          const countLabel =
            c.slug === 'confesiones' && state.content['confesiones.booking_url']
              ? 'Reservar hora'
              : count > 0
              ? `${count} actividad${count > 1 ? 'es' : ''}`
              : 'Próximamente';
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
  // Próximas primero (por fecha), después las que ya pasaron.
  const list = state.activities
    .filter((a) => a.category_id === category.id)
    .map((a) => ({ a, occ: nextOccurrence(a) }))
    .sort((x, y) => (x.occ ? x.occ.key : 'z' + x.a.title).localeCompare(y.occ ? y.occ.key : 'z' + y.a.title))
    .map((x) => x.a);

  const bookingUrl = category.slug === 'confesiones' ? state.content['confesiones.booking_url'] : null;

  view.innerHTML = `
    <nav class="page-nav"><button type="button" class="back">← Volver</button></nav>
    <section class="page-title" style="padding-top:4px;">
      <h1>${esc(category.name)}</h1>
      ${category.description ? `<p>${esc(category.description)}</p>` : ''}
    </section>
    ${
      bookingUrl
        ? `<a class="booking-card" href="${esc(bookingUrl)}" target="_blank" rel="noopener">
             <p class="title">Reservar hora de confesión</p>
             <p class="sub">Elige el día y el horario disponible en pocos minutos.</p>
             <span class="cta">Reservar →</span>
           </a>`
        : list.length === 0
        ? `<p class="empty-note">Todavía no hay actividades en esta categoría. Próximamente.</p>`
        : `<div class="activities-list">${list.map(activityListRow).join('')}</div>`
    }`;
  view.querySelector('.back').addEventListener('click', () => goBack('#/actividades'));
}

// ---------------------------------------------------------------------------
// Vista: detalle de actividad
// ---------------------------------------------------------------------------
function renderActividad(id) {
  renderChrome('actividades');
  const view = document.getElementById('view');
  const activity = state.activities.find((a) => a.id === id);
  if (!activity) {
    view.innerHTML = `<p class="loading-note">Actividad no encontrada. <a href="#/actividades">Volver</a></p>`;
    return;
  }
  const category = state.categoriesById[activity.category_id];
  const registration = registrationLink(activity);
  const todayIso = isoDate(new Date());

  // Sesiones futuras primero; las pasadas al final.
  const sessions = [...(activity.sessions || [])].sort((a, b) => {
    const ka = a.date ? (a.date >= todayIso ? '0' : '2') + a.date : '1' + String((weekdayIndex(a.weekday) + 6) % 7);
    const kb = b.date ? (b.date >= todayIso ? '0' : '2') + b.date : '1' + String((weekdayIndex(b.weekday) + 6) % 7);
    return ka.localeCompare(kb);
  });

  view.innerHTML = `
    <nav class="page-nav">
      <button type="button" class="back">← Volver</button>
      ${category ? `<a class="see-category" href="#/actividades/${category.slug}">Ver todo: ${esc(category.name)} →</a>` : ''}
    </nav>
    ${
      activity.photo_url
        ? `<div class="detail-photo" style="background-image:url('${esc(assetUrl(activity.photo_url))}')"></div>`
        : `<div class="detail-photo placeholder"><img src="${MARK}" alt=""></div>`
    }
    <section class="detail-head">
      ${category ? `<p class="cat">${esc(category.name)}</p>` : ''}
      <h1>${esc(activity.title)}</h1>
      ${activity.description ? `<p>${esc(activity.description)}</p>` : ''}
    </section>
    <div class="sessions-list">
      ${sessions
        .map((s) => {
          const place = placeOf(s);
          return `
        <div class="session-row">
          <p class="when">${esc(fmtSession(s))}</p>
          ${s.topic ? `<p class="topic">${esc(s.topic)}</p>` : ''}
          ${s.speaker ? `<p class="speaker">Con ${esc(s.speaker)}</p>` : ''}
          ${place ? `<p class="location">${esc(place)}${registration && s.location_id ? ' · dirección disponible al inscribirte' : ''}</p>` : ''}
          ${s.price ? `<p class="price">${esc(s.price)}</p>` : ''}
        </div>`;
        })
        .join('')}
    </div>
    ${
      registration
        ? `<div class="detail-cta">
             <a class="btn block" href="${esc(registration.href)}" target="_blank" rel="noopener">Inscríbete aquí</a>
             ${registration.note ? `<p style="text-align:center;font-size:0.8rem;color:var(--olive);margin:8px 0 0;">${registration.note}</p>` : ''}
           </div>`
        : ''
    }`;

  view.querySelector('.back').addEventListener('click', () => goBack(category ? `#/actividades/${category.slug}` : '#/'));
}

// ---------------------------------------------------------------------------
// Vista: Quiénes somos
// ---------------------------------------------------------------------------
function renderQuienesSomos() {
  renderChrome('quienes-somos');
  const view = document.getElementById('view');
  const imagen = state.content['quienes_somos.imagen'];
  const address = state.content['contact.address'];
  const mapUrl = state.content['contact.map_url'];

  view.innerHTML = `
    <section class="page-title"><h1>Quiénes somos</h1></section>
    <section class="section" style="padding-top:12px;">
      <p class="about-p">${esc(state.content['quienes_somos.parrafo1'])}</p>
    </section>
    ${imagen ? `<div class="about-photo" style="background-image:url('${esc(assetUrl(imagen))}')"></div>` : ''}
    <section class="section" style="padding-top:14px;">
      <p class="about-p">${esc(state.content['quienes_somos.parrafo2'])}</p>
    </section>
    <section class="section about-block">
      <h2 class="section-title eyebrow">Qué hacemos</h2>
      <ul class="about-list">${state.categories.map((c) => `<li>${esc(c.name)}</li>`).join('')}</ul>
    </section>
    ${
      state.projects.length
        ? `<section class="section about-block" id="proyectos">
      <h2 class="section-title eyebrow">Proyectos</h2>
    </section>
    <div class="projects-list">${state.projects.map(projectTeaser).join('')}</div>`
        : ''
    }
    ${
      address
        ? `<section class="section about-block">
      <h2 class="section-title eyebrow">Cómo llegar</h2>
      <p class="about-p">${esc(address)}</p>
      ${mapUrl ? `<a href="${esc(mapUrl)}" target="_blank" rel="noopener" class="link-arrow">Ver en el mapa →</a>` : ''}
    </section>`
        : ''
    }`;
}

// ---------------------------------------------------------------------------
// Vista: página de un proyecto (Quiénes somos → Proyectos → …)
// ---------------------------------------------------------------------------
const PIN_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>';

function projectSessionRow(item) {
  const s = item.session;
  const place = placeOf(s);
  return `
    <a class="session-row link" href="#/actividad/${item.activity.id}">
      <p class="when">${esc(fmtSession(s))}</p>
      ${s.topic ? `<p class="topic">${esc(s.topic)}</p>` : `<p class="topic">${esc(item.activity.title)}</p>`}
      ${s.speaker ? `<p class="speaker">Con ${esc(s.speaker)}</p>` : ''}
      ${place ? `<p class="location">${esc(place)}</p>` : ''}
    </a>`;
}

function renderProyecto(slug) {
  renderChrome('quienes-somos');
  const view = document.getElementById('view');
  const p = state.projects.find((x) => x.slug === slug);
  if (!p) {
    view.innerHTML = `<p class="loading-note">Proyecto no encontrado. <a href="#/quienes-somos">Volver</a></p>`;
    return;
  }

  let activitiesHtml = '';
  if (p.category_id) {
    const today = isoDate(new Date());
    const items = state.activities
      .filter((a) => a.category_id === p.category_id)
      .flatMap((a) => (a.sessions || []).map((session) => ({ activity: a, session })));
    const upcoming = items
      .filter((i) => !i.session.date || i.session.date >= today)
      .sort((x, y) => String(x.session.date || '0').localeCompare(String(y.session.date || '0')));
    const past = items.filter((i) => i.session.date && i.session.date < today).sort((x, y) => y.session.date.localeCompare(x.session.date));
    activitiesHtml = `
      <section class="project-section">
        <h2>${esc(p.upcoming_label || 'Próximos encuentros')}</h2>
        ${upcoming.length ? `<div class="sessions-list flush">${upcoming.map(projectSessionRow).join('')}</div>` : `<p class="empty-note flush">Pronto publicaremos el próximo encuentro.</p>`}
      </section>
      <section class="project-section">
        <h2>${esc(p.past_label || 'Encuentros anteriores')}</h2>
        ${past.length ? `<div class="sessions-list flush past">${past.map(projectSessionRow).join('')}</div>` : `<p class="empty-note flush">Todavía no hay encuentros anteriores.</p>`}
      </section>`;
  }

  view.innerHTML = `
    <nav class="page-nav"><button type="button" class="back">← Volver</button></nav>
    <section class="project-hero">
      ${p.logo_url ? `<img class="project-logo" src="${esc(assetUrl(p.logo_url))}" alt="${esc(p.title)}">` : ''}
      <h1 ${p.logo_url ? 'class="visually-hidden"' : ''}>${esc(p.title)}</h1>
      ${p.tagline ? `<p class="project-tag">${PIN_ICON}${esc(p.tagline)}</p>` : ''}
      ${p.summary ? `<div class="project-summary">${richText(p.summary)}</div>` : ''}
    </section>
    ${(p.sections || [])
      .map(
        (sec) => `
      <section class="project-section">
        ${sec.title ? `<h2>${esc(sec.title)}</h2>` : ''}
        ${sec.text ? `<div class="project-text">${richText(sec.text)}</div>` : ''}
        ${
          sec.cards?.length
            ? `<div class="project-cards">${sec.cards
                .map(
                  (c, i) => `
              <div class="project-card tone-${i % 3}">
                ${c.title ? `<h3>${esc(c.title)}</h3>` : ''}
                ${c.text ? `<p>${esc(c.text)}</p>` : ''}
                ${c.meta ? `<p class="meta">${esc(c.meta)}</p>` : ''}
              </div>`
                )
                .join('')}</div>`
            : ''
        }
        ${
          sec.buttons?.length
            ? `<div class="project-buttons">${sec.buttons
                .map((b, i) => {
                  const href = buttonHref(b.url);
                  return href
                    ? `<a class="pill tone-${i % 3}" href="${esc(href)}" target="_blank" rel="noopener">${esc(b.label)}</a>`
                    : `<span class="pill tone-${i % 3}">${esc(b.label)}</span>`;
                })
                .join('')}</div>`
            : ''
        }
      </section>`
      )
      .join('')}
    ${activitiesHtml}`;
  view.querySelector('.back').addEventListener('click', () => goBack('#/quienes-somos'));
}

// ---------------------------------------------------------------------------
// Bubble chat → WhatsApp (persistente en todas las vistas)
// ---------------------------------------------------------------------------
function renderChatBubble(override) {
  document.querySelector('.chat-bubble')?.remove();

  // Si la actividad tiene contacto propio se usa ese; si no, el número general del centro.
  const phone = override?.phone || state.content['contact.whatsapp'];
  if (!phone) return;

  const digits = phone.replace(/\D/g, '');
  const greeting = override?.name ? `Hola ${override.name}, escribo desde Poloniapp 👋` : 'Hola, escribo desde Poloniapp 👋';
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
let currentHash = location.hash;

function route() {
  scrollPositions[currentHash] = window.scrollY;
  currentHash = location.hash;
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);

  // Default: número general del centro. renderActividad lo cambia si la actividad tiene contacto propio.
  renderChatBubble(null);
  if (parts.length === 0) renderHome();
  else if (parts[0] === 'actividades' && parts.length === 1) renderCategorias();
  else if (parts[0] === 'actividades' && parts.length === 2) renderCategoria(parts[1]);
  else if (parts[0] === 'actividad' && parts[1]) renderActividad(parts[1]);
  else if (parts[0] === 'quienes-somos' && parts[1] === 'proyectos' && parts[2]) renderProyecto(parts[2]);
  else if (parts[0] === 'quienes-somos') renderQuienesSomos();
  else renderHome();

  window.scrollTo(0, restoreScroll ? scrollPositions[currentHash] || 0 : 0);
  restoreScroll = false;
}

async function init() {
  try {
    await loadData();
    window.addEventListener('hashchange', () => {
      navigatedInApp = true;
      route();
    });
    route();
  } catch (err) {
    console.error('[poloniapp] error cargando datos:', err);
    document.getElementById('view').innerHTML = `<p class="loading-note">No se pudo cargar el contenido. Intenta recargar la página.</p>`;
  }
}

// Al volver a la app al otro día (app instalada que quedó abierta), se refrescan los títulos.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && document.getElementById('prayer-list')) loadPrayer();
});

init();
