// poloniapp — panel admin (Fase 3a: login + contenido fijo)

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../assets/js/config.js';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const loginView = document.getElementById('login-view');
const adminView = document.getElementById('admin-view');
const loginError = document.getElementById('login-error');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
document.getElementById('login-btn').addEventListener('click', async () => {
  loginError.hidden = true;
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    loginError.textContent = error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos.' : error.message;
    loginError.hidden = false;
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await sb.auth.signOut();
});

sb.auth.onAuthStateChange((_event, session) => {
  if (session) {
    showAdmin(session);
  } else {
    loginView.hidden = false;
    adminView.hidden = true;
  }
});

async function showAdmin(session) {
  // Confirma que el usuario logueado está en la allowlist de admins (RLS igual lo bloquea
  // en escritura si no lo está, pero acá evitamos mostrarle el panel a alguien sin permiso).
  const { data: adminRow } = await sb.from('admins').select('email').eq('user_id', session.user.id).maybeSingle();
  if (!adminRow) {
    loginError.textContent = 'Tu cuenta no tiene permisos de administrador en Poloniapp.';
    loginError.hidden = false;
    await sb.auth.signOut();
    return;
  }
  loginView.hidden = true;
  adminView.hidden = false;
  document.getElementById('who').textContent = session.user.email;
  loadTab('contenido');
}

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
  if (tab === 'publicaciones') return loadPublicaciones();
  if (tab === 'textodiario') return loadTextoDiario();
  if (tab === 'inscripciones') return loadInscripciones();
  document.getElementById('tab-content').innerHTML = `<p class="coming-soon">Próximamente.</p>`;
}

// ---------------------------------------------------------------------------
// Storage — upload de imágenes (bucket público "site-images", solo admins escriben)
// Reutilizable desde cualquier tab (contenido fijo, actividades, publicaciones).
// ---------------------------------------------------------------------------
async function uploadImage(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from('site-images').upload(path, file, { cacheControl: '3600' });
  if (error) throw error;
  const { data } = sb.storage.from('site-images').getPublicUrl(path);
  return data.publicUrl;
}

// ---------------------------------------------------------------------------
// Tab: Contenido fijo
// ---------------------------------------------------------------------------
async function loadContenido() {
  const container = document.getElementById('tab-content');
  container.innerHTML = `<p class="loading-note">Cargando…</p>`;

  const { data, error } = await sb.from('site_content').select('*').order('section').order('key');
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
                     <img class="image-preview" src="${esc(r.value)}" ${r.value ? '' : 'hidden'}>
                     <input type="file" accept="image/*" class="image-input">
                     <span class="status upload-status"></span>
                   </div>`
                : ''
            }
            <textarea${isImage ? ' placeholder="o pegá una URL acá"' : ''}>${esc(r.value)}</textarea>
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
          preview.src = url;
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
      const {
        data: { user },
      } = await sb.auth.getUser();
      const { error } = await sb
        .from('site_content')
        .update({ value: textarea.value, updated_at: new Date().toISOString(), updated_by: user.id })
        .eq('key', key);
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

  const { data, error } = await sb.from('categories').select('*').order('sort_order');
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
      const { error } = await sb
        .from('categories')
        .update({
          name: card.querySelector('.f-name').value,
          description: card.querySelector('.f-desc').value || null,
          sort_order: Number(card.querySelector('.f-sort').value) || 0,
          bucket: card.querySelector('.f-bucket').value || null,
          visible: card.querySelector('.f-visible').checked,
        })
        .eq('id', id);
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

  const { data, error } = await sb.from('locations').select('*').order('name');
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
      const { error } = id
        ? await sb.from('locations').update({ name, address }).eq('id', id)
        : await sb.from('locations').insert({ name, address });
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
      const { error } = await sb.from('locations').delete().eq('id', id);
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
        <div><label>Expositor</label><input type="text" class="s-speaker" value="${esc(s?.speaker)}"></div>
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
    sb.from('activities').select('*, sessions(*)').order('title'),
    sb.from('categories').select('id,name').order('sort_order'),
    sb.from('locations').select('id,name').order('name'),
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

  function previewSrc(photoUrl) {
    if (!photoUrl) return '';
    return /^https?:\/\//.test(photoUrl) ? photoUrl : '../' + photoUrl;
  }

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
            <input type="text" class="f-photo" value="${esc(a?.photo_url)}" placeholder="o pegá un path/URL (ej. assets/activities/foto.jpg)">
          </div>
        </div>
        <div class="crud-row">
          <div><label>Contacto — nombre (opcional, si no usa el WhatsApp general)</label><input type="text" class="f-contact-name" value="${esc(a?.contact_name)}"></div>
          <div><label>Contacto — teléfono</label><input type="text" class="f-contact-phone" value="${esc(a?.contact_phone)}" placeholder="+569..."></div>
        </div>
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

  container.innerHTML =
    activities.map(activityCardHtml).join('') + `<h3 style="font-size:0.9rem;margin:24px 0 10px;">Nueva actividad</h3>` + activityCardHtml(null);

  wireActivityCards(container, { locOptions });
}

function wireSessionRow(row, sb_, locOptions) {
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
    const { error } = id ? await sb.from('sessions').update(payload).eq('id', id) : await sb.from('sessions').insert(payload);
    saveBtn.disabled = false;
    if (error) {
      status.textContent = 'Error: ' + error.message;
    } else {
      loadActividades();
    }
  });

  deleteBtn?.addEventListener('click', async () => {
    if (!confirm('¿Borrar esta sesión?')) return;
    const { error } = await sb.from('sessions').delete().eq('id', id);
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
    const status = card.querySelector('.status');

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
          preview.src = url;
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
      saveBtn.disabled = true;
      status.textContent = 'Guardando…';
      const { error } = id ? await sb.from('activities').update(payload).eq('id', id) : await sb.from('activities').insert(payload);
      saveBtn.disabled = false;
      if (error) {
        status.textContent = 'Error: ' + error.message;
      } else {
        loadActividades();
      }
    });

    deleteBtn?.addEventListener('click', async () => {
      if (!confirm('¿Borrar esta actividad y todas sus sesiones?')) return;
      const { error } = await sb.from('activities').delete().eq('id', id);
      if (error) {
        status.textContent = 'Error: ' + error.message;
      } else {
        loadActividades();
      }
    });

    card.querySelectorAll('.session-crud-row').forEach((row) => wireSessionRow(row, sb, locOptions));

    card.querySelector('.add-session')?.addEventListener('click', () => {
      const list = card.querySelector('.sessions-list');
      const wrapper = document.createElement('div');
      wrapper.innerHTML = sessionRowHtml(null, id, locOptions);
      const row = wrapper.firstElementChild;
      list.appendChild(row);
      wireSessionRow(row, sb, locOptions);
    });
  });
}

// ---------------------------------------------------------------------------
// Tab: Publicaciones (CRUD — el scraper de la Fase 5 también va a escribir acá)
// ---------------------------------------------------------------------------
function postCardHtml(p) {
  return `
    <div class="crud-card" data-id="${p?.id || ''}">
      <div class="crud-row">
        <div><label>Título</label><input type="text" class="f-title" value="${esc(p?.title)}"></div>
        <div style="flex:0 0 150px;"><label>Publicado</label><input type="date" class="f-published" value="${p?.published_at || ''}"></div>
        <div class="crud-check"><label><input type="checkbox" class="f-visible" ${!p || p.visible ? 'checked' : ''}> visible</label></div>
      </div>
      <div class="crud-row">
        <div><label>URL externa (opusdei.org)</label><input type="text" class="f-url" value="${esc(p?.external_url)}" placeholder="https://opusdei.org/..."></div>
      </div>
      <div class="crud-row">
        <div>
          <label>Foto</label>
          <div class="image-field">
            <img class="image-preview" src="${esc(p?.image_url && /^https?:\/\//.test(p.image_url) ? p.image_url : p?.image_url ? '../' + p.image_url : '')}" ${p?.image_url ? '' : 'hidden'}>
            <input type="file" accept="image/*" class="image-input">
            <span class="status upload-status"></span>
          </div>
          <input type="text" class="f-image" value="${esc(p?.image_url)}" placeholder="o pegá un path/URL">
        </div>
      </div>
      <div class="crud-actions">
        <button class="save">${p ? 'Guardar' : 'Crear publicación'}</button>
        ${p ? `<button class="delete">Borrar</button>` : ''}
        <span class="status"></span>
      </div>
    </div>`;
}

async function loadPublicaciones() {
  const container = document.getElementById('tab-content');
  container.innerHTML = `<p class="loading-note">Cargando…</p>`;

  const { data, error } = await sb.from('posts').select('*').order('published_at', { ascending: false });
  if (error) {
    container.innerHTML = `<p class="loading-note">Error: ${esc(error.message)}</p>`;
    return;
  }

  container.innerHTML =
    data.map(postCardHtml).join('') + `<h3 style="font-size:0.9rem;margin:24px 0 10px;">Nueva publicación</h3>` + postCardHtml(null);

  container.querySelectorAll('.crud-card').forEach((card) => {
    const id = card.dataset.id;
    const saveBtn = card.querySelector('.save');
    const deleteBtn = card.querySelector('.delete');
    const status = card.querySelector('.status');
    const imageField = card.querySelector('.f-image');

    const fileInput = card.querySelector('.image-input');
    if (fileInput) {
      const preview = card.querySelector('.image-preview');
      const uploadStatus = card.querySelector('.upload-status');
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        uploadStatus.textContent = 'Subiendo…';
        try {
          const url = await uploadImage(file);
          imageField.value = url;
          preview.src = url;
          preview.hidden = false;
          uploadStatus.textContent = 'Subida ✓ — falta Guardar';
        } catch (err) {
          uploadStatus.textContent = 'Error: ' + err.message;
        }
      });
    }

    saveBtn.addEventListener('click', async () => {
      const title = card.querySelector('.f-title').value.trim();
      const externalUrl = card.querySelector('.f-url').value.trim();
      if (!title || !externalUrl) {
        status.textContent = 'Título y URL externa son obligatorios.';
        return;
      }
      const payload = {
        title,
        external_url: externalUrl,
        published_at: card.querySelector('.f-published').value || null,
        image_url: imageField.value.trim() || null,
        visible: card.querySelector('.f-visible').checked,
      };
      saveBtn.disabled = true;
      status.textContent = 'Guardando…';
      const { error } = id ? await sb.from('posts').update(payload).eq('id', id) : await sb.from('posts').insert(payload);
      saveBtn.disabled = false;
      if (error) {
        status.textContent = 'Error: ' + error.message;
      } else {
        loadPublicaciones();
      }
    });

    deleteBtn?.addEventListener('click', async () => {
      if (!confirm('¿Borrar esta publicación?')) return;
      const { error } = await sb.from('posts').delete().eq('id', id);
      if (error) {
        status.textContent = 'Error: ' + error.message;
      } else {
        loadPublicaciones();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Tab: Texto diario (carga manual — opusdei.org bloquea scraping con Cloudflare,
// ver DECISIONS.md. Mismo patrón que Publicaciones: alguien pega el texto del día a mano.)
// ---------------------------------------------------------------------------
function dailyTextCardHtml(d) {
  return `
    <div class="crud-card" data-id="${d?.id || ''}">
      <div class="crud-row">
        <div style="flex:0 0 150px;"><label>Fecha</label><input type="date" class="f-date" value="${d?.date || ''}"></div>
        <div><label>Título</label><input type="text" class="f-title" value="${esc(d?.title)}"></div>
      </div>
      <div class="crud-row">
        <div><label>Excerpt</label><textarea class="f-excerpt">${esc(d?.excerpt)}</textarea></div>
      </div>
      <div class="crud-row">
        <div><label>URL en opusdei.org</label><input type="text" class="f-url" value="${esc(d?.external_url)}" placeholder="https://opusdei.org/es-cl/dailytext/..."></div>
      </div>
      <div class="crud-actions">
        <button class="save">${d ? 'Guardar' : 'Cargar texto del día'}</button>
        ${d ? `<button class="delete">Borrar</button>` : ''}
        <span class="status"></span>
      </div>
    </div>`;
}

async function loadTextoDiario() {
  const container = document.getElementById('tab-content');
  container.innerHTML = `<p class="loading-note">Cargando…</p>`;

  const { data, error } = await sb.from('daily_texts').select('*').order('date', { ascending: false });
  if (error) {
    container.innerHTML = `<p class="loading-note">Error: ${esc(error.message)}</p>`;
    return;
  }

  container.innerHTML =
    `<p class="loading-note" style="margin-bottom:16px;">opusdei.org bloquea el scraping automático (Cloudflare) — el texto del día se carga a mano acá, tarda 1 minuto: copiás título, extracto y link desde <a href="https://opusdei.org/es-cl/dailytext" target="_blank" rel="noopener">opusdei.org/es-cl/dailytext</a>.</p>` +
    data.map(dailyTextCardHtml).join('') +
    `<h3 style="font-size:0.9rem;margin:24px 0 10px;">Cargar texto de hoy</h3>` +
    dailyTextCardHtml(null);

  container.querySelectorAll('.crud-card').forEach((card) => {
    const id = card.dataset.id;
    const saveBtn = card.querySelector('.save');
    const deleteBtn = card.querySelector('.delete');
    const status = card.querySelector('.status');

    saveBtn.addEventListener('click', async () => {
      const date = card.querySelector('.f-date').value;
      const title = card.querySelector('.f-title').value.trim();
      const excerpt = card.querySelector('.f-excerpt').value.trim();
      const externalUrl = card.querySelector('.f-url').value.trim();
      if (!date || !title || !excerpt || !externalUrl) {
        status.textContent = 'Todos los campos son obligatorios.';
        return;
      }
      saveBtn.disabled = true;
      status.textContent = 'Guardando…';
      const payload = { date, title, excerpt, external_url: externalUrl, scraped_at: new Date().toISOString() };
      const { error } = id
        ? await sb.from('daily_texts').update(payload).eq('id', id)
        : await sb.from('daily_texts').insert(payload);
      saveBtn.disabled = false;
      if (error) {
        status.textContent = 'Error: ' + error.message;
      } else {
        loadTextoDiario();
      }
    });

    deleteBtn?.addEventListener('click', async () => {
      if (!confirm('¿Borrar este texto diario?')) return;
      const { error } = await sb.from('daily_texts').delete().eq('id', id);
      if (error) {
        status.textContent = 'Error: ' + error.message;
      } else {
        loadTextoDiario();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Tab: Inscripciones (solo lectura — quién se anotó a qué sesión)
// ---------------------------------------------------------------------------
async function loadInscripciones() {
  const container = document.getElementById('tab-content');
  container.innerHTML = `<p class="loading-note">Cargando…</p>`;

  const { data, error } = await sb
    .from('registrations')
    .select('*, sessions(date, weekday, time_start, activities(title))')
    .order('created_at', { ascending: false });
  if (error) {
    container.innerHTML = `<p class="loading-note">Error: ${esc(error.message)}</p>`;
    return;
  }

  if (!data.length) {
    container.innerHTML = `<p class="loading-note">Todavía no hay inscripciones — van a aparecer acá cuando alguien se inscriba desde el sitio (Fase 4, pendiente de construir).</p>`;
    return;
  }

  container.innerHTML = `
    <table class="data-table">
      <tr><th>Fecha</th><th>Nombre</th><th>Email</th><th>Teléfono</th><th>Actividad</th><th>Sesión</th></tr>
      ${data
        .map((r) => {
          const s = r.sessions;
          const when = s ? s.date || s.weekday || '' : '';
          return `
        <tr>
          <td>${esc(new Date(r.created_at).toLocaleDateString('es-CL'))}</td>
          <td>${esc(r.name)}</td>
          <td>${esc(r.email)}</td>
          <td>${esc(r.phone)}</td>
          <td>${esc(s?.activities?.title)}</td>
          <td>${esc(when)}</td>
        </tr>`;
        })
        .join('')}
    </table>`;
}
