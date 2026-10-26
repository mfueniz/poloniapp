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
  if (tab === 'categorias') return loadCategorias();
  if (tab === 'ubicaciones') return loadUbicaciones();
  if (tab === 'actividades') return loadActividades();
  if (tab === 'rezar') return loadRezar();
  if (tab === 'admins') return loadAdmins();
  document.getElementById('tab-content').innerHTML = `<p class="coming-soon">Próximamente.</p>`;
}

// ---------------------------------------------------------------------------
// Upload de imágenes a docs/uploads/ en el mismo hosting (solo admins).
// Reutilizable desde cualquier tab (contenido fijo, actividades, publicaciones).
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
// Tab: Categorías (editar las 9 existentes — crear una nueva no es prioritario, ver DECISIONS.md)
// ---------------------------------------------------------------------------
async function loadCategorias() {
  const container = document.getElementById('tab-content');
  container.innerHTML = `<p class="loading-note">Cargando…</p>`;

  const { data, error } = await db.list('categories');
  if (error) {
    container.innerHTML = `<p class="loading-note">Error: ${esc(error.message)}</p>`;
    return;
  }

  container.innerHTML = data
    .map(
      (c) => `
    <div class="crud-card" data-id="${c.id}">
      <div class="crud-row">
        <div><label>Nombre</label><input type="text" class="f-name" value="${esc(c.name)}"></div>
        <div style="flex:0 0 90px;"><label>Orden</label><input type="number" class="f-sort" value="${c.sort_order}"></div>
        <div style="flex:0 0 130px;"><label>Bucket</label>
          <select class="f-bucket">
            <option value="" ${!c.bucket ? 'selected' : ''}>(ninguno)</option>
            <option value="formacion" ${c.bucket === 'formacion' ? 'selected' : ''}>formación</option>
            <option value="laboral" ${c.bucket === 'laboral' ? 'selected' : ''}>laboral</option>
            <option value="familia" ${c.bucket === 'familia' ? 'selected' : ''}>familia</option>
          </select>
        </div>
        <div class="crud-check"><label><input type="checkbox" class="f-visible" ${c.visible ? 'checked' : ''}> visible</label></div>
      </div>
      <div class="crud-row">
        <div><label>Descripción</label><textarea class="f-desc" placeholder="(sin descripción propia todavía)">${esc(c.description)}</textarea></div>
      </div>
      <div class="crud-actions">
        <button class="save">Guardar</button>
        <span class="status"></span>
      </div>
    </div>`
    )
    .join('');

  container.querySelectorAll('.crud-card').forEach((card) => {
    const id = card.dataset.id;
    const saveBtn = card.querySelector('.save');
    const status = card.querySelector('.status');
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      status.textContent = 'Guardando…';
      const { error } = await db.save('categories', {
          id,
          name: card.querySelector('.f-name').value,
          description: card.querySelector('.f-desc').value || null,
          sort_order: Number(card.querySelector('.f-sort').value) || 0,
          bucket: card.querySelector('.f-bucket').value || null,
          visible: card.querySelector('.f-visible').checked,
        });
      saveBtn.disabled = false;
      status.textContent = error ? 'Error: ' + error.message : 'Guardado ✓';
    });
  });
}

// ---------------------------------------------------------------------------
// Tab: Ubicaciones (CRUD simple)
// ---------------------------------------------------------------------------
function locationCardHtml(l) {
  return `
    <div class="crud-card" data-id="${l?.id || ''}">
      <div class="crud-row">
        <div><label>Nombre público</label><input type="text" class="f-name" value="${esc(l?.name)}" placeholder="ej. Las Condes"></div>
        <div><label>Dirección real (nunca pública)</label><input type="text" class="f-address" value="${esc(l?.address)}" placeholder="ej. Polonia 306, Las Condes"></div>
      </div>
      <div class="crud-actions">
        <button class="save">${l ? 'Guardar' : 'Crear'}</button>
        ${l ? `<button class="delete">Borrar</button>` : ''}
        <span class="status"></span>
      </div>
    </div>`;
}

async function loadUbicaciones() {
  const container = document.getElementById('tab-content');
  container.innerHTML = `<p class="loading-note">Cargando…</p>`;

  const { data, error } = await db.list('locations');
  if (error) {
    container.innerHTML = `<p class="loading-note">Error: ${esc(error.message)}</p>`;
    return;
  }

  container.innerHTML = data.map(locationCardHtml).join('') + `<h3 style="font-size:0.9rem;margin:24px 0 10px;">Nueva ubicación</h3>` + locationCardHtml(null);

  wireLocationCards(container);
}

function wireLocationCards(container) {
  container.querySelectorAll('.crud-card').forEach((card) => {
    const id = card.dataset.id;
    const saveBtn = card.querySelector('.save');
    const deleteBtn = card.querySelector('.delete');
    const status = card.querySelector('.status');

    saveBtn.addEventListener('click', async () => {
      const name = card.querySelector('.f-name').value.trim();
      const address = card.querySelector('.f-address').value.trim();
      if (!name || !address) {
        status.textContent = 'Nombre y dirección son obligatorios.';
        return;
      }
      saveBtn.disabled = true;
      status.textContent = 'Guardando…';
      const { error } = await db.save('locations', { id, name, address });
      saveBtn.disabled = false;
      if (error) {
        status.textContent = 'Error: ' + error.message;
      } else {
        status.textContent = 'Guardado ✓';
        if (!id) loadUbicaciones(); // recarga para que la nueva pase a la lista y limpie el form
      }
    });

    deleteBtn?.addEventListener('click', async () => {
      if (!confirm('¿Borrar esta ubicación? Las sesiones que la usan quedan sin ubicación.')) return;
      const { error } = await db.remove('locations', id);
      if (error) {
        status.textContent = 'Error: ' + error.message;
      } else {
        loadUbicaciones();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Tab: Actividades (CRUD + sesiones anidadas)
// ---------------------------------------------------------------------------
function sessionRowHtml(s, activityId, locOptions) {
  return `
    <div class="session-crud-row" data-id="${s?.id || ''}" data-activity="${activityId}">
      <div class="crud-row">
        <div><label>Fecha (o vacío si es recurrente)</label><input type="date" class="s-date" value="${s?.date || ''}"></div>
        <div><label>Día recurrente (ej. Lunes)</label><input type="text" class="s-weekday" value="${esc(s?.weekday)}"></div>
        <div style="flex:0 0 100px;"><label>Hora inicio</label><input type="time" class="s-start" value="${s?.time_start?.slice(0, 5) || ''}"></div>
        <div style="flex:0 0 100px;"><label>Hora fin</label><input type="time" class="s-end" value="${s?.time_end?.slice(0, 5) || ''}"></div>
      </div>
      <div class="crud-row">
        <div><label>Tema</label><input type="text" class="s-topic" value="${esc(s?.topic)}"></div>
        <div><label>Expositor / responsable</label><input type="text" class="s-speaker" value="${esc(s?.speaker)}"></div>
        <div style="flex:0 0 140px;"><label>Precio</label><input type="text" class="s-price" value="${esc(s?.price)}" placeholder="ej. $10.000"></div>
        <div style="flex:0 0 160px;"><label>Ubicación</label><select class="s-location">${locOptions(s)}</select></div>
      </div>
      <div class="crud-actions">
        <button class="save">${s ? 'Guardar sesión' : 'Agregar sesión'}</button>
        ${s ? `<button class="delete">Borrar</button>` : ''}
        <span class="status"></span>
      </div>
    </div>`;
}

async function loadActividades() {
  const container = document.getElementById('tab-content');
  container.innerHTML = `<p class="loading-note">Cargando…</p>`;

  const [{ data: activities, error: e1 }, { data: categories, error: e2 }, { data: locations, error: e3 }] = await Promise.all([
    db.list('activities'),
    db.list('categories'),
    db.list('locations'),
  ]);
  const err = e1 || e2 || e3;
  if (err) {
    container.innerHTML = `<p class="loading-note">Error: ${esc(err.message)}</p>`;
    return;
  }

  const catOptions = (selectedId) =>
    categories.map((c) => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const locOptions = (s) =>
    `<option value="">(sin ubicación)</option>` +
    locations.map((l) => `<option value="${l.id}" ${l.id === s?.location_id ? 'selected' : ''}>${esc(l.name)}</option>`).join('');

  function activityCardHtml(a) {
    const sessions = a ? a.sessions || [] : [];
    return `
      <div class="crud-card" data-id="${a?.id || ''}">
        <div class="crud-row">
          <div><label>Título</label><input type="text" class="f-title" value="${esc(a?.title)}"></div>
          <div style="flex:0 0 160px;"><label>Categoría</label><select class="f-category">${catOptions(a?.category_id)}</select></div>
          <div style="flex:0 0 110px;"><label>Formato</label>
            <select class="f-format">
              <option value="single" ${!a || a.format === 'single' ? 'selected' : ''}>única</option>
              <option value="series" ${a?.format === 'series' ? 'selected' : ''}>serie</option>
            </select>
          </div>
          <div class="crud-check"><label><input type="checkbox" class="f-visible" ${!a || a.visible ? 'checked' : ''}> visible</label></div>
        </div>
        <div class="crud-row">
          <div><label>Descripción</label><textarea class="f-desc">${esc(a?.description)}</textarea></div>
        </div>
        <div class="crud-row">
          <div>
            <label>Foto</label>
            <div class="image-field">
              <img class="image-preview" src="${esc(previewSrc(a?.photo_url))}" ${a?.photo_url ? '' : 'hidden'}>
              <input type="file" accept="image/*" class="image-input">
              <span class="status upload-status"></span>
            </div>
            <input type="text" class="f-photo" value="${esc(a?.photo_url)}" placeholder="o pega una ruta/URL (ej. assets/activities/foto.jpg)">
          </div>
        </div>
        <div class="crud-row">
          <div><label>Contacto para el botón de WhatsApp — nombre (opcional; si no, se usa el número general)</label><input type="text" class="f-contact-name" value="${esc(a?.contact_name)}"></div>
          <div><label>Contacto — teléfono</label><input type="text" class="f-contact-phone" value="${esc(a?.contact_phone)}" placeholder="+569..."></div>
        </div>
        ${registrationBlockHtml(a)}
        <div class="crud-actions">
          <button class="save">${a ? 'Guardar' : 'Crear actividad'}</button>
          ${a ? `<button class="delete">Borrar</button>` : ''}
          <span class="status"></span>
        </div>
        ${
          a
            ? `<div class="sessions-block">
                 <h4>Sesiones (${sessions.length})</h4>
                 <div class="sessions-list">${sessions.map((s) => sessionRowHtml(s, a.id, locOptions)).join('')}</div>
                 <button class="add-btn add-session">+ agregar sesión</button>
               </div>`
            : ''
        }
      </div>`;
  }

  const { data: stats } = await attempt(api('stats'));
  container.innerHTML =
    (flashMessage ? `<p class="flash">${esc(flashMessage)}</p>` : '') +
    `<p class="tab-note">Al crear una actividad visible se envía una notificación a ${
      stats ? `los <strong>${stats.subscribers}</strong> dispositivos` : 'los dispositivos'
    } que activaron las notificaciones de Poloniapp.</p>` +
    activities.map(activityCardHtml).join('') +
    `<h3 style="font-size:0.9rem;margin:24px 0 10px;">Nueva actividad</h3>` +
    activityCardHtml(null);
  flashMessage = '';

  wireActivityCards(container, { locOptions });
}

function wireSessionRow(row, locOptions) {
  const id = row.dataset.id;
  const activityId = row.dataset.activity;
  const saveBtn = row.querySelector('.save');
  const deleteBtn = row.querySelector('.delete');
  const status = row.querySelector('.status');

  saveBtn.addEventListener('click', async () => {
    const date = row.querySelector('.s-date').value || null;
    const weekday = row.querySelector('.s-weekday').value.trim() || null;
    if (!date && !weekday) {
      status.textContent = 'Necesita fecha o día recurrente.';
      return;
    }
    const payload = {
      activity_id: activityId,
      date,
      weekday,
      time_start: row.querySelector('.s-start').value || null,
      time_end: row.querySelector('.s-end').value || null,
      topic: row.querySelector('.s-topic').value.trim() || null,
      speaker: row.querySelector('.s-speaker').value.trim() || null,
      price: row.querySelector('.s-price').value.trim() || null,
      location_id: row.querySelector('.s-location').value || null,
    };
    saveBtn.disabled = true;
    status.textContent = 'Guardando…';
    const { error } = await db.save('sessions', { id, ...payload });
    saveBtn.disabled = false;
    if (error) {
      status.textContent = 'Error: ' + error.message;
    } else {
      loadActividades();
    }
  });

  deleteBtn?.addEventListener('click', async () => {
    if (!confirm('¿Borrar esta sesión?')) return;
    const { error } = await db.remove('sessions', id);
    if (error) {
      status.textContent = 'Error: ' + error.message;
    } else {
      loadActividades();
    }
  });
}

function wireActivityCards(container, { locOptions }) {
  container.querySelectorAll('.crud-card').forEach((card) => {
    const id = card.dataset.id;
    const saveBtn = card.querySelector('.save');
    const deleteBtn = card.querySelector('.delete');
    const status = card.querySelector('.crud-actions .status');

    const fileInput = card.querySelector('.image-input');
    const photoField = card.querySelector('.f-photo');
    if (fileInput) {
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
    }

    saveBtn.addEventListener('click', async () => {
      const title = card.querySelector('.f-title').value.trim();
      if (!title) {
        status.textContent = 'El título es obligatorio.';
        return;
      }
      const payload = {
        title,
        category_id: card.querySelector('.f-category').value,
        format: card.querySelector('.f-format').value,
        visible: card.querySelector('.f-visible').checked,
        description: card.querySelector('.f-desc').value.trim() || null,
        photo_url: photoField.value.trim() || null,
        contact_name: card.querySelector('.f-contact-name').value.trim() || null,
        contact_phone: card.querySelector('.f-contact-phone').value.trim() || null,
      };
      const registration = readRegistration(card);
      if (registration.error) {
        status.textContent = registration.error;
        return;
      }
      Object.assign(payload, registration.values);
      saveBtn.disabled = true;
      status.textContent = 'Guardando…';
      const { data, error } = await db.save('activities', { id, ...payload });
      saveBtn.disabled = false;
      if (error) {
        status.textContent = 'Error: ' + error.message;
      } else {
        if (!id) {
          flashMessage = data?.notified
            ? `Actividad creada. Se envió una notificación a ${data.notified} dispositivo${data.notified > 1 ? 's' : ''}.`
            : 'Actividad creada.';
        }
        loadActividades();
      }
    });

    deleteBtn?.addEventListener('click', async () => {
      if (!confirm('¿Borrar esta actividad y todas sus sesiones?')) return;
      const { error } = await db.remove('activities', id);
      if (error) {
        status.textContent = 'Error: ' + error.message;
      } else {
        loadActividades();
      }
    });

    card.querySelectorAll('.session-crud-row').forEach((row) => wireSessionRow(row, locOptions));
    wireRegistration(card);

    card.querySelector('.add-session')?.addEventListener('click', () => {
      const list = card.querySelector('.sessions-list');
      const wrapper = document.createElement('div');
      wrapper.innerHTML = sessionRowHtml(null, id, locOptions);
      const row = wrapper.firstElementChild;
      list.appendChild(row);
      wireSessionRow(row, locOptions);
    });
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
