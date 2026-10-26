// poloniapp — app instalable (PWA) + notificaciones push.
//
// Banner de la Home, solo en celulares:
//   · Android/iOS en el navegador → "Descarga la aplicación y activa las notificaciones".
//     Android: abre el diálogo de instalación del navegador (si lo ofrece) y luego pide permiso
//     de notificaciones. iOS no permite instalar desde un botón: se muestran los 2 pasos de Safari.
//   · Dentro de la app instalada → solo "Activa las notificaciones" si todavía no se decidió.
//   · Computador, app ya instalada (Android) o notificaciones ya decididas → no se muestra.

import { api } from './api.js';

const ROOT = new URL('../../', import.meta.url);
const MARK = new URL('assets/img/favicon.svg', ROOT).href;
const DISMISS_DAYS = 14;

const ua = navigator.userAgent;
const platform = /android/i.test(ua)
  ? 'android'
  : /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  ? 'ios'
  : 'other';

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    return null; // modo privado / almacenamiento bloqueado: el banner igual funciona
  }
}

// ---------------------------------------------------------------------------
// Service worker (necesario para instalar la app y recibir notificaciones)
// ---------------------------------------------------------------------------
let swReady = null;
if ('serviceWorker' in navigator) {
  swReady = navigator.serviceWorker
    .register(new URL('sw.js', ROOT).pathname, { scope: ROOT.pathname })
    .then(() => navigator.serviceWorker.ready)
    .catch((err) => console.warn('[poloniapp] service worker:', err));
}

let deferredPrompt = null;
let installedApp = store('pwa_installed') === '1';

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // se muestra con nuestro botón, no con la barra automática del navegador
  deferredPrompt = e;
  refresh();
});
window.addEventListener('appinstalled', () => {
  installedApp = true;
  store('pwa_installed', '1');
  deferredPrompt = null;
  refresh();
});
// Chrome en Android puede decir si la app ya está instalada en el teléfono.
if (platform === 'android' && navigator.getInstalledRelatedApps) {
  navigator
    .getInstalledRelatedApps()
    .then((apps) => {
      if (apps.length) {
        installedApp = true;
        refresh();
      }
    })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// Notificaciones
// ---------------------------------------------------------------------------
function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function ensureSubscription() {
  const reg = await swReady;
  if (!reg) throw new Error('Sin service worker');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { key } = await api('push_key');
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
  }
  await api('subscribe', { method: 'POST', body: sub.toJSON() });
}

async function enableNotifications() {
  if (!pushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;
  await ensureSubscription();
  return 'granted';
}

// Si ya dio permiso antes, se re-confirma la suscripción en silencio (el servidor la mantiene al día).
if (pushSupported() && Notification.permission === 'granted') {
  ensureSubscription().catch((err) => console.warn('[poloniapp] push:', err));
}

export function toast(message) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

async function notifyFlow() {
  try {
    const result = await enableNotifications();
    if (result === 'granted') toast('Listo: te avisaremos cuando haya actividades nuevas.');
    else if (result === 'denied') toast('Las notificaciones quedaron bloqueadas. Puedes activarlas en los ajustes del teléfono.');
    else if (result === 'unsupported') toast('Este navegador no permite notificaciones.');
  } catch (err) {
    console.warn('[poloniapp] push:', err);
    toast('No se pudieron activar las notificaciones. Intenta de nuevo más tarde.');
  }
  refresh();
}

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------
let slot = null;

export function renderAppBanner(el) {
  slot = el;
  refresh();
}

function bannerMode() {
  if (platform === 'other') return null;
  if (Number(store('pwa_banner_dismissed') || 0) > Date.now()) return null;
  if (isStandalone()) {
    return pushSupported() && Notification.permission === 'default' ? 'notify' : null;
  }
  if (platform === 'android' && installedApp) return null;
  return 'install';
}

function refresh() {
  if (!slot || !slot.isConnected) return;
  const mode = bannerMode();
  if (!mode) {
    slot.innerHTML = '';
    return;
  }
  const sub =
    mode === 'install'
      ? 'Descarga la aplicación y activa las notificaciones.'
      : 'Activa las notificaciones y te avisamos cuando haya una actividad nueva.';
  slot.innerHTML = `
    <aside class="app-banner" aria-label="Aplicación Poloniapp">
      <button type="button" class="close" aria-label="Cerrar">×</button>
      <div class="icon"><img src="${MARK}" alt=""></div>
      <p class="title">No te pierdas nada de Polonia</p>
      <p class="sub">${sub}</p>
      <div class="actions">
        <button type="button" class="btn" data-action="${mode}">${mode === 'install' ? 'Descargar la app' : 'Activar notificaciones'}</button>
      </div>
    </aside>`;
  slot.querySelector('.close').addEventListener('click', () => {
    store('pwa_banner_dismissed', String(Date.now() + DISMISS_DAYS * 86400000));
    refresh();
  });
  slot.querySelector('[data-action]').addEventListener('click', () => (mode === 'install' ? installFlow() : notifyFlow()));
}

async function installFlow() {
  if (platform === 'android' && deferredPrompt) {
    const prompt = deferredPrompt;
    deferredPrompt = null;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      installedApp = true;
      store('pwa_installed', '1');
      if (pushSupported() && Notification.permission === 'default') await notifyFlow();
    }
    refresh();
    return;
  }
  showInstructions();
}

const SHARE_ICON =
  '<svg class="share-icon" viewBox="0 0 24 24" fill="none" stroke="#2f7cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';

function showInstructions() {
  const steps =
    platform === 'ios'
      ? [
          `Toca el botón <strong>Compartir</strong> ${SHARE_ICON} en la barra de Safari.`,
          'Elige <strong>Agregar a inicio</strong> y confirma con <strong>Agregar</strong>.',
          'Abre <strong>Poloniapp</strong> desde tu pantalla de inicio y toca <strong>Activar notificaciones</strong>.',
        ]
      : [
          'Toca el menú <strong>⋮</strong> del navegador (arriba a la derecha).',
          'Elige <strong>Instalar aplicación</strong> o <strong>Agregar a la pantalla principal</strong>.',
          'Abre <strong>Poloniapp</strong> desde tu pantalla de inicio.',
        ];
  const canNotifyHere = platform === 'android' && pushSupported() && Notification.permission === 'default';
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <h3 id="sheet-title">Instala Poloniapp en tu teléfono</h3>
      <ol>${steps.map((s) => `<li>${s}</li>`).join('')}</ol>
      ${canNotifyHere ? '<button type="button" class="btn block" data-notify>Activar notificaciones</button>' : ''}
      <button type="button" class="btn ghost block" data-close style="margin-top:10px;">Entendido</button>
    </div>`;
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => e.target === backdrop && close());
  backdrop.querySelector('[data-close]').addEventListener('click', close);
  backdrop.querySelector('[data-notify]')?.addEventListener('click', () => {
    close();
    notifyFlow();
  });
  document.body.appendChild(backdrop);
}
