// =============================================================================
// APP.JS — Apex Fury ESP32 Gateway UI
// All JavaScript in one file for embedded device deployment.
// Sections: Loader · State · Utils · Navigation · API · Network ·
//           MQTT · Modbus · I/O · Data Logging · Firmware · Access Control
// =============================================================================

// =============================================================================
// SECTION 1 — LOADER
// showLoader(label) / hideLoader() — global loading overlay functions
// =============================================================================

// LOADER.JS — Global loader overlay functions

/**
 * Display the full-screen loading overlay with spinner.
 * @param {string} [label] - Optional label text shown below the spinner.
 */
function showLoader(label) {
  const overlay = document.getElementById('loader-overlay');
  if (!overlay) return;
  const labelEl = overlay.querySelector('.loader-label');
  if (labelEl) labelEl.textContent = label || 'Loading…';
  overlay.classList.add('active');
}

/**
 * Hide the full-screen loading overlay.
 */
function hideLoader() {
  const overlay = document.getElementById('loader-overlay');
  if (overlay) overlay.classList.remove('active');
}

// =============================================================================
// SECTION 2 — GLOBAL STATE & UTILITIES
// Single source of truth for all pages + shared DOM helpers
// =============================================================================

// This file must be loaded first (before all other JS files).

// ── Global Application State ─────────────────────────────────────────────────

const state = {
  activeMenu: 'Dashboard',
  isLoggedIn: false,

  // Network toggles
  wifiEnabled: true,
  cellularEnabled: true,

  // MQTT toggles
  mqttEnabled: true,
  mqttTls: true,

  // Data Logging toggles
  logEnabled: true,
  logEvents: { system: true, network: true, modbus_data: true, io_data: true },
  syncEnabled: true,
  syncStrategy: 'MQTT',
  syncCategories: { modbus_data: true, io_data: true },

  // Misc UI state
  pendingResetFn: null,
  otaStatus: 'idle',

  // Modbus slaves data
  slaves: [
    { type: 'RTU', id: '1', tags: [
      { addr: '0',   len: '2', dt: 'F32_ABCD', key: 'temperature',  cloud: true,  log_enabled: true  },
      { addr: '2',   len: '2', dt: 'F32_ABCD', key: 'pressure',     cloud: true,  log_enabled: false },
      { addr: '4',   len: '1', dt: 'U16',      key: 'status_flags', cloud: false, log_enabled: true  },
    ]},
    { type: 'TCP', id: '2', ip: '10.0.1.10', tags: [
      { addr: '100', len: '2', dt: 'F32_CDAB', key: 'flow_rate', cloud: true, log_enabled: true },
      { addr: '102', len: '1', dt: 'S16',      key: 'valve_pos', cloud: true, log_enabled: true },
    ]},
  ],

  // I/O table data
  analogInputs: [
    { pin: 'AI-0', key: 'Pressure_1', slope: '1',    offset: '0',    invert: false, cloud: true, log: true },
    { pin: 'AI-1', key: 'pH_Level',   slope: '0.01', offset: '-0.5', invert: false, cloud: true, log: true },
  ],
  digitalConfigs: [
    { index: '0', alias: 'Pump_Run',   pin: 'DO-0', defaultState: 'OFF', retain: true  },
    { index: '1', alias: 'Alarm_Horn', pin: 'DO-1', defaultState: 'OFF', retain: false },
  ],

  // Slave editing scratch state
  editingSlaveIndex: null,
  editTags: [],
  addTags: [],

  // Log data and filter
  logs: [],
  logFilter: 'all',
};

// ── Log Seed Data ──────────────────────────────────────────────────────────────
// Pre-populates the log viewer with realistic mock entries on page load.

function generateLogs() {
  const now = Date.now();
  return [
    { id: 1,  timestamp: new Date(now -  0*60000).toISOString(), category: 'system',  message: 'Device boot completed' },
    { id: 2,  timestamp: new Date(now -  1*60000).toISOString(), category: 'network', message: 'WiFi connected to FactoryWiFi-5G' },
    { id: 3,  timestamp: new Date(now -  3*60000).toISOString(), category: 'modbus',  message: 'Slave 1 poll OK — 2 tags read' },
    { id: 4,  timestamp: new Date(now -  5*60000).toISOString(), category: 'io',      message: 'DI0 rising edge detected' },
    { id: 5,  timestamp: new Date(now -  7*60000).toISOString(), category: 'modbus',  message: 'Slave 2 timeout — retrying' },
    { id: 6,  timestamp: new Date(now -  9*60000).toISOString(), category: 'system',  message: 'NTP sync successful' },
    { id: 7,  timestamp: new Date(now - 12*60000).toISOString(), category: 'network', message: 'MQTT broker reconnected' },
    { id: 8,  timestamp: new Date(now - 15*60000).toISOString(), category: 'io',      message: 'DO2 set HIGH by rule' },
    { id: 9,  timestamp: new Date(now - 20*60000).toISOString(), category: 'modbus',  message: 'Slave 1 poll OK — 2 tags read' },
    { id: 10, timestamp: new Date(now - 25*60000).toISOString(), category: 'system',  message: 'Config saved to flash' },
    { id: 11, timestamp: new Date(now - 30*60000).toISOString(), category: 'network', message: '4G signal strength: -78 dBm' },
    { id: 12, timestamp: new Date(now - 35*60000).toISOString(), category: 'modbus',  message: 'Slave 2 poll OK — 3 tags read' },
    { id: 13, timestamp: new Date(now - 40*60000).toISOString(), category: 'io',      message: 'AI0 value: 3.72 V' },
    { id: 14, timestamp: new Date(now - 45*60000).toISOString(), category: 'system',  message: 'Watchdog reset cleared' },
    { id: 15, timestamp: new Date(now - 50*60000).toISOString(), category: 'network', message: 'HTTP sync uploaded 12 records' },
  ];
}

// Seed on load
state.logs = generateLogs();

// ── Utility Helpers ───────────────────────────────────────────────────────────
// Shared DOM helpers used throughout all page scripts.

/** Show an element by removing the 'hidden' class. */
function show(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

/** Hide an element by adding the 'hidden' class. */
function hide(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

/**
 * Display a banner message with a visual variant (success / error / info).
 * @param {HTMLElement} el      - The banner DOM element.
 * @param {string}      msg     - The message text to display.
 * @param {string}      variant - One of 'success', 'error', 'info'.
 */
function setBanner(el, msg, variant) {
  el.textContent = msg;
  el.className = `banner ${variant}`;
  el.classList.remove('hidden');
}

// ── Modal Helpers ─────────────────────────────────────────────────────────────

/** Open a modal overlay by adding the 'open' class. */
function openModal(id) { document.getElementById(id).classList.add('open'); }

/** Close a modal overlay by removing the 'open' class. */
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ── Toggle Helpers ────────────────────────────────────────────────────────────

/**
 * Programmatically set a toggle to on/off.
 * @param {string}  id  - Element ID of the toggle.
 * @param {boolean} on  - Target state.
 */
function setToggle(id, on) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('on', on);
}

/**
 * Wire up a toggle element to fire a callback when clicked.
 * @param {string}   id       - Element ID of the toggle.
 * @param {Function} onChange - Called with (boolean isOn) on each click.
 */
function setupToggle(id, onChange) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', e => {
    e.stopPropagation();
    el.classList.toggle('on');
    onChange(el.classList.contains('on'));
  });
}

// ── App Bootstrap ─────────────────────────────────────────────────────────────
// Called after a successful login to reveal the main app shell.

function bootApp() {
  document.getElementById('login-page').classList.remove('active');
  document.getElementById('app').style.display = 'block';
  renderSidebars();
  renderSlavesTable();
  renderAnalogTable();
  renderDigitalTable();
  renderLogs();
}

// =============================================================================
// SECTION 3 — NAVIGATION
// Sidebar items, page routing, drawer, topbar, accordion, form buttons
// =============================================================================

//                 accordion sections, modals, and form-button wiring.

// ── Sidebar Menu Item Definitions ─────────────────────────────────────────────
// Each entry maps to a page ID and renders a nav item in the sidebar/drawer.

const menuItems = [
  // Icons matched exactly to screenshot (tablet collapsed sidebar view)
  { id: 'Dashboard',     label: 'Dashboard',      icon: '<path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z" fill="#F1F5F9"/>' },
  { id: 'Network',       label: 'Network',        icon: '<circle cx="12" cy="12" r="10" stroke="#F1F5F9" stroke-width="1.8" fill="none"/><path d="M2 12h20M12 2c-3 4-3 12 0 20M12 2c3 4 3 12 0 20" stroke="#F1F5F9" stroke-width="1.8" fill="none" stroke-linecap="round"/>' },
  { id: 'MQTT',          label: 'MQTT',           icon: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" stroke="#F1F5F9" stroke-width="1.8" fill="none"/><path d="M16.24 7.76A6 6 0 0 0 7.76 16.24" stroke="#F1F5F9" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M8 3.5C10 6 10 18 8 20.5M16 3.5C14 6 14 18 16 20.5" stroke="#F1F5F9" stroke-width="1.8" fill="none" stroke-linecap="round"/>' },
  { id: 'Modbus',        label: 'Modbus',         icon: '<rect x="5" y="2" width="14" height="20" rx="2" stroke="#F1F5F9" stroke-width="1.8" fill="none"/><rect x="9" y="6" width="6" height="4" rx="1" stroke="#F1F5F9" stroke-width="1.5" fill="none"/><circle cx="9" cy="14" r="1" fill="#F1F5F9"/><circle cx="12" cy="14" r="1" fill="#F1F5F9"/><circle cx="15" cy="14" r="1" fill="#F1F5F9"/><circle cx="9" cy="17" r="1" fill="#F1F5F9"/><circle cx="12" cy="17" r="1" fill="#F1F5F9"/><circle cx="15" cy="17" r="1" fill="#F1F5F9"/>' },
  { id: 'IO',            label: 'I/O',            icon: '<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="#F1F5F9" stroke-width="1.8" stroke-linecap="round" fill="none"/><circle cx="12" cy="12" r="3" stroke="#F1F5F9" stroke-width="1.8" fill="none"/>' },
  { id: 'DataLogging',   label: 'Data Logging',   icon: '<ellipse cx="12" cy="5" rx="8" ry="3" stroke="#F1F5F9" stroke-width="1.8" fill="none"/><path d="M4 5v5c0 1.66 3.58 3 8 3s8-1.34 8-3V5" stroke="#F1F5F9" stroke-width="1.8" fill="none"/><path d="M4 10v5c0 1.66 3.58 3 8 3s8-1.34 8-3v-5" stroke="#F1F5F9" stroke-width="1.8" fill="none"/>' },
  { id: 'Firmware',      label: 'System',         icon: '<path d="M12 3v12M8 11l4 4 4-4" stroke="#F1F5F9" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="#F1F5F9" stroke-width="1.8" stroke-linecap="round" fill="none"/>' },
  { id: 'AccessControl', label: 'Access Control', icon: '<rect x="5" y="11" width="14" height="11" rx="2" stroke="#F1F5F9" stroke-width="1.8" fill="none"/><path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="#F1F5F9" stroke-width="1.8" stroke-linecap="round" fill="none"/><circle cx="12" cy="16" r="1.5" fill="#F1F5F9"/>' },
  { id: 'ConfigBackup',  label: 'Config Backup',  icon: '<rect x="3" y="3" width="18" height="18" rx="2" stroke="#F1F5F9" stroke-width="1.8" fill="none"/><path d="M7 8h10M7 12h10M7 16h6" stroke="#F1F5F9" stroke-width="1.8" stroke-linecap="round" fill="none"/>' },
];

// ── Sidebar Rendering ─────────────────────────────────────────────────────────

/**
 * Build a single sidebar nav item element.
 * @param {Object}  item      - Menu item definition from menuItems array.
 * @param {boolean} collapsed - True when rendering the tablet icon-only sidebar.
 * @returns {HTMLElement}
 */
function makeSidebarItem(item, collapsed) {
  const div = document.createElement('div');
  const isActive = state.activeMenu === item.id;
  div.className = 'sidebar-item' + (isActive ? ' active' : '');
  div.dataset.id = item.id;
  div.innerHTML = `<div class="sidebar-item-inner">
    <div class="sidebar-item-icon"><svg viewBox="0 0 24 24" width="24" height="24" fill="none">${item.icon}</svg></div>
    ${!collapsed ? `<span class="sidebar-item-label">${item.label}</span>` : ''}
  </div>`;
  div.addEventListener('click', () => navigateTo(item.id, true));
  return div;
}

/**
 * Re-render all three sidebar instances (desktop, tablet, mobile drawer)
 * to reflect the current active page.
 */
function renderSidebars() {
  ['sidebar-nav-desktop', 'sidebar-nav-tablet', 'drawer-nav'].forEach((navId, i) => {
    const nav = document.getElementById(navId);
    if (!nav) return;
    nav.innerHTML = '';
    menuItems.forEach(item => nav.appendChild(makeSidebarItem(item, i === 1)));
  });
}

// ── Page Routing ──────────────────────────────────────────────────────────────

/**
 * Navigate to a page, updating the active state and sidebar highlight.
 * @param {string}  pageId      - The page identifier (matches .page element ID suffix).
 * @param {boolean} closeDrawer - If true, closes the mobile drawer after navigation.
 */
function navigateTo(pageId, closeDrawer) {
  state.activeMenu = pageId;

  // Show skeleton loader briefly while page content swaps in
  showSkeletonLoader();

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + pageId);
  if (closeDrawer) { closeDrawerFn(); }
  renderSidebars();
  document.getElementById('main').scrollTop = 0;
  window.scrollTo(0, 0);

  // Small delay to let the skeleton render, then reveal the real page
  setTimeout(() => {
    hideSkeletonLoader();
    if (page) page.classList.add('active');
  }, 220);
}

// ── Skeleton Loader ───────────────────────────────────────────────────────────
// Lightweight page-transition shimmer shown inside #main (not full-screen).
function showSkeletonLoader() {
  let sk = document.getElementById('skeleton-loader');
  if (!sk) {
    sk = document.createElement('div');
    sk.id = 'skeleton-loader';
    sk.innerHTML = `
      <div class="sk-title"></div>
      <div class="sk-card">
        <div class="sk-line w80"></div>
        <div class="sk-line w60"></div>
        <div class="sk-line w90"></div>
      </div>
      <div class="sk-card">
        <div class="sk-line w70"></div>
        <div class="sk-line w50"></div>
        <div class="sk-line w80"></div>
      </div>`;
    document.getElementById('main').appendChild(sk);
  }
  sk.style.display = 'flex';
}

function hideSkeletonLoader() {
  const sk = document.getElementById('skeleton-loader');
  if (sk) sk.style.display = 'none';
}

// ── Mobile Drawer ─────────────────────────────────────────────────────────────

document.getElementById('menu-btn').addEventListener('click', openDrawer);
document.getElementById('drawer-backdrop').addEventListener('click', closeDrawerFn);

function openDrawer() {
  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawer-backdrop').classList.add('open');
}

function closeDrawerFn() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawer-backdrop').classList.remove('open');
}

// ── Accordion Sections ────────────────────────────────────────────────────────
// Each section header toggles its corresponding body open/closed.

document.querySelectorAll('.section-header').forEach(header => {
  header.addEventListener('click', e => {
    // Prevent header click from firing when clicking toggles inside the header
    if (e.target.closest('.toggle') || e.target.closest('.toggle-sm')) return;
    const key  = header.dataset.section;
    const body = document.getElementById(key + '-body');
    if (!body) return;
    const isOpen = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    header.querySelector('.section-chevron').classList.toggle('open', !isOpen);
  });
});

// ── TopBar Actions ────────────────────────────────────────────────────────────

// Overflow (3-dot) dropdown toggle
document.getElementById('overflow-btn').addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('overflow-dropdown').classList.toggle('open');
});
// Close overflow dropdown when clicking elsewhere
document.addEventListener('click', () => {
  document.getElementById('overflow-dropdown').classList.remove('open');
});

// Cloud status modal trigger (overflow + topbar icon)
document.getElementById('overflow-cloud').addEventListener('click', () => openModal('modal-cloud'));
document.getElementById('cloud-status-btn').addEventListener('click', () => openModal('modal-cloud'));

// Reboot modal triggers
document.getElementById('topbar-reboot-btn').addEventListener('click', () => openModal('modal-reboot'));
document.getElementById('overflow-reboot').addEventListener('click', () => openModal('modal-reboot'));
document.getElementById('reboot-confirm-btn').addEventListener('click', () => closeModal('modal-reboot'));

// ── Global Modal Wiring ───────────────────────────────────────────────────────
// All modals with [data-close] attribute and click-outside-to-close behaviour.

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

// ── Form Buttons (Save / Reset) ───────────────────────────────────────────────

/**
 * Wire Save and Reset buttons for a settings form section.
 * Reset opens a confirmation modal; Save runs validation then shows a success banner.
 * @param {string|null} resetBtnId - ID of the Reset button (null to skip).
 * @param {string|null} saveBtnId  - ID of the Save button (null to skip).
 * @param {string}      bannerID   - ID of the success banner element.
 * @param {Function}    resetFn    - Callback to restore default values.
 * @param {Function}    saveFn     - Callback to validate before saving (return false to abort).
 */
function setupFormButtons(resetBtnId, saveBtnId, bannerID, resetFn, saveFn) {
  const resetBtn = document.getElementById(resetBtnId);
  const saveBtn  = document.getElementById(saveBtnId);
  const banner   = document.getElementById(bannerID);

  if (resetBtn) resetBtn.addEventListener('click', () => {
    state.pendingResetFn = resetFn;
    openModal('modal-reset');
  });

  if (saveBtn) saveBtn.addEventListener('click', () => {
    if (saveFn && saveFn() === false) return;
    if (banner) { show(bannerID); setTimeout(() => hide(bannerID), 3000); }
  });
}

// Confirm reset modal — runs the stored reset callback
document.getElementById('reset-confirm-btn').addEventListener('click', () => {
  if (state.pendingResetFn) { state.pendingResetFn(); state.pendingResetFn = null; }
  closeModal('modal-reset');
});

// ── Per-Page Form Button Registrations ────────────────────────────────────────

// Network page
setupFormButtons('net-reset-btn', 'net-save-btn', 'net-save-banner', () => {
  document.getElementById('cellular-apn').value      = 'Internet';
  document.getElementById('cellular-user').value     = 'Optional';
  document.getElementById('cellular-password').value = 'Internet';
  document.getElementById('eth-ip').value            = '192.168.1.100';
  document.getElementById('eth-subnet').value        = '255.255.255.0';
  document.getElementById('eth-gw').value            = '192.168.1.1';
  document.getElementById('eth-dns').value           = '8.8.8.8';
  document.getElementById('net-priority-select').value = '4g-wifi';
  setToggle('wifi-toggle', true);
  setToggle('cellular-toggle', true);
}, () => validateNetwork());

// MQTT page
setupFormButtons('mqtt-reset-btn', 'mqtt-save-btn', 'mqtt-save-banner', () => {
  document.getElementById('mqtt-host').value      = 'broker.example.com';
  document.getElementById('mqtt-port').value      = '8883';
  document.getElementById('mqtt-clientid').value  = 'apex-gw-001';
  document.getElementById('mqtt-username').value  = '';
  document.getElementById('mqtt-password').value  = '';
  document.getElementById('mqtt-publish').value   = 'apex/data';
  document.getElementById('mqtt-subscribe').value = 'apex/cmd';
  setToggle('mqtt-enable-toggle', true);
  setToggle('mqtt-tls-toggle', true);
  updateMqttDisabledState();
}, () => validateMQTT());

// Modbus page
setupFormButtons('modbus-reset-btn', 'modbus-save-btn', 'modbus-save-banner', () => {
  state.slaves = JSON.parse(JSON.stringify([
    { type: 'RTU', id: '1', tags: [
      { addr: '0', len: '2', dt: 'F32_ABCD', key: 'temperature',  cloud: true,  log_enabled: true  },
      { addr: '2', len: '2', dt: 'F32_ABCD', key: 'pressure',     cloud: true,  log_enabled: false },
      { addr: '4', len: '1', dt: 'U16',      key: 'status_flags', cloud: false, log_enabled: true  },
    ]},
    { type: 'TCP', id: '2', ip: '10.0.1.10', tags: [
      { addr: '100', len: '2', dt: 'F32_CDAB', key: 'flow_rate', cloud: true, log_enabled: true },
      { addr: '102', len: '1', dt: 'S16',      key: 'valve_pos', cloud: true, log_enabled: true },
    ]},
  ]));
  renderSlavesTable();
}, null);

// I/O page
setupFormButtons('io-reset-btn', 'io-save-btn', 'io-save-banner', () => {
  state.analogInputs  = [
    { pin: 'AI-0', key: 'Pressure_1', slope: '1',    offset: '0',    invert: false, cloud: true, log: true },
    { pin: 'AI-1', key: 'pH_Level',   slope: '0.01', offset: '-0.5', invert: false, cloud: true, log: true },
  ];
  state.digitalConfigs = [
    { index: '0', alias: 'Pump_Run',   pin: 'DO-0', defaultState: 'OFF', retain: true  },
    { index: '1', alias: 'Alarm_Horn', pin: 'DO-1', defaultState: 'OFF', retain: false },
  ];
  renderAnalogTable();
  renderDigitalTable();
}, null);

// Data Logging page
setupFormButtons('log-reset-btn', 'log-save-btn', 'log-save-banner', () => {
  setToggle('log-enable-toggle', true);
  setToggle('log-system-toggle', true);
  setToggle('log-network-toggle', true);
  setToggle('log-modbus-toggle', true);
  setToggle('log-io-toggle', true);
  setToggle('sync-enable-toggle', true);
  document.getElementById('sync-strategy-select').value = 'MQTT';
  setToggle('sync-modbus-toggle', true);
  setToggle('sync-io-toggle', true);
  state.syncStrategy = 'MQTT';
  updateSyncStrategy();
}, null);

// Firmware page (save banner only, no validation or reset)
setupFormButtons(null, 'fw-save-btn', 'fw-save-banner', null, null);

// =============================================================================
// SECTION 4 — API / LOGIN
// Authentication and login page logic
// =============================================================================


// ── Login Credentials (mock) ──────────────────────────────────────────────────
// In a real device these would be verified server-side via HTTP to the ESP32.

const VALID_MACHINE_ID = 'ESP32-001';
const VALID_PASSWORD   = 'admin';

// ── Password Visibility Toggle ────────────────────────────────────────────────

document.getElementById('toggle-password').addEventListener('click', () => {
  const inp = document.getElementById('password-input');
  inp.type = inp.type === 'password' ? 'text' : 'password';
});

// ── Login Form Event Bindings ─────────────────────────────────────────────────

document.getElementById('login-btn').addEventListener('click', handleLogin);
document.getElementById('password-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleLogin();
});
document.getElementById('machine-id-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleLogin();
});

// ── Login Handler ─────────────────────────────────────────────────────────────

/**
 * Validate login form fields and submit credentials.
 * Shows an inline auth error banner on failure; calls bootApp() on success.
 */
function handleLogin() {
  const machineId = document.getElementById('machine-id-input').value.trim();
  const password  = document.getElementById('password-input').value;
  let valid = true;

  // Clear any previous errors
  hide('machine-id-error');
  hide('password-error');
  hide('login-auth-error');
  document.getElementById('machine-id-wrap').classList.remove('error');
  document.getElementById('password-wrap').classList.remove('error');

  // Validate fields
  if (!machineId) {
    show('machine-id-error');
    document.getElementById('machine-id-wrap').classList.add('error');
    valid = false;
  }
  if (!password) {
    show('password-error');
    document.getElementById('password-wrap').classList.add('error');
    valid = false;
  }
  if (!valid) return;

  // Simulate an async auth request to the device
  const btn = document.getElementById('login-btn');
  const txt = document.getElementById('login-btn-text');
  btn.disabled = true;
  txt.textContent = 'Authenticating…';

  setTimeout(() => {
    btn.disabled = false;
    txt.textContent = 'Login';

    if (machineId === VALID_MACHINE_ID && password === VALID_PASSWORD) {
      // ✅ Credentials match — launch the main app
      bootApp();
    } else {
      // ❌ Bad credentials — show error banner
      show('login-auth-error');
    }
  }, 800);
}

// =============================================================================
// SECTION 5 — DASHBOARD
// Placeholder for future live metric polling from the ESP32 REST API
// =============================================================================

// The dashboard cards are purely static HTML with no dynamic behaviour.
// This file is a placeholder for future live metric polling logic.

// ── Future: Live Metric Polling ───────────────────────────────────────────────
// When the ESP32 REST API is integrated, this file should contain:
//   - A setInterval() to poll /api/status every N seconds
//   - DOM updates for connectivity, cloud, storage, and system metric rows
//   - showLoader() / hideLoader() calls around fetch requests
//
// Example stub:
//
// function refreshDashboard() {
//   showLoader('Refreshing…');
//   fetch('/api/status')
//     .then(r => r.json())
//     .then(data => {
//       document.getElementById('metric-wifi-status').textContent = data.wifi.status;
//       // … update other metrics …
//     })
//     .finally(() => hideLoader());
// }

// =============================================================================
// SECTION 6 — NETWORK PAGE
// WiFi/Cellular toggles, WiFi network table, password modal, IPv4 validation
// =============================================================================

//              WiFi password modal, and Ethernet IPv4 field validation.

// ── WiFi Section Toggle ───────────────────────────────────────────────────────
// Disables the WiFi network table and scan button when WiFi is turned off.

setupToggle('wifi-toggle', on => {
  state.wifiEnabled = on;
  const content = document.getElementById('wifi-content');
  const table   = document.getElementById('wifi-network-table');
  content.style.opacity = on ? '' : '0.4';
  if (table) table.classList.toggle('disabled', !on);
  document.getElementById('wifi-scan-btn').disabled = !on;
});

// ── Cellular Section Toggle ───────────────────────────────────────────────────
// Disables APN/username/password fields when Cellular is turned off.

setupToggle('cellular-toggle', on => {
  state.cellularEnabled = on;
  ['cellular-apn', 'cellular-user', 'cellular-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !on;
  });
});

// ── WiFi Network Table — Row Click → Password Modal ───────────────────────────
// Clicking a scanned network row pre-fills the SSID and opens the connect modal.

document.querySelectorAll('#wifi-network-table tbody tr').forEach(row => {
  row.addEventListener('click', () => {
    if (!state.wifiEnabled) return;
    const ssid = row.dataset.ssid;
    document.getElementById('wifi-modal-ssid').value = ssid;
    document.getElementById('wifi-modal-pw').value   = '';
    hide('wifi-pw-error');
    document.getElementById('wifi-pw-wrap').classList.remove('error');
    openModal('modal-wifi-pw');
  });
});

// ── WiFi Password Modal — Connect Button ──────────────────────────────────────

document.getElementById('wifi-connect-btn').addEventListener('click', () => {
  const pw = document.getElementById('wifi-modal-pw').value;
  if (!pw.trim()) {
    show('wifi-pw-error');
    document.getElementById('wifi-pw-wrap').classList.add('error');
    return;
  }
  closeModal('modal-wifi-pw');
});

// ── Ethernet IPv4 Validation ──────────────────────────────────────────────────

/**
 * Check if a string is a valid IPv4 address.
 * @param {string} ip
 * @returns {boolean}
 */
function isValidIPv4(ip) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip.trim()) &&
    ip.split('.').every(p => parseInt(p) <= 255);
}

/**
 * Validate all Ethernet IPv4 fields (IP, Subnet, Gateway, DNS).
 * Shows inline error labels on invalid fields.
 * @returns {boolean} True if all fields are valid.
 */
function validateNetwork() {
  let ok = true;
  const checks = [
    ['eth-ip',     'eth-ip-err',     'eth-ip-wrap'],
    ['eth-subnet', 'eth-subnet-err', 'eth-subnet-wrap'],
    ['eth-gw',     'eth-gw-err',     'eth-gw-wrap'],
    ['eth-dns',    'eth-dns-err',    'eth-dns-wrap'],
  ];
  checks.forEach(([inputId, errId]) => {
    const val   = document.getElementById(inputId)?.value ?? '';
    const valid = isValidIPv4(val);
    const errEl = document.getElementById(errId);
    if (errEl) { errEl.classList.toggle('hidden', valid); }
    if (!valid) ok = false;
  });
  return ok;
}

// =============================================================================
// SECTION 7 — MQTT PAGE
// Enable/TLS toggles, field disable logic, validation, cert uploads
// =============================================================================

//           host/port validation, and certificate upload interactions.

// ── MQTT Enable Toggle ────────────────────────────────────────────────────────
// Disables all MQTT configuration fields when the Live toggle is off.

setupToggle('mqtt-enable-toggle', on => {
  state.mqttEnabled = on;
  updateMqttDisabledState();
});

// ── MQTT TLS Toggle ───────────────────────────────────────────────────────────
// Shows/hides the certificate upload fields based on TLS state.

setupToggle('mqtt-tls-toggle', on => {
  state.mqttTls = on;
  updateMqttDisabledState();
});

// ── Field Disabled State ──────────────────────────────────────────────────────
// Centralised function called whenever either MQTT toggle changes.

function updateMqttDisabledState() {
  const live = state.mqttEnabled;
  const tls  = state.mqttTls;

  // Disable all text inputs when Live is off
  ['mqtt-host', 'mqtt-port', 'mqtt-clientid', 'mqtt-username', 'mqtt-password',
   'mqtt-publish', 'mqtt-subscribe'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !live;
  });

  // Dim the TLS toggle row when Live is off
  document.getElementById('mqtt-tls-row').classList.toggle('disabled', !live);

  // Disable cert upload buttons when Live is off OR TLS is off
  ['mqtt-ca-row', 'mqtt-cert-row', 'mqtt-key-row'].forEach(id => {
    const row = document.getElementById(id);
    if (!row) return;
    const btn = row.querySelector('.cert-upload-btn');
    if (btn) btn.classList.toggle('disabled', !live || !tls);
  });
}

// ── MQTT Validation ───────────────────────────────────────────────────────────

/**
 * Validate MQTT host and port fields before saving.
 * @returns {boolean} True if validation passes.
 */
function validateMQTT() {
  let ok = true;
  const host    = document.getElementById('mqtt-host').value;
  const port    = document.getElementById('mqtt-port').value;
  const hostErr = document.getElementById('mqtt-host-err');
  const portErr = document.getElementById('mqtt-port-err');

  if (state.mqttEnabled && !host.trim()) {
    hostErr.textContent = 'Host field cannot be empty';
    show('mqtt-host-err');
    ok = false;
  } else {
    hide('mqtt-host-err');
  }

  const portNum = parseInt(port);
  if (state.mqttEnabled && (isNaN(portNum) || portNum < 1 || portNum > 65535)) {
    portErr.textContent = 'Port must be between 1 and 65535';
    show('mqtt-port-err');
    ok = false;
  } else {
    hide('mqtt-port-err');
  }

  return ok;
}

// ── Certificate Upload Buttons ────────────────────────────────────────────────
// Each upload button triggers a hidden file input and shows the selected filename.

document.querySelectorAll('.cert-upload-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('disabled')) return;

    const input  = document.createElement('input');
    input.type   = 'file';
    input.accept = '.pem,.crt,.key,.cer';

    input.onchange = () => {
      const file = input.files[0];
      if (!file) return;
      const row = btn.parentElement;
      btn.style.display = 'none';

      // Replace button with a "uploaded" chip showing the filename
      const uploaded = document.createElement('div');
      uploaded.className = 'cert-uploaded';
      uploaded.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span class="cert-filename">${file.name}</span>
        <button class="cert-remove">×</button>`;

      // Remove button reverts back to the upload button
      uploaded.querySelector('.cert-remove').onclick = () => {
        uploaded.remove();
        btn.style.display = '';
      };
      row.appendChild(uploaded);
    };

    input.click();
  });
});

// =============================================================================
// SECTION 8 — MODBUS PAGE
// TCP port validation, slaves table, Add/Edit slave modals with tag rows
// =============================================================================

//             slaves table rendering, and Add/Edit Slave modals with tag rows.

// ── TCP Port Validation ───────────────────────────────────────────────────────
// Validates the TCP port field on every keystroke.

function validateModbusPort() {
  const p     = parseInt(document.getElementById('tcp-port').value);
  const valid = !isNaN(p) && p >= 1 && p <= 65535;
  const err   = document.getElementById('tcp-port-err');
  err.textContent = 'Port must be between 1 and 65535';
  err.classList.toggle('hidden', valid);
}

document.getElementById('tcp-port').addEventListener('input', validateModbusPort);

// ── Slaves Table ──────────────────────────────────────────────────────────────
// Renders state.slaves into the HTML table, wiring Edit and Delete buttons.

function renderSlavesTable() {
  const tbody = document.getElementById('slaves-tbody');
  tbody.innerHTML = '';

  state.slaves.forEach((slave, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${slave.type}</td>
      <td>${slave.id}</td>
      <td style="width:80px">${slave.type === 'TCP' ? (slave.ip || '-') : '-'}</td>
      <td>${slave.tags.length}</td>
      <td>
        <div style="display:flex;gap:12px;align-items:center">
          <button class="action-btn" data-edit="${i}" title="Edit">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F1F5F9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="action-btn" data-del="${i}" title="Delete">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });

  // Wire Edit buttons
  tbody.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openEditSlave(parseInt(btn.dataset.edit)));
  });

  // Wire Delete buttons — remove from state and re-render
  tbody.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.slaves.splice(parseInt(btn.dataset.del), 1);
      renderSlavesTable();
    });
  });
}

// ── Tag Row Builder ───────────────────────────────────────────────────────────
// Used in both the Add Slave and Edit Slave modals.

/**
 * Build a single tag row element for the inline tag table.
 * @param {Object} tag    - Tag data { addr, len, dt, key, cloud, log_enabled }.
 * @param {number} i      - Row index within the tags array.
 * @param {string} prefix - 'add' or 'edit', determines which state array to mutate.
 * @returns {HTMLElement}
 */
function makeTagRow(tag, i, prefix) {
  const div = document.createElement('div');
  div.className = 'tag-cols tag-row';
  div.innerHTML = `
    <input class="tag-cell-input" type="number" value="${tag.addr}" placeholder="0" data-field="addr"/>
    <input class="tag-cell-input" type="number" value="${tag.len}"  placeholder="1" data-field="len"/>
    <select class="tag-cell-select" data-field="dt">
      ${['F32_ABCD', 'F32_CDAB', 'U16', 'S16'].map(o =>
        `<option value="${o}" ${tag.dt === o ? 'selected' : ''}>${o}</option>`
      ).join('')}
    </select>
    <input class="tag-cell-input" value="${tag.key}" placeholder="tag_key" data-field="key"/>
    <div class="tag-cell-toggle">
      <div class="toggle-mini ${tag.cloud ? 'on' : ''}" data-field="cloud"><div class="toggle-mini-knob"></div></div>
    </div>
    <div class="tag-cell-toggle">
      <div class="toggle-mini ${tag.log_enabled ? 'on' : ''}" data-field="log_enabled"><div class="toggle-mini-knob"></div></div>
    </div>
    <div class="tag-cell-del" data-delrow="${i}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
        <path d="M9 6V4h6v2"/>
      </svg>
    </div>`;

  // Sync text/select inputs back to state
  div.querySelectorAll('input, select').forEach(inp => {
    inp.addEventListener('input', function() {
      const arr = prefix === 'add' ? state.addTags : state.editTags;
      arr[i][this.dataset.field] = this.value;
    });
  });

  // Sync mini toggles back to state
  div.querySelectorAll('.toggle-mini').forEach(t => {
    t.addEventListener('click', function() {
      this.classList.toggle('on');
      const arr = prefix === 'add' ? state.addTags : state.editTags;
      arr[i][this.dataset.field] = this.classList.contains('on');
    });
  });

  // Delete this tag row
  div.querySelector('[data-delrow]').addEventListener('click', function() {
    const arr = prefix === 'add' ? state.addTags : state.editTags;
    arr.splice(i, 1);
    if (prefix === 'add') renderAddTagRows();
    else renderEditTagRows();
  });

  return div;
}

// ── Add Slave Modal ───────────────────────────────────────────────────────────

function renderAddTagRows() {
  const container = document.getElementById('add-tag-rows');
  container.innerHTML = '';
  state.addTags.forEach((tag, i) => container.appendChild(makeTagRow(tag, i, 'add')));
  document.getElementById('add-tag-empty').classList.toggle('hidden', state.addTags.length > 0);
}

// Open the Add Slave modal and reset its fields
document.getElementById('add-slave-btn').addEventListener('click', () => {
  state.addTags = [];
  document.getElementById('add-slave-id').value   = '';
  document.getElementById('add-slave-ip').value   = '';
  document.getElementById('add-slave-type').value = 'RTU';
  hide('add-slave-id-err');
  hide('add-slave-ip-err');
  document.getElementById('add-slave-id-wrap').classList.remove('error');
  document.getElementById('add-slave-ip-wrap').classList.remove('error');
  hide('add-slave-ip-field');
  renderAddTagRows();
  openModal('modal-add-slave');
});

// Show/hide IP field based on slave type selection
document.getElementById('add-slave-type').addEventListener('change', function() {
  document.getElementById('add-slave-ip-field').classList.toggle('hidden', this.value !== 'TCP');
});

// Add a blank tag row
document.getElementById('add-tag-btn').addEventListener('click', () => {
  state.addTags.push({ addr: '', len: '1', dt: 'F32_ABCD', key: '', cloud: true, log_enabled: true });
  renderAddTagRows();
});

// Confirm: validate then add slave to state
document.getElementById('add-slave-confirm-btn').addEventListener('click', () => {
  const type = document.getElementById('add-slave-type').value;
  const id   = document.getElementById('add-slave-id').value.trim();
  const ip   = document.getElementById('add-slave-ip').value.trim();
  let ok = true;

  // Validate Slave ID
  if (!id) {
    document.getElementById('add-slave-id-err').textContent = 'Slave ID is required';
    show('add-slave-id-err');
    document.getElementById('add-slave-id-wrap').classList.add('error');
    ok = false;
  } else if (state.slaves.some(s => s.id === id)) {
    document.getElementById('add-slave-id-err').textContent = 'Slave ID must be unique';
    show('add-slave-id-err');
    document.getElementById('add-slave-id-wrap').classList.add('error');
    ok = false;
  } else {
    hide('add-slave-id-err');
    document.getElementById('add-slave-id-wrap').classList.remove('error');
  }

  // Validate IP for TCP slaves
  if (type === 'TCP' && !ip) {
    document.getElementById('add-slave-ip-err').textContent = 'IP Address is required for TCP slaves';
    show('add-slave-ip-err');
    document.getElementById('add-slave-ip-wrap').classList.add('error');
    ok = false;
  } else {
    hide('add-slave-ip-err');
    document.getElementById('add-slave-ip-wrap').classList.remove('error');
  }

  if (!ok) return;

  // Commit to state
  const slave = { type, id, tags: JSON.parse(JSON.stringify(state.addTags)) };
  if (type === 'TCP') slave.ip = ip;
  state.slaves.push(slave);
  renderSlavesTable();
  closeModal('modal-add-slave');
});

// ── Edit Slave Modal ──────────────────────────────────────────────────────────

/**
 * Open the Edit Slave modal pre-populated with the selected slave's data.
 * @param {number} index - Index of the slave in state.slaves.
 */
function openEditSlave(index) {
  state.editingSlaveIndex = index;
  const slave = state.slaves[index];
  state.editTags = JSON.parse(JSON.stringify(slave.tags));
  document.getElementById('edit-slave-type-display').value = slave.type;
  document.getElementById('edit-slave-id').value           = slave.id;
  document.getElementById('edit-slave-ip').value           = slave.ip || '';
  document.getElementById('edit-slave-ip-field').classList.toggle('hidden', slave.type !== 'TCP');
  renderEditTagRows();
  openModal('modal-edit-slave');
}

function renderEditTagRows() {
  const container = document.getElementById('edit-tag-rows');
  container.innerHTML = '';
  state.editTags.forEach((tag, i) => container.appendChild(makeTagRow(tag, i, 'edit')));
  document.getElementById('edit-tag-empty').classList.toggle('hidden', state.editTags.length > 0);
}

// Add a blank tag row in the Edit modal
document.getElementById('edit-tag-btn').addEventListener('click', () => {
  state.editTags.push({ addr: '', len: '1', dt: 'F32_ABCD', key: '', cloud: true, log_enabled: true });
  renderEditTagRows();
});

// Save edits back to state
document.getElementById('edit-slave-save-btn').addEventListener('click', () => {
  const i = state.editingSlaveIndex;
  if (i === null) return;
  state.slaves[i].id   = document.getElementById('edit-slave-id').value;
  if (state.slaves[i].type === 'TCP') {
    state.slaves[i].ip = document.getElementById('edit-slave-ip').value;
  }
  state.slaves[i].tags = JSON.parse(JSON.stringify(state.editTags));
  renderSlavesTable();
  closeModal('modal-edit-slave');
});

// =============================================================================
// SECTION 9 — I/O PAGE
// Analog inputs table and Digital output config table with inline editing
// =============================================================================

//         Both tables support inline editing (key/alias fields and toggles).

// ── Analog Inputs Table ───────────────────────────────────────────────────────
// Renders state.analogInputs into an editable HTML table.
// Key field is an inline text input; Invert/Cloud/Log are mini toggles.

function renderAnalogTable() {
  const tbody = document.getElementById('analog-tbody');
  tbody.innerHTML = '';

  state.analogInputs.forEach((inp, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${inp.pin}</td>
      <td><input class="io-inline-input" value="${inp.key}" data-ai="${i}" data-field="key"/></td>
      <td>${inp.slope}</td>
      <td>${inp.offset}</td>
      <td><div class="toggle-mini ${inp.invert ? 'on' : ''}" data-ai="${i}" data-field="invert"><div class="toggle-mini-knob"></div></div></td>
      <td><div class="toggle-mini ${inp.cloud  ? 'on' : ''}" data-ai="${i}" data-field="cloud" ><div class="toggle-mini-knob"></div></div></td>
      <td><div class="toggle-mini ${inp.log    ? 'on' : ''}" data-ai="${i}" data-field="log"   ><div class="toggle-mini-knob"></div></div></td>`;
    tbody.appendChild(tr);

    // Sync mini toggles to state
    tr.querySelectorAll('.toggle-mini').forEach(t => {
      t.addEventListener('click', function() {
        this.classList.toggle('on');
        state.analogInputs[this.dataset.ai][this.dataset.field] = this.classList.contains('on');
      });
    });

    // Sync the inline Key text input to state
    tr.querySelector('.io-inline-input').addEventListener('input', function() {
      state.analogInputs[this.dataset.ai].key = this.value;
    });
  });
}

// ── Digital Output Config Table ───────────────────────────────────────────────
// Renders state.digitalConfigs into an editable HTML table.
// Alias field is an inline text input; Default State is a dropdown; Retain is a mini toggle.

function renderDigitalTable() {
  const tbody = document.getElementById('digital-tbody');
  tbody.innerHTML = '';

  state.digitalConfigs.forEach((cfg, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${cfg.index}</td>
      <td><input class="io-inline-input" value="${cfg.alias}" data-di="${i}"/></td>
      <td>${cfg.pin}</td>
      <td>
        <div class="io-select-wrap" style="position:relative">
          <select data-di="${i}" data-field="defaultState">
            <option value="OFF" ${cfg.defaultState === 'OFF' ? 'selected' : ''}>OFF</option>
            <option value="ON"  ${cfg.defaultState === 'ON'  ? 'selected' : ''}>ON</option>
          </select>
          <svg style="position:absolute;right:6px;top:50%;transform:translateY(-50%) rotate(180deg);pointer-events:none"
               width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M6.37 8L11.27 12.9a.74.74 0 010 1.05.74.74 0 01-1.05 0L4.95 8.95A1.5 1.5 0 014.55 8c0-.18.03-.34.1-.5.07-.17.17-.32.3-.45l5.13-5.13a.74.74 0 011.05 0 .74.74 0 010 1.05L6.37 8z" fill="#A2A0A9"/>
          </svg>
        </div>
      </td>
      <td><div class="toggle-mini ${cfg.retain ? 'on' : ''}" data-di="${i}" data-field="retain"><div class="toggle-mini-knob"></div></div></td>`;
    tbody.appendChild(tr);

    // Sync inline Alias input to state
    tr.querySelector('.io-inline-input').addEventListener('input', function() {
      state.digitalConfigs[this.dataset.di].alias = this.value;
    });

    // Sync Default State dropdown to state
    tr.querySelector('select').addEventListener('change', function() {
      state.digitalConfigs[this.dataset.di].defaultState = this.value;
    });

    // Sync Retain toggle to state
    tr.querySelector('.toggle-mini').addEventListener('click', function() {
      this.classList.toggle('on');
      state.digitalConfigs[this.dataset.di].retain = this.classList.contains('on');
    });
  });
}

// =============================================================================
// SECTION 10 — DATA LOGGING PAGE
// Log toggles, offline sync strategy, log viewer (filter / clear / download)
// =============================================================================

//                  strategy selection, log viewer (filter, clear, download).
//             setToggle, setBanner)

// ── Local Logging Toggles ─────────────────────────────────────────────────────

// Master enable/disable for all local logging categories
setupToggle('log-enable-toggle', on => {
  state.logEnabled = on;
  ['log-system-row', 'log-network-row', 'log-modbus-row', 'log-io-row'].forEach(id => {
    document.getElementById(id).classList.toggle('disabled', !on);
  });
});

// Individual event category toggles
['system', 'network', 'modbus', 'io'].forEach(cat => {
  setupToggle(`log-${cat}-toggle`, on => {
    // Map UI category names to state keys
    const key = cat === 'io'     ? 'io_data'
               : cat === 'modbus' ? 'modbus_data'
               : cat;
    state.logEvents[key] = on;
  });
});

// ── Offline Sync Toggles ──────────────────────────────────────────────────────

// Master sync enable — dims all sync sub-options when off
setupToggle('sync-enable-toggle', on => {
  state.syncEnabled = on;
  ['sync-strategy-wrap', 'sync-mqtt-row', 'sync-http-rows', 'sync-modbus-row', 'sync-io-row'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.opacity       = on ? '' : '0.4';
    el.style.pointerEvents = on ? '' : 'none';
  });
});

// Sync strategy dropdown (MQTT vs HTTP)
document.getElementById('sync-strategy-select').addEventListener('change', function() {
  state.syncStrategy = this.value;
  updateSyncStrategy();
});

/**
 * Show the correct sub-fields for the selected sync strategy.
 * MQTT shows a topic field; HTTP shows endpoint + auth fields.
 */
function updateSyncStrategy() {
  const isMqtt = state.syncStrategy === 'MQTT';
  document.getElementById('sync-mqtt-row').classList.toggle('hidden', !isMqtt);
  document.getElementById('sync-http-rows').classList.toggle('hidden', isMqtt);
}

// ── Log Viewer ────────────────────────────────────────────────────────────────

// Clear logs button — opens a confirmation modal
document.getElementById('log-clear-btn').addEventListener('click', () => openModal('modal-clear-logs'));

document.getElementById('clear-logs-confirm-btn').addEventListener('click', () => {
  state.logs = [];
  renderLogs();
  closeModal('modal-clear-logs');
});

// Download logs as a JSON file
document.getElementById('log-download-btn').addEventListener('click', () => {
  const data = state.logs.map(l => ({
    timestamp: l.timestamp,
    category:  l.category,
    message:   l.message,
  }));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'esp32_logs.json';
  a.click();
  URL.revokeObjectURL(url);
});

// Category filter buttons
document.querySelectorAll('.log-filter-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.log-filter-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    state.logFilter = this.dataset.filter;
    renderLogs();
  });
});

// ── Log Renderer ──────────────────────────────────────────────────────────────

/**
 * Re-render the log viewer list based on the current filter and state.logs.
 * Also updates the entry count and disables action buttons when empty.
 */
function renderLogs() {
  const container = document.getElementById('log-entries');
  const filtered  = state.logFilter === 'all'
    ? state.logs
    : state.logs.filter(l => l.category === state.logFilter);
  const count = state.logs.length;

  document.getElementById('log-count').textContent = `${count} ${count === 1 ? 'entry' : 'entries'}`;
  document.getElementById('log-clear-btn').disabled    = count === 0;
  document.getElementById('log-download-btn').disabled = count === 0;

  container.innerHTML = '';
  filtered.forEach(log => {
    const div = document.createElement('div');
    div.className = 'log-row';
    const ts      = new Date(log.timestamp);
    const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const catLabels = { system: 'System', network: 'Network', modbus: 'Modbus', io: 'I/O' };
    div.innerHTML = `
      <span class="log-time">${timeStr}</span>
      <span class="log-badge ${log.category}">${catLabels[log.category]}</span>
      <span class="log-message">${log.message}</span>`;
    container.appendChild(div);
  });
}

// =============================================================================
// SECTION 11 — FIRMWARE / SYSTEM PAGE
// Cloud OTA flow, manual firmware upload, reboot and factory reset modals
// =============================================================================

//               reboot and factory reset confirmation modals.

// ── Cloud OTA Update ──────────────────────────────────────────────────────────
// Three-state flow: idle → checking → available → updating → done

document.getElementById('fw-check-btn').addEventListener('click', () => {
  const url = document.getElementById('fw-url').value.trim();
  if (!url) return;

  state.otaStatus = 'checking';
  const statusEl = document.getElementById('fw-ota-status');
  statusEl.textContent = 'Checking firmware…';
  statusEl.className   = 'text-sm-gray';
  show('fw-ota-status');

  document.getElementById('fw-check-btn').disabled = true;

  // Simulate server response after 1.5 s
  setTimeout(() => {
    state.otaStatus = 'available';
    statusEl.textContent = 'Update available — v2.5.0';
    statusEl.className   = 'text-sm-green';

    const btn = document.getElementById('fw-check-btn');
    btn.textContent = 'Apply Update';
    btn.disabled    = false;
    btn.onclick     = applyOTA;      // swap the click handler for the Apply phase
  }, 1500);
});

/**
 * Run the OTA apply phase: simulate flashing progress then show success.
 */
function applyOTA() {
  state.otaStatus = 'updating';
  const statusEl = document.getElementById('fw-ota-status');
  statusEl.textContent = 'Flashing firmware…';
  statusEl.className   = 'text-sm-gray';

  const btn = document.getElementById('fw-check-btn');
  btn.disabled = true;

  // Simulate flash completion after 2 s
  setTimeout(() => {
    state.otaStatus = 'done';
    statusEl.textContent = 'Firmware updated successfully';
    statusEl.className   = 'text-sm-green';

    btn.textContent = 'Check Again';
    btn.disabled    = false;
    btn.onclick     = null;           // clear the apply handler

    // Next click resets back to idle state
    btn.addEventListener('click', () => {
      state.otaStatus = 'idle';
      hide('fw-ota-status');
      document.getElementById('fw-url').value = 'http://ota.example.com/fw.bin';
    }, { once: true });
  }, 2000);
}

// ── Manual Firmware Upload ────────────────────────────────────────────────────
// Triggers a hidden file input, shows the filename, then simulates a flash complete.

document.getElementById('fw-upload-btn').addEventListener('click', () => {
  document.getElementById('fw-file-input').click();
});

document.getElementById('fw-file-input').addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;

  const nameEl = document.getElementById('fw-file-name');
  nameEl.textContent = file.name;
  show('fw-file-name');
  hide('fw-upload-done');

  // Simulate upload progress completing after 1.8 s
  setTimeout(() => { show('fw-upload-done'); }, 1800);
  this.value = '';
});

// ── System Action Modals ──────────────────────────────────────────────────────

// Reboot modal
document.getElementById('fw-reboot-btn').addEventListener('click', () => openModal('modal-fw-reboot'));

// Factory Reset modal
document.getElementById('fw-factory-btn').addEventListener('click', () => openModal('modal-factory'));

// =============================================================================
// SECTION 12 — ACCESS CONTROL & CONFIG BACKUP
// Change User ID, Change Password, Logout, Export/Import config JSON
// =============================================================================

//                     Logout confirmation.
//                     Config Backup page: Export JSON, Import & validate JSON.

// ═════════════════════════════════════════════════════════════════════════════
// ACCESS CONTROL PAGE
// ═════════════════════════════════════════════════════════════════════════════

// ── Change User ID ────────────────────────────────────────────────────────────
// Requires password confirmation; checks against the current stored password.

document.getElementById('ac-update-userid-btn').addEventListener('click', () => {
  const newId  = document.getElementById('ac-new-userid').value.trim();
  const pw     = document.getElementById('ac-userid-pw').value;
  const banner = document.getElementById('ac-userid-banner');

  if (!newId) {
    setBanner(banner, 'New User ID cannot be empty.', 'error');
    return;
  }
  if (!pw) {
    setBanner(banner, 'Password is required to confirm this change.', 'error');
    return;
  }
  if (pw !== 'admin') {
    // In production this check is done server-side on the ESP32
    setBanner(banner, 'Incorrect password. User ID not updated.', 'error');
    return;
  }

  // Update the displayed current User ID and clear the form
  document.getElementById('ac-current-userid').value = newId;
  document.getElementById('ac-new-userid').value     = '';
  document.getElementById('ac-userid-pw').value      = '';
  setBanner(banner, 'User ID updated successfully.', 'success');
});

// ── Change Password ───────────────────────────────────────────────────────────
// Validates minimum length and that new password matches confirmation.

document.getElementById('ac-update-pw-btn').addEventListener('click', () => {
  const cur    = document.getElementById('ac-current-pw').value;
  const nw     = document.getElementById('ac-new-pw').value;
  const conf   = document.getElementById('ac-confirm-pw').value;
  const banner = document.getElementById('ac-pw-banner');

  if (!cur) {
    setBanner(banner, 'Current password is required.', 'error');
    return;
  }
  if (nw.length < 6) {
    setBanner(banner, 'New password must be at least 6 characters.', 'error');
    return;
  }
  if (nw !== conf) {
    setBanner(banner, 'New password and confirmation do not match.', 'error');
    return;
  }

  setBanner(banner, 'Password updated successfully.', 'success');
  ['ac-current-pw', 'ac-new-pw', 'ac-confirm-pw'].forEach(id => {
    document.getElementById(id).value = '';
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────
// Opens a confirmation modal; on confirm, hides the app and shows the login screen.

document.getElementById('ac-logout-btn').addEventListener('click', () => openModal('modal-logout'));

document.getElementById('logout-confirm-btn').addEventListener('click', () => {
  closeModal('modal-logout');
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-page').classList.add('active');
  // Clear login form for the next session
  document.getElementById('machine-id-input').value = '';
  document.getElementById('password-input').value   = '';
});

// ═════════════════════════════════════════════════════════════════════════════
// CONFIG BACKUP PAGE
// ═════════════════════════════════════════════════════════════════════════════

// ── Mock Configuration Object ─────────────────────────────────────────────────
// Represents the device's current configuration snapshot.

const MOCK_CONFIG = {
  device:  'ESP32-Gateway',
  version: '2.4.1',
  network: { mode: '4G_LTE', ip: '10.0.1.42' },
  mqtt:    { broker: 'mqtt.example.com', port: 1883, topic: 'gateway/data' },
  modbus:  { enabled: true, baudRate: 9600 },
  logging: { local: true, sdCard: true, syncInterval: 60 },
};

// ── Export Configuration ──────────────────────────────────────────────────────
// Serialises MOCK_CONFIG to a downloadable JSON file.

document.getElementById('cfg-export-btn').addEventListener('click', () => {
  const json = JSON.stringify(MOCK_CONFIG, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'esp32-gateway-config.json';
  a.click();
  URL.revokeObjectURL(url);

  const banner = document.getElementById('cfg-export-banner');
  setBanner(banner, 'Configuration exported successfully.', 'success');
});

// ── Import Configuration ──────────────────────────────────────────────────────
// Validates the uploaded file is valid JSON before accepting it.

document.getElementById('cfg-import-btn').addEventListener('click', () => {
  document.getElementById('cfg-import-input').click();
});

document.getElementById('cfg-import-input').addEventListener('change', function() {
  const file   = this.files[0];
  if (!file) return;

  const nameEl = document.getElementById('cfg-import-filename');
  const banner = document.getElementById('cfg-import-banner');
  nameEl.textContent = file.name;
  show('cfg-import-filename');
  banner.classList.add('hidden');

  // Reject non-JSON files immediately
  if (!file.name.endsWith('.json')) {
    setBanner(banner, 'Invalid file type. Please upload a .json configuration file.', 'error');
    hide('cfg-import-filename');
    this.value = '';
    return;
  }

  // Parse and validate JSON content
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      JSON.parse(ev.target.result);
      setBanner(banner,
        `"${file.name}" validated successfully. Applying configuration — device will reboot shortly.`,
        'success');
    } catch {
      setBanner(banner, 'Invalid JSON. The file could not be parsed.', 'error');
      hide('cfg-import-filename');
    }
  };
  reader.readAsText(file);
  this.value = '';
});
