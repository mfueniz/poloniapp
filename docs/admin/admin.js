// poloniapp — panel admin (contra la API propia en docs/api/, PHP + MySQL)

import { api } from '../assets/js/api.js';

// Atajos sobre la API que devuelven { data, error } en vez de lanzar, para que cada tab
// pueda mostrar el error en su propia línea de estado.
async function attempt(promise) {
  try {
    return { data: await promise, error: null };
  } catch (error) {
    return { data: null, error };
  }
}
const db = {
  list: (table) => attempt(api('list', { params: { table } })),
  save: (table, row) => attempt(api('save', { method: 'POST', params: { table }, body: row })),
  remove: (table, id) => attempt(api('delete', { method: 'POST', params: { table }, body: { id } })),
};

const loginView = document.getElementById('login-view');
const adminView = document.getElementById('admin-view');
const loginError = document.getElementById('login-error');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
let needsSetup = false;

document.getElementById('login-btn').addEventListener('click', async () => {
  loginError.hidden = true;
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  try {
    // Sin admins todavía (instalación nueva): este mismo form crea el primero y las tablas.
    const { admin } = await api(needsSetup ? 'setup' : 'login', { method: 'POST', body: { email, password } });
    showAdmin(admin);
  } catch (err) {
    loginError.textContent = err.message;
    loginError.hidden = false;
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await attempt(api('logout', { method: 'POST' }));
  showLogin();
});

function showLogin() {
  loginView.hidden = false;
  adminView.hidden = true;
  document.getElementById('setup-note').hidden = !needsSetup;
  document.getElementById('login-btn').textContent = needsSetup ? 'Crear administrador' : 'Ingresar';
  document.getElementById('password').autocomplete = needsSetup ? 'new-password' : 'current-password';
}

function showAdmin(email) {
  needsSetup = false;
  loginView.hidden = true;
  adminView.hidden = false;
  document.getElementById('who').textContent = email;
  loadTab('contenido');
}

(async function init() {
  try {
    const status = await api('status');
    needsSetup = status.needs_setup;
    if (status.admin) return showAdmin(status.admin);
  } catch (err) {
    loginError.textContent = err.message;
    loginError.hidden = false;
  }
  showLogin();
})();

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
document.querySelectorAll('.admin-tabs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    document.querySelectorAll('.admin-tabs button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    loadTab(btn.dataset.tab);
  });
});

function loadTab(tab) {
  if (tab === 'contenido') return loadContenido();
  if (tab === 'actividades') return loadActividades();
  if (tab === 'proyectos') return loadProyectos();
  if (tab === 'rezar') return loadRezar();
  if (tab === 'admins') return loadAdmins();
  document.getElementById('tab-content').innerHTML = `<p class="coming-soon">Próximamente.</p>`;
}

// ---------------------------------------------------------------------------
// Upload de imágenes a docs/uploads/ en el mismo hosting (solo admins).
// Reutilizable desde cualquier tab (contenido fijo, actividades, proyectos).
// Devuelve una ruta relativa a la raíz del sitio (ej. "uploads/abc.jpg"), igual que assets/.
// ---------------------------------------------------------------------------
async function uploadImage(file) {
  const form = new FormData();
  form.append('file', file);
  const { url } = await api('upload', { method: 'POST', body: form });
  return url;
}

// El panel vive en admin/, así que las rutas relativas a la raíz necesitan "../" para la vista previa.
function previewSrc(url) {
  if (!url) return '';
  return /^https?:\/\//.test(url) ? url : '../' + url;
}

// ---------------------------------------------------------------------------
// Tab: Contenido fijo
// ---------------------------------------------------------------------------
async function loadContenido() {
  const container = document.getElementById('tab-content');
  container.innerHTML = `<p class="loading-note">Cargando…</p>`;

  const { data, error } = await db.list('site_content');
  if (error) {
    container.innerHTML = `<p class="loading-note">Error cargando contenido: ${esc(error.message)}</p>`;
    return;
  }

  const bySection = {};
  for (const row of data || []) {
    (bySection[row.section] ||= []).push(row);
  }

  container.innerHTML = Object.entries(bySection)
    .map(
      ([section, rows]) => `
      <section class="content-section">
        <h2>${esc(section)}</h2>
        ${rows
          .map((r) => {
            const isImage = r.key.endsWith('.imagen');
            return `
          <div class="field" data-key="${esc(r.key)}">
            <label>${esc(r.key)}</label>
            ${
              isImage
                ? `<div class="image-field">
                     <img class="image-preview" src="${esc(previewSrc(r.value))}" ${r.value ? '' : 'hidden'}>
                     <input type="file" accept="image/*" class="image-input">
                     <span class="status upload-status"></span>
                   </div>`
                : ''
            }
            <textarea${isImage ? ' placeholder="o pega una URL aquí"' : ''}>${esc(r.value)}</textarea>
            <div class="save-row">
              <button class="save">Guardar</button>
              <span class="status"></span>
            </div>
          </div>`;
          })
          .join('')}
      </section>`
    )
    .join('');

  container.querySelectorAll('.field').forEach((field) => {
    const key = field.dataset.key;
    const textarea = field.querySelector('textarea');
    const saveBtn = field.querySelector('.save');
    const status = field.querySelector('.save-row .status');
    const original = textarea.value;

    textarea.addEventListener('input', () => {
      status.textContent = '';
      saveBtn.disabled = textarea.value === original;
    });
    saveBtn.disabled = true;

    const fileInput = field.querySelector('.image-input');
    if (fileInput) {
      const preview = field.querySelector('.image-preview');
      const uploadStatus = field.querySelector('.upload-status');
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        uploadStatus.textContent = 'Subiendo…';
        try {
          const url = await uploadImage(file);
          textarea.value = url;
          preview.src = previewSrc(url);
          preview.hidden = false;
          uploadStatus.textContent = 'Subida ✓ — falta Guardar';
          saveBtn.disabled = false;
        } catch (err) {
          uploadStatus.textContent = 'Error: ' + err.message;
        }
      });
    }

    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      status.textContent = 'Guardando…';
      const { error } = await db.save('site_content', { key, value: textarea.value });
      if (error) {
        status.textContent = 'Error: ' + error.message;
        saveBtn.disabled = false;
      } else {
        status.textContent = 'Guardado ✓';
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Tab: Actividades — arriba las próximas (y las que aún no tienen sesiones); abajo dos
// acordeones cerrados: actividades pasadas y círculos (semanales). Cada actividad se abre
// para editarla. La categoría se elige en el selector o se crea ahí mismo.
// ---------------------------------------------------------------------------
const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const NEW_CATEGORY = '__new';
let poloniaId = null;
let openAfterReload = null;

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso) {
  const label = new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return label.replace(/\./g, '');
}

/** 'circles' | 'upcoming' | 'past' */
function activityGroup(a, circlesId) {
  if (a.category_id === circlesId) return 'circles';
  const sessions = a.sessions || [];
  if (!sessions.length) return 'upcoming';
  const today = todayIso();
  return sessions.some((s) => !s.date || s.date >= today) ? 'upcoming' : 'past';
}

function activityWhen(a) {
  const sessions = a.sessions || [];
  if (!sessions.length) return 'Sin sesiones todavía';
  const today = todayIso();
  const recurring = sessions.find((s) => !s.date);
  if (recurring) return `Todos los ${recurring.weekday.toLowerCase()}${recurring.time_start ? ' · ' + recurring.time_start.slice(0, 5) : ''}`;
  const dates = sessions.map((s) => s.date).sort();
  const next = dates.find((d) => d >= today);
  return next ? `Próxima: ${fmtDate(next)}` : `Última: ${fmtDate(dates[dates.length - 1])}`;
}

function sessionPlaceHtml(s) {
  const place = !s ? 'polonia' : s.location_id ? 'polonia' : s.location_text ? 'other' : 'none';
  return `
    <div style="flex:0 0 170px;"><label>Lugar</label>
      <select class="s-place">
        <option value="polonia" ${place === 'polonia' ? 'selected' : ''}>Polonia</option>
        <option value="other" ${place === 'other' ? 'selected' : ''}>Otro lugar…</option>
        <option value="none" ${place === 'none' ? 'selected' : ''}>Sin lugar</option>
      </select>
    </div>
    <div class="s-place-other" ${place === 'other' ? '' : 'hidden'}><label>¿Dónde?</label>
      <input type="text" class="s-location-text" value="${esc(s?.location_text)}" placeholder="ej. Parroquia San Andrés">
    </div>`;
}

function sessionRowHtml(s) {
  const weekday = s?.weekday || '';
  return `
    <div class="session-crud-row" data-id="${s?.id || ''}">
      <button type="button" class="remove-session-row" title="Quitar esta sesión">×</button>
      <div class="crud-row">
        <div><label>Fecha (vacía si se repite cada semana)</label><input type="date" class="s-date" value="${s?.date || ''}"></div>
        <div><label>Se repite cada…</label>
          <select class="s-weekday">
            <option value="">(no se repite)</option>
            ${WEEKDAYS.map((d) => `<option value="${d}" ${d.toLowerCase() === weekday.toLowerCase() ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
        </div>
        <div style="flex:0 0 110px;"><label>Hora inicio</label><input type="time" class="s-start" value="${s?.time_start?.slice(0, 5) || ''}"></div>
        <div style="flex:0 0 110px;"><label>Hora fin</label><input type="time" class="s-end" value="${s?.time_end?.slice(0, 5) || ''}"></div>
      </div>
      <div class="crud-row">
        <div><label>Tema</label><input type="text" class="s-topic" value="${esc(s?.topic)}"></div>
        <div><label>Expositor / responsable</label><input type="text" class="s-speaker" value="${esc(s?.speaker)}"></div>
        <div style="flex:0 0 140px;"><label>Precio</label><input type="text" class="s-price" value="${esc(s?.price)}" placeholder="ej. $10.000"></div>
      </div>
      <div class="crud-row">${sessionPlaceHtml(s)}</div>
    </div>`;
}

async function loadActividades() {
  const container = document.getElementById('tab-content');
  // Mantener abiertos los acordeones y actividades que estaban abiertos antes de recargar.
  const wasOpen = new Set([...container.querySelectorAll('details[open][data-key]')].map((d) => d.dataset.key));
  if (openAfterReload) {
    wasOpen.add(openAfterReload);
    wasOpen.delete('new'); // recién creada: se cierra el formulario de nueva actividad
  }
  openAfterReload = null;
  if (!container.querySelector('.acc')) container.innerHTML = `<p class="loading-note">Cargando…</p>`;

  const [{ data: activities, error: e1 }, { data: categories, error: e2 }, { data: locations, error: e3 }, { data: stats }] = await Promise.all([
    db.list('activities'),
    db.list('categories'),
    db.list('locations'),
    attempt(api('stats')),
  ]);
  const err = e1 || e2 || e3;
  if (err) {
    container.innerHTML = `<p class="loading-note">Error: ${esc(err.message)}</p>`;
    return;
  }
  poloniaId = locations.find((l) => l.name === 'Polonia')?.id || null;
  const circlesId = categories.find((c) => c.slug === 'circulos')?.id;
  const selectable = categories.filter((c) => c.slug !== 'publicaciones');

  const catOptions = (selectedId) =>
    selectable
      .filter((c) => c.visible || c.id === selectedId)
      .map((c) => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${esc(c.name)}</option>`)
      .join('') + `<option value="${NEW_CATEGORY}">+ Nueva categoría…</option>`;
  const catName = (id) => categories.find((c) => c.id === id)?.name || '';

  function activityFormHtml(a) {
    const sessions = a?.sessions?.length ? a.sessions : [null];
    return `
      <div class="crud-card activity-form" data-id="${a?.id || ''}">
        <div class="crud-row">
          <div><label>Título</label><input type="text" class="f-title title-input" value="${esc(a?.title)}" placeholder="ej. Retiro de Noviembre"></div>
        </div>
        <div class="crud-row">
          <div><label>Categoría</label><select class="f-category">${a ? '' : '<option value="" selected>Elige una categoría…</option>'}${catOptions(a?.category_id)}</select></div>
          <div class="crud-check"><label><input type="checkbox" class="f-visible" ${!a || a.visible ? 'checked' : ''}> visible en el sitio</label></div>
        </div>
        <div class="crud-row new-category" hidden>
          <div><label>Nombre de la categoría nueva</label><input type="text" class="f-new-category" placeholder="ej. Encuentros Matrimoniales"></div>
        </div>
        <div class="crud-row">
          <div><label>Descripción</label><textarea class="f-desc" rows="3">${esc(a?.description)}</textarea></div>
        </div>
        <div class="sessions-block">
          <h4>Fecha, hora y lugar</h4>
          <div class="sessions-list">${sessions.map(sessionRowHtml).join('')}</div>
          <button type="button" class="add-btn add-session">+ agregar otra sesión</button>
        </div>
        <div class="crud-row" style="margin-top:14px;">
          <div>
            <label>Foto (los círculos no muestran foto)</label>
            <div class="image-field">
              <img class="image-preview" src="${esc(previewSrc(a?.photo_url))}" ${a?.photo_url ? '' : 'hidden'}>
              <input type="file" accept="image/*" class="image-input">
              <span class="status upload-status"></span>
            </div>
            <input type="text" class="f-photo" value="${esc(a?.photo_url)}" placeholder="o pega una ruta/URL (ej. assets/activities/foto.jpg)">
          </div>
        </div>
        ${registrationBlockHtml(a)}
        <div class="crud-actions form-actions">
          <button class="save">${a ? 'Guardar' : 'Crear actividad'}</button>
          ${a ? `<button class="delete">Borrar actividad</button>` : ''}
          ${a?.slug ? `<a href="../#/actividad/${esc(a.slug)}" target="_blank" rel="noopener" class="view-link">ver en el sitio →</a>` : ''}
          <span class="status"></span>
        </div>
      </div>`;
  }

  function activityItemHtml(a) {
    return `
      <details class="item" data-key="a-${a.id}">
        <summary>
          <span class="item-title">${esc(a.title)}${a.visible ? '' : ' <span class="badge warn">oculta</span>'}</span>
          <span class="item-meta">${esc(catName(a.category_id))} · ${esc(activityWhen(a))}</span>
        </summary>
        ${activityFormHtml(a)}
      </details>`;
  }

  const groups = { upcoming: [], past: [], circles: [] };
  for (const a of activities) groups[activityGroup(a, circlesId)].push(a);
  const firstDate = (a, pick) => {
    const today = todayIso();
    const dates = (a.sessions || []).map((s) => s.date).filter(Boolean).sort();
    if (pick === 'next') return dates.find((d) => d >= today) || (a.sessions?.length ? '0000' : '9999');
    return dates[dates.length - 1] || '';
  };
  groups.upcoming.sort((x, y) => firstDate(x, 'next').localeCompare(firstDate(y, 'next')));
  groups.past.sort((x, y) => firstDate(y, 'last').localeCompare(firstDate(x, 'last')));
  groups.circles.sort((x, y) => {
    const ix = WEEKDAYS.indexOf(x.sessions?.[0]?.weekday) * 10000 + Number((x.sessions?.[0]?.time_start || '99:99').replace(':', '').slice(0, 4));
    const iy = WEEKDAYS.indexOf(y.sessions?.[0]?.weekday) * 10000 + Number((y.sessions?.[0]?.time_start || '99:99').replace(':', '').slice(0, 4));
    return ix - iy;
  });

  container.innerHTML = `
    ${flashMessage ? `<p class="flash">${esc(flashMessage)}</p>` : ''}
    <p class="tab-note">Al crear una actividad visible se envía una notificación a ${
      stats ? `los <strong>${stats.subscribers}</strong> dispositivos` : 'los dispositivos'
    } que activaron las notificaciones de Poloniapp.</p>
    <details class="acc acc-new" data-key="new">
      <summary>+ Nueva actividad</summary>
      ${activityFormHtml(null)}
    </details>
    <h2 class="group-title">Próximas actividades <span>(${groups.upcoming.length})</span></h2>
    ${groups.upcoming.length ? groups.upcoming.map(activityItemHtml).join('') : '<p class="loading-note">No hay actividades próximas.</p>'}
    <details class="acc" data-key="past">
      <summary>Actividades pasadas <span>(${groups.past.length})</span></summary>
      ${groups.past.map(activityItemHtml).join('') || '<p class="loading-note">No hay actividades pasadas.</p>'}
    </details>
    <details class="acc" data-key="circles">
      <summary>Círculos <span>(${groups.circles.length})</span></summary>
      ${groups.circles.map(activityItemHtml).join('') || '<p class="loading-note">No hay círculos.</p>'}
    </details>`;
  flashMessage = '';

  container.querySelectorAll('details[data-key]').forEach((d) => {
    if (wasOpen.has(d.dataset.key)) d.open = true;
  });
  container.querySelectorAll('.activity-form').forEach(wireActivityCard);
}

function wireActivityCard(card) {
  const id = card.dataset.id;
  const saveBtn = card.querySelector('.form-actions .save');
  const deleteBtn = card.querySelector('.form-actions .delete');
  const status = card.querySelector('.form-actions .status');
  const categorySelect = card.querySelector('.f-category');
  const newCategoryRow = card.querySelector('.new-category');
  categorySelect.addEventListener('change', () => {
    newCategoryRow.hidden = categorySelect.value !== NEW_CATEGORY;
    if (!newCategoryRow.hidden) card.querySelector('.f-new-category').focus();
  });

  // Sesiones: agregar / quitar filas y mostrar "¿Dónde?" solo para otro lugar
  card.addEventListener('change', (e) => {
    if (e.target.matches('.s-place')) {
      e.target.closest('.session-crud-row').querySelector('.s-place-other').hidden = e.target.value !== 'other';
    }
  });
  card.addEventListener('click', (e) => {
    if (e.target.matches('.add-session')) {
      card.querySelector('.sessions-list').insertAdjacentHTML('beforeend', sessionRowHtml(null));
    } else if (e.target.matches('.remove-session-row')) {
      e.target.closest('.session-crud-row').remove();
    }
  });

  const fileInput = card.querySelector('.image-input');
  const photoField = card.querySelector('.f-photo');
  const preview = card.querySelector('.image-preview');
  const uploadStatus = card.querySelector('.upload-status');
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    uploadStatus.textContent = 'Subiendo…';
    try {
      const url = await uploadImage(file);
      photoField.value = url;
      preview.src = previewSrc(url);
      preview.hidden = false;
      uploadStatus.textContent = 'Subida ✓ — falta Guardar';
    } catch (err) {
      uploadStatus.textContent = 'Error: ' + err.message;
    }
  });

  function readSessions() {
    const sessions = [];
    for (const row of card.querySelectorAll('.session-crud-row')) {
      const date = row.querySelector('.s-date').value;
      const place = row.querySelector('.s-place').value;
      const locationText = row.querySelector('.s-location-text').value.trim();
      if (place === 'other' && !locationText && (date || row.querySelector('.s-weekday').value)) {
        return { error: 'Escribe dónde es la sesión (o elige Polonia).' };
      }
      sessions.push({
        id: row.dataset.id,
        date,
        weekday: date ? '' : row.querySelector('.s-weekday').value,
        time_start: row.querySelector('.s-start').value,
        time_end: row.querySelector('.s-end').value,
        topic: row.querySelector('.s-topic').value.trim(),
        speaker: row.querySelector('.s-speaker').value.trim(),
        price: row.querySelector('.s-price').value.trim(),
        location_id: place === 'polonia' ? poloniaId || '' : '',
        location_text: place === 'other' ? locationText : place === 'polonia' && !poloniaId ? 'Polonia' : '',
      });
    }
    return { sessions };
  }

  saveBtn.addEventListener('click', async () => {
    const title = card.querySelector('.f-title').value.trim();
    if (!title) {
      status.textContent = 'El título es obligatorio.';
      return;
    }
    const registration = readRegistration(card);
    if (registration.error) {
      status.textContent = registration.error;
      return;
    }
    const { sessions, error: sessionError } = readSessions();
    if (sessionError) {
      status.textContent = sessionError;
      return;
    }
    if (!categorySelect.value) {
      status.textContent = 'Elige una categoría (o crea una nueva).';
      return;
    }
    saveBtn.disabled = true;
    status.textContent = 'Guardando…';

    let categoryId = categorySelect.value;
    if (categoryId === NEW_CATEGORY) {
      const name = card.querySelector('.f-new-category').value.trim();
      const { data: created, error: catError } = await attempt(api('category_create', { method: 'POST', body: { name } }));
      if (catError) {
        saveBtn.disabled = false;
        status.textContent = 'Error: ' + catError.message;
        return;
      }
      categoryId = created.id;
    }

    const body = {
      id,
      title,
      category_id: categoryId,
      visible: card.querySelector('.f-visible').checked,
      description: card.querySelector('.f-desc').value.trim() || null,
      photo_url: photoField.value.trim() || null,
      ...registration.values,
      sessions,
    };
    const { data, error } = await attempt(api('save_activity', { method: 'POST', body }));
    saveBtn.disabled = false;
    if (error) {
      status.textContent = 'Error: ' + error.message;
      return;
    }
    if (!id) {
      flashMessage = data?.notified
        ? `Actividad creada. Se envió una notificación a ${data.notified} dispositivo${data.notified > 1 ? 's' : ''}.`
        : 'Actividad creada.';
    } else {
      flashMessage = `Guardado ✓ «${title}»`;
    }
    openAfterReload = 'a-' + data.id;
    loadActividades();
  });

  deleteBtn?.addEventListener('click', async () => {
    if (!confirm('¿Borrar esta actividad y todas sus sesiones?')) return;
    const { error } = await db.remove('activities', id);
    if (error) status.textContent = 'Error: ' + error.message;
    else loadActividades();
  });

  wireRegistration(card);
}

// ---------------------------------------------------------------------------
// Tab: Proyectos (páginas dentro de Quiénes somos; uno puede mostrarse en el inicio).
// Cada proyecto tiene secciones con texto, tarjetas y botones; si se le asigna una
// categoría, su página lista las próximas y anteriores actividades de esa categoría.
// ---------------------------------------------------------------------------
function cardRowHtml(c = {}) {
  return `
    <div class="sub-row card-row">
      <input type="text" class="c-title" value="${esc(c.title)}" placeholder="Título (ej. Familia)">
      <textarea class="c-text" placeholder="Texto">${esc(c.text)}</textarea>
      <input type="text" class="c-meta" value="${esc(c.meta)}" placeholder="Detalle (ej. Sábados por la mañana)">
      <button type="button" class="remove" title="Quitar">×</button>
    </div>`;
}

function buttonRowHtml(b = {}) {
  return `
    <div class="sub-row button-row">
      <input type="text" class="b-label" value="${esc(b.label)}" placeholder="Texto del botón">
      <input type="text" class="b-url" value="${esc(b.url)}" placeholder="Link (opcional: https://… o un número de WhatsApp)">
      <button type="button" class="remove" title="Quitar">×</button>
    </div>`;
}

function sectionHtml(s = {}) {
  return `
    <div class="section-editor">
      <div class="crud-row">
        <div><label>Título de la sección</label><input type="text" class="sec-title" value="${esc(s.title)}"></div>
        <div style="flex:0 0 auto;align-self:flex-end;"><button type="button" class="remove-section">Quitar sección</button></div>
      </div>
      <div class="crud-row"><div><label>Texto (usa **texto** para destacar; los números de WhatsApp se vuelven links)</label>
        <textarea class="sec-text" rows="3">${esc(s.text)}</textarea></div></div>
      <label class="sub-label">Tarjetas</label>
      <div class="cards">${(s.cards || []).map(cardRowHtml).join('')}</div>
      <button type="button" class="add-btn add-card">+ tarjeta</button>
      <label class="sub-label">Botones</label>
      <div class="buttons">${(s.buttons || []).map(buttonRowHtml).join('')}</div>
      <button type="button" class="add-btn add-button">+ botón</button>
    </div>`;
}

async function loadProyectos() {
  const container = document.getElementById('tab-content');
  const wasOpen = new Set([...container.querySelectorAll('details[open][data-key]')].map((d) => d.dataset.key));
  if (openAfterReload) wasOpen.add(openAfterReload);
  openAfterReload = null;
  container.innerHTML = `<p class="loading-note">Cargando…</p>`;
  const [{ data: projects, error: e1 }, { data: categories, error: e2 }] = await Promise.all([db.list('projects'), db.list('categories')]);
  if (e1 || e2) {
    container.innerHTML = `<p class="loading-note">Error: ${esc((e1 || e2).message)}</p>`;
    return;
  }
  const catOptions = (selected) =>
    `<option value="">(sin actividades)</option>` +
    categories
      .filter((c) => c.slug !== 'publicaciones' && (c.visible || c.id === selected))
      .map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}</option>`)
      .join('');

  function projectFormHtml(p) {
    return `
      <div class="crud-card project-card" data-id="${p?.id || ''}">
        <div class="crud-row">
          <div><label>Nombre</label><input type="text" class="p-title" value="${esc(p?.title)}"></div>
          <div><label>Bajada corta (ej. Santiago Centro)</label><input type="text" class="p-tagline" value="${esc(p?.tagline)}"></div>
          <div style="flex:0 0 80px;"><label>Orden</label><input type="number" class="p-order" value="${p?.sort_order ?? 0}"></div>
        </div>
        <div class="crud-row">
          <div><label>Frase principal (se muestra en el inicio y al comienzo de la página; usa **texto** para destacar)</label>
          <textarea class="p-summary" rows="3">${esc(p?.summary)}</textarea></div>
        </div>
        <div class="crud-row">
          <div>
            <label>Logo o imagen</label>
            <div class="image-field">
              <img class="image-preview" src="${esc(previewSrc(p?.logo_url))}" ${p?.logo_url ? '' : 'hidden'}>
              <input type="file" accept="image/*" class="image-input">
              <span class="status upload-status"></span>
            </div>
            <input type="text" class="p-logo" value="${esc(p?.logo_url)}" placeholder="o pega una ruta/URL">
          </div>
        </div>
        <div class="crud-row">
          <div class="crud-check"><label><input type="checkbox" class="p-home" ${p?.show_on_home ? 'checked' : ''}> mostrar en el inicio</label></div>
          <div class="crud-check"><label><input type="checkbox" class="p-visible" ${!p || p.visible ? 'checked' : ''}> visible</label></div>
          <div><label>Dirección de la página</label><input type="text" class="p-slug" value="${esc(p?.slug)}" placeholder="se completa sola con el nombre"></div>
        </div>
        <div class="crud-row">
          <div><label>Actividades del proyecto (categoría)</label><select class="p-category">${catOptions(p?.category_id)}</select></div>
          <div class="p-labels" ${p?.category_id ? '' : 'hidden'}><label>Título de las próximas</label><input type="text" class="p-upcoming" value="${esc(p?.upcoming_label || 'Próximos encuentros')}"></div>
          <div class="p-labels" ${p?.category_id ? '' : 'hidden'}><label>Título de las anteriores</label><input type="text" class="p-past" value="${esc(p?.past_label || 'Encuentros anteriores')}"></div>
        </div>
        <h4 class="sub-title">Secciones de la página</h4>
        <div class="sections">${(p?.sections || []).map(sectionHtml).join('')}</div>
        <button type="button" class="add-btn add-section">+ agregar sección</button>
        <div class="crud-actions" style="margin-top:14px;">
          <button class="save">${p ? 'Guardar proyecto' : 'Crear proyecto'}</button>
          ${p ? `<button class="delete">Borrar</button>` : ''}
          ${p ? `<a href="../#/quienes-somos/proyectos/${esc(p.slug)}" target="_blank" rel="noopener" style="font-size:0.82rem;">ver página →</a>` : ''}
          <span class="status"></span>
        </div>
      </div>`;
  }

  container.innerHTML = `
    <p class="tab-note">Los proyectos aparecen en <strong>Quiénes somos → Proyectos</strong>, cada uno con su propia página. Si marcas "mostrar en el inicio", su frase principal aparece en la portada con un botón "Ver más".</p>
    <details class="acc acc-new" data-key="new-project">
      <summary>+ Nuevo proyecto</summary>
      ${projectFormHtml(null)}
    </details>
    ${projects
      .map(
        (p) => `
      <details class="item" data-key="p-${p.id}">
        <summary>
          <span class="item-title">${esc(p.title)}${p.visible ? '' : ' <span class="badge warn">oculto</span>'}${p.show_on_home ? ' <span class="badge manual">en el inicio</span>' : ''}</span>
          <span class="item-meta">/quienes-somos/proyectos/${esc(p.slug)}</span>
        </summary>
        ${projectFormHtml(p)}
      </details>`
      )
      .join('')}`;

  container.querySelectorAll('details[data-key]').forEach((d) => {
    if (wasOpen.has(d.dataset.key)) d.open = true;
  });
  container.querySelectorAll('.project-card').forEach(wireProjectCard);
}

function wireProjectCard(card) {
  const id = card.dataset.id;
  const status = card.querySelector(':scope > .crud-actions .status');

  // Agregar / quitar secciones, tarjetas y botones (delegado)
  card.addEventListener('click', (e) => {
    const t = e.target;
    if (t.matches('.add-section')) card.querySelector('.sections').insertAdjacentHTML('beforeend', sectionHtml());
    else if (t.matches('.remove-section') && confirm('¿Quitar esta sección?')) t.closest('.section-editor').remove();
    else if (t.matches('.add-card')) t.previousElementSibling.insertAdjacentHTML('beforeend', cardRowHtml());
    else if (t.matches('.add-button')) t.previousElementSibling.insertAdjacentHTML('beforeend', buttonRowHtml());
    else if (t.matches('.sub-row .remove')) t.closest('.sub-row').remove();
  });
  card.querySelector('.p-category').addEventListener('change', (e) => {
    card.querySelectorAll('.p-labels').forEach((el) => (el.hidden = !e.target.value));
  });

  const fileInput = card.querySelector('.image-input');
  const logoField = card.querySelector('.p-logo');
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const uploadStatus = card.querySelector('.upload-status');
    uploadStatus.textContent = 'Subiendo…';
    try {
      const url = await uploadImage(file);
      logoField.value = url;
      const preview = card.querySelector('.image-preview');
      preview.src = previewSrc(url);
      preview.hidden = false;
      uploadStatus.textContent = 'Subida ✓ — falta Guardar';
    } catch (err) {
      uploadStatus.textContent = 'Error: ' + err.message;
    }
  });

  card.querySelector(':scope > .crud-actions .save').addEventListener('click', async () => {
    const title = card.querySelector('.p-title').value.trim();
    if (!title) {
      status.textContent = 'El nombre es obligatorio.';
      return;
    }
    const sections = [...card.querySelectorAll('.section-editor')].map((sec) => ({
      title: sec.querySelector('.sec-title').value.trim(),
      text: sec.querySelector('.sec-text').value.trim(),
      cards: [...sec.querySelectorAll('.card-row')]
        .map((r) => ({ title: r.querySelector('.c-title').value.trim(), text: r.querySelector('.c-text').value.trim(), meta: r.querySelector('.c-meta').value.trim() }))
        .filter((c) => c.title || c.text),
      buttons: [...sec.querySelectorAll('.button-row')]
        .map((r) => ({ label: r.querySelector('.b-label').value.trim(), url: r.querySelector('.b-url').value.trim() }))
        .filter((b) => b.label),
    }));
    const category = card.querySelector('.p-category').value || null;
    const payload = {
      id,
      title,
      slug: card.querySelector('.p-slug').value.trim() || title,
      tagline: card.querySelector('.p-tagline').value.trim() || null,
      summary: card.querySelector('.p-summary').value.trim() || null,
      logo_url: logoField.value.trim() || null,
      show_on_home: card.querySelector('.p-home').checked,
      visible: card.querySelector('.p-visible').checked,
      sort_order: Number(card.querySelector('.p-order').value) || 0,
      category_id: category,
      upcoming_label: category ? card.querySelector('.p-upcoming').value.trim() || null : null,
      past_label: category ? card.querySelector('.p-past').value.trim() || null : null,
      sections,
    };
    status.textContent = 'Guardando…';
    const { data, error } = await db.save('projects', payload);
    if (error) {
      status.textContent = 'Error: ' + error.message;
      return;
    }
    openAfterReload = 'p-' + (id || data.id);
    loadProyectos();
  });

  card.querySelector(':scope > .crud-actions .delete')?.addEventListener('click', async () => {
    if (!confirm('¿Borrar este proyecto y su página?')) return;
    const { error } = await db.remove('projects', id);
    if (error) status.textContent = 'Error: ' + error.message;
    else loadProyectos();
  });
}

// ---------------------------------------------------------------------------
// Inscripción de una actividad: por WhatsApp (se genera el link wa.me) o por un link externo.
// Opcional: si no se completa, el sitio no muestra el botón "Inscríbete aquí".
// ---------------------------------------------------------------------------
let flashMessage = '';

function registrationBlockHtml(a) {
  const mode = a?.registration_whatsapp ? 'whatsapp' : a?.registration_url ? 'link' : 'none';
  const name = `reg-${a?.id || 'new'}`;
  const option = (value, label) =>
    `<label><input type="radio" name="${name}" value="${value}" ${mode === value ? 'checked' : ''}> ${label}</label>`;
  return `
    <div class="reg-block">
      <p class="reg-title">Inscripción <span>(opcional)</span></p>
      <div class="reg-options">
        ${option('none', 'Sin inscripción')}
        ${option('whatsapp', 'Por WhatsApp')}
        ${option('link', 'Por link')}
      </div>
      <div class="crud-row reg-field" data-for="whatsapp" ${mode === 'whatsapp' ? '' : 'hidden'}>
        <div>
          <label>Número de WhatsApp para inscribirse</label>
          <input type="text" class="f-reg-whatsapp" value="${esc(a?.registration_whatsapp)}" placeholder="+56 9 1234 5678">
          <p class="reg-preview"></p>
        </div>
      </div>
      <div class="crud-row reg-field" data-for="link" ${mode === 'link' ? '' : 'hidden'}>
        <div>
          <label>Link de inscripción (formulario, página, etc.)</label>
          <input type="text" class="f-reg-url" value="${esc(a?.registration_url)}" placeholder="https://...">
        </div>
      </div>
    </div>`;
}

function wireRegistration(card) {
  const block = card.querySelector('.reg-block');
  if (!block) return;
  const phone = block.querySelector('.f-reg-whatsapp');
  const preview = block.querySelector('.reg-preview');
  const update = () => {
    const mode = block.querySelector('input[type=radio]:checked')?.value || 'none';
    block.querySelectorAll('.reg-field').forEach((f) => (f.hidden = f.dataset.for !== mode));
    const digits = phone.value.replace(/\D/g, '');
    preview.innerHTML = digits
      ? `Link generado: <a href="https://wa.me/${digits}" target="_blank" rel="noopener">wa.me/${digits}</a>`
      : '';
  };
  block.addEventListener('change', update);
  phone.addEventListener('input', update);
  update();
}

function readRegistration(card) {
  const mode = card.querySelector('.reg-block input[type=radio]:checked')?.value || 'none';
  const phone = card.querySelector('.f-reg-whatsapp').value.trim();
  const url = card.querySelector('.f-reg-url').value.trim();
  if (mode === 'whatsapp') {
    if (phone.replace(/\D/g, '').length < 8) return { error: 'Revisa el número de WhatsApp (con código de país, ej. +56 9…).' };
    return { values: { registration_whatsapp: phone, registration_url: null } };
  }
  if (mode === 'link') {
    if (!/^https?:\/\/\S+$/i.test(url)) return { error: 'El link de inscripción debe empezar con https://' };
    return { values: { registration_whatsapp: null, registration_url: url } };
  }
  return { values: { registration_whatsapp: null, registration_url: null } };
}

// ---------------------------------------------------------------------------
// Tab: Para rezar hoy (automático desde opusdei.org; los títulos se pueden escribir a mano)
// ---------------------------------------------------------------------------
const PRAYER_LABELS = { gospel: 'Evangelio del día', meditation: 'Meditación del día', dailytext: 'Texto del día' };

async function loadRezar(prefetched) {
  const container = document.getElementById('tab-content');
  if (!prefetched) container.innerHTML = `<p class="loading-note">Consultando…</p>`;
  const { data, error } = prefetched ? { data: prefetched, error: null } : await attempt(api('prayer_admin'));
  if (error) {
    container.innerHTML = `<p class="loading-note">Error: ${esc(error.message)}</p>`;
    return;
  }
  const sourceLabel = (i) =>
    i.source === 'auto'
      ? '<span class="badge ok">Automático · leído de opusdei.org</span>'
      : i.source === 'manual'
      ? '<span class="badge manual">Escrito a mano</span>'
      : `<span class="badge warn">Título con la fecha · ${esc(i.detail || 'sin lectura todavía')}</span>`;

  container.innerHTML = `
    <p class="tab-note">Cada día el sitio lee de opusdei.org el título del Evangelio, la meditación y el texto del día, y cada título lleva a su página.
    Si opusdei.org no permite la lectura automática, se muestra un título con la fecha (el link sigue funcionando) y se vuelve a intentar cada 3 horas.
    Si quieres, puedes escribir aquí los títulos de hoy; al día siguiente vuelve a ser automático.</p>
    ${data.items
      .map(
        (i) => `
      <div class="crud-card" data-kind="${i.kind}">
        <p class="reg-title">${PRAYER_LABELS[i.kind]} · <a href="${esc(i.url)}" target="_blank" rel="noopener">abrir página</a></p>
        <p style="margin:0 0 8px;font-weight:600;">${esc(i.title)}</p>
        ${sourceLabel(i)}
        <div class="crud-row" style="margin-top:12px;">
          <div><label>Título escrito a mano para hoy (vacío = automático)</label>
          <input type="text" class="f-manual" value="${i.source === 'manual' ? esc(i.title) : ''}"></div>
        </div>
      </div>`
      )
      .join('')}
    <div class="crud-actions">
      <button class="save" id="prayer-save">Guardar títulos de hoy</button>
      <button class="delete" id="prayer-refresh" style="color:var(--color-primary);border-color:var(--color-border);">Volver a consultar opusdei.org</button>
      <span class="status" id="prayer-status"></span>
    </div>`;

  const status = document.getElementById('prayer-status');
  document.getElementById('prayer-save').addEventListener('click', async () => {
    const body = {};
    container.querySelectorAll('.crud-card[data-kind]').forEach((c) => (body[c.dataset.kind] = c.querySelector('.f-manual').value));
    status.textContent = 'Guardando…';
    const { data: res, error: err } = await attempt(api('prayer_override', { method: 'POST', body }));
    if (err) status.textContent = 'Error: ' + err.message;
    else loadRezar(res);
  });
  document.getElementById('prayer-refresh').addEventListener('click', async () => {
    status.textContent = 'Consultando opusdei.org…';
    const { data: res, error: err } = await attempt(api('prayer_refresh', { method: 'POST' }));
    if (err) status.textContent = 'Error: ' + err.message;
    else loadRezar(res);
  });
}

// ---------------------------------------------------------------------------
// Tab: Administradores (antes se gestionaban a mano en Supabase Auth)
// ---------------------------------------------------------------------------
async function loadAdmins() {
  const container = document.getElementById('tab-content');
  container.innerHTML = `<p class="loading-note">Cargando…</p>`;

  const { data, error } = await db.list('admins');
  if (error) {
    container.innerHTML = `<p class="loading-note">Error: ${esc(error.message)}</p>`;
    return;
  }

  const me = document.getElementById('who').textContent;
  container.innerHTML = `
    ${data
      .map(
        (a) => `
      <div class="crud-card" data-id="${a.id}">
        <div class="crud-actions">
          <strong>${esc(a.email)}</strong>
          ${a.email === me ? '<span class="status">(tú)</span>' : '<button class="delete">Quitar acceso</button><span class="status"></span>'}
        </div>
      </div>`
      )
      .join('')}
    <h3 style="font-size:0.9rem;margin:24px 0 10px;">Nuevo administrador</h3>
    <div class="crud-card" id="admin-new">
      <div class="crud-row">
        <div><label>Email</label><input type="text" class="f-email" autocomplete="off"></div>
        <div><label>Contraseña inicial (mín. 8 caracteres)</label><input type="password" class="f-password" autocomplete="new-password"></div>
      </div>
      <div class="crud-actions"><button class="save">Crear</button><span class="status"></span></div>
    </div>
    <h3 style="font-size:0.9rem;margin:24px 0 10px;">Cambiar mi contraseña</h3>
    <div class="crud-card" id="admin-password">
      <div class="crud-row">
        <div><label>Contraseña actual</label><input type="password" class="f-current" autocomplete="current-password"></div>
        <div><label>Nueva contraseña (mín. 8 caracteres)</label><input type="password" class="f-new" autocomplete="new-password"></div>
      </div>
      <div class="crud-actions"><button class="save">Cambiar</button><span class="status"></span></div>
    </div>`;

  container.querySelectorAll('.crud-card[data-id]').forEach((card) => {
    card.querySelector('.delete')?.addEventListener('click', async () => {
      if (!confirm('¿Quitarle el acceso al panel a este administrador?')) return;
      const { error } = await attempt(api('admin_delete', { method: 'POST', body: { id: card.dataset.id } }));
      if (error) card.querySelector('.status').textContent = 'Error: ' + error.message;
      else loadAdmins();
    });
  });

  const newCard = document.getElementById('admin-new');
  newCard.querySelector('.save').addEventListener('click', async () => {
    const status = newCard.querySelector('.status');
    status.textContent = 'Guardando…';
    const { error } = await attempt(
      api('admin_add', {
        method: 'POST',
        body: { email: newCard.querySelector('.f-email').value.trim(), password: newCard.querySelector('.f-password').value },
      })
    );
    if (error) status.textContent = 'Error: ' + error.message;
    else loadAdmins();
  });

  const pwCard = document.getElementById('admin-password');
  pwCard.querySelector('.save').addEventListener('click', async () => {
    const status = pwCard.querySelector('.status');
    status.textContent = 'Guardando…';
    const { error } = await attempt(
      api('password', {
        method: 'POST',
        body: { current: pwCard.querySelector('.f-current').value, new: pwCard.querySelector('.f-new').value },
      })
    );
    status.textContent = error ? 'Error: ' + error.message : 'Contraseña cambiada ✓';
    if (!error) pwCard.querySelectorAll('input').forEach((i) => (i.value = ''));
  });
}
