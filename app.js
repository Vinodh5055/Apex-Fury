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

  // Data Acquisition timing state
  dataAcquisition: {
    timing: { pollInterval: 1000, requestDelay: 50, timeout: 500 }
  },

  // I/O table data
  analogInputs: [
    { pin: 'AI-0', key: 'Pressure_1', slope: '1',    offset: '0',    invert: false, cloud: true, log: true },
    { pin: 'AI-1', key: 'pH_Level',   slope: '0.01', offset: '-0.5', invert: false, cloud: true, log: true },
  ],
  digitalConfigs: [
    { index: '0', alias: 'Pump_Run',   pin: 'DO-0', defaultState: 'OFF', retain: true,  cloud: false, log: false },
    { index: '1', alias: 'Alarm_Horn', pin: 'DO-1', defaultState: 'OFF', retain: false, cloud: false, log: false },
  ],
  digitalInputs: [
    { index: 0, alias: 'DI_0', pin: 'DI-0', default_state: 0, invert: false, cloud: false, log_enabled: false },
    { index: 1, alias: 'DI_1', pin: 'DI-1', default_state: 0, invert: false, cloud: false, log_enabled: false },
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
  const day  = 24 * 60 * 60 * 1000;
  return [
    { id: 1,  timestamp: new Date(now -  0*60000).toISOString(),       category: 'system',  message: 'Device boot completed' },
    { id: 2,  timestamp: new Date(now -  1*60000).toISOString(),       category: 'network', message: 'WiFi connected to FactoryWiFi-5G' },
    { id: 3,  timestamp: new Date(now -  3*60000).toISOString(),       category: 'modbus',  message: 'Slave 1 poll OK — 2 tags read' },
    { id: 4,  timestamp: new Date(now -  5*60000).toISOString(),       category: 'io',      message: 'DI0 rising edge detected' },
    { id: 5,  timestamp: new Date(now -  7*60000).toISOString(),       category: 'modbus',  message: 'Slave 2 timeout — retrying' },
    { id: 6,  timestamp: new Date(now - 1*day - 10*60000).toISOString(), category: 'system',  message: 'NTP sync successful' },
    { id: 7,  timestamp: new Date(now - 1*day - 20*60000).toISOString(), category: 'network', message: 'MQTT broker reconnected' },
    { id: 8,  timestamp: new Date(now - 1*day - 30*60000).toISOString(), category: 'io',      message: 'DO2 set HIGH by rule' },
    { id: 9,  timestamp: new Date(now - 2*day -  5*60000).toISOString(), category: 'modbus',  message: 'Slave 1 poll OK — 2 tags read' },
    { id: 10, timestamp: new Date(now - 2*day - 15*60000).toISOString(), category: 'system',  message: 'Config saved to flash' },
    { id: 11, timestamp: new Date(now - 2*day - 25*60000).toISOString(), category: 'network', message: '4G signal strength: -78 dBm' },
    { id: 12, timestamp: new Date(now - 3*day -  5*60000).toISOString(), category: 'modbus',  message: 'Slave 2 poll OK — 3 tags read' },
    { id: 13, timestamp: new Date(now - 3*day - 15*60000).toISOString(), category: 'io',      message: 'AI0 value: 3.72 V' },
    { id: 14, timestamp: new Date(now - 3*day - 25*60000).toISOString(), category: 'system',  message: 'Watchdog reset cleared' },
    { id: 15, timestamp: new Date(now - 4*day -  5*60000).toISOString(), category: 'network', message: 'HTTP sync uploaded 12 records' },
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
  renderDigitalInputTable();
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
  // Exact icons from uploaded SVG files
  { id: 'Dashboard', label: 'Dashboard', icon: '<path d="M13.2492 8.09153V4.40878C13.2492 4.14778 13.3361 3.93111 13.51 3.75878C13.6838 3.58628 13.8991 3.50003 14.156 3.50003H19.5965C19.8535 3.50003 20.0681 3.58628 20.2405 3.75878C20.413 3.93111 20.4992 4.14778 20.4992 4.40878V8.09153C20.4992 8.35236 20.4123 8.56895 20.2385 8.74128C20.0646 8.91378 19.8493 9.00003 19.5925 9.00003H14.152C13.895 9.00003 13.6803 8.91378 13.508 8.74128C13.3355 8.56895 13.2492 8.35236 13.2492 8.09153ZM3.49922 11.6V4.39978C3.49922 4.14478 3.58614 3.93111 3.75997 3.75878C3.9338 3.58628 4.14914 3.50003 4.40597 3.50003H9.84647C10.1035 3.50003 10.3181 3.58628 10.4905 3.75878C10.663 3.93128 10.7492 4.14503 10.7492 4.40003V11.6003C10.7492 11.8553 10.6623 12.0689 10.4885 12.2413C10.3146 12.4138 10.0993 12.5 9.84247 12.5H4.40197C4.14497 12.5 3.93031 12.4138 3.75797 12.2413C3.58547 12.0688 3.49922 11.855 3.49922 11.6ZM13.2492 19.6V12.3998C13.2492 12.1448 13.3361 11.9311 13.51 11.7588C13.6838 11.5863 13.8991 11.5 14.156 11.5H19.5965C19.8535 11.5 20.0681 11.5863 20.2405 11.7588C20.413 11.9313 20.4992 12.145 20.4992 12.4V19.6003C20.4992 19.8553 20.4123 20.0689 20.2385 20.2413C20.0646 20.4138 19.8493 20.5 19.5925 20.5H14.152C13.895 20.5 13.6803 20.4138 13.508 20.2413C13.3355 20.0688 13.2492 19.855 13.2492 19.6ZM3.49922 19.5913V15.9085C3.49922 15.6477 3.58614 15.4311 3.75997 15.2588C3.9338 15.0863 4.14914 15 4.40597 15H9.84647C10.1035 15 10.3181 15.0863 10.4905 15.2588C10.663 15.4311 10.7492 15.6477 10.7492 15.9085V19.5913C10.7492 19.8523 10.6623 20.0689 10.4885 20.2413C10.3146 20.4138 10.0993 20.5 9.84247 20.5H4.40197C4.14497 20.5 3.93031 20.4138 3.75797 20.2413C3.58547 20.0689 3.49922 19.8523 3.49922 19.5913ZM4.99922 11H9.24922V5.00003H4.99922V11ZM14.7492 19H18.9992V13H14.7492V19ZM14.7492 7.50003H18.9992V5.00003H14.7492V7.50003ZM4.99922 19H9.24922V16.5H4.99922V19Z" fill="#F1F5F9"/>' },
  { id: 'Network', label: 'Network', icon: '<path d="M8.125 21.2125C6.90833 20.6875 5.84583 19.9708 4.9375 19.0625C4.02917 18.1542 3.3125 17.0917 2.7875 15.875C2.2625 14.6583 2 13.3625 2 11.9875C2 10.6125 2.2625 9.32083 2.7875 8.1125C3.3125 6.90417 4.02917 5.84583 4.9375 4.9375C5.84583 4.02917 6.90833 3.3125 8.125 2.7875C9.34167 2.2625 10.6375 2 12.0125 2C13.3875 2 14.6792 2.2625 15.8875 2.7875C17.0958 3.3125 18.1542 4.02917 19.0625 4.9375C19.9708 5.84583 20.6875 6.90417 21.2125 8.1125C21.7375 9.32083 22 10.6125 22 11.9875C22 13.3625 21.7375 14.6583 21.2125 15.875C20.6875 17.0917 19.9708 18.1542 19.0625 19.0625C18.1542 19.9708 17.0958 20.6875 15.8875 21.2125C14.6792 21.7375 13.3875 22 12.0125 22C10.6375 22 9.34167 21.7375 8.125 21.2125ZM12 19.95C12.4333 19.35 12.8083 18.725 13.125 18.075C13.4417 17.425 13.7 16.7333 13.9 16H10.1C10.3 16.7333 10.5583 17.425 10.875 18.075C11.1917 18.725 11.5667 19.35 12 19.95ZM9.4 19.55C9.1 19 8.8375 18.4292 8.6125 17.8375C8.3875 17.2458 8.2 16.6333 8.05 16H5.1C5.58333 16.8333 6.1875 17.5583 6.9125 18.175C7.6375 18.7917 8.46667 19.25 9.4 19.55ZM14.6 19.55C15.5333 19.25 16.3625 18.7917 17.0875 18.175C17.8125 17.5583 18.4167 16.8333 18.9 16H15.95C15.8 16.6333 15.6125 17.2458 15.3875 17.8375C15.1625 18.4292 14.9 19 14.6 19.55ZM4.25 14H7.65C7.6 13.6667 7.5625 13.3375 7.5375 13.0125C7.5125 12.6875 7.5 12.35 7.5 12C7.5 11.65 7.5125 11.3125 7.5375 10.9875C7.5625 10.6625 7.6 10.3333 7.65 10H4.25C4.16667 10.3333 4.10417 10.6625 4.0625 10.9875C4.02083 11.3125 4 11.65 4 12C4 12.35 4.02083 12.6875 4.0625 13.0125C4.10417 13.3375 4.16667 13.6667 4.25 14ZM9.65 14H14.35C14.4 13.6667 14.4375 13.3375 14.4625 13.0125C14.4875 12.6875 14.5 12.35 14.5 12C14.5 11.65 14.4875 11.3125 14.4625 10.9875C14.4375 10.6625 14.4 10.3333 14.35 10H9.65C9.6 10.3333 9.5625 10.6625 9.5375 10.9875C9.5125 11.3125 9.5 11.65 9.5 12C9.5 12.35 9.5125 12.6875 9.5375 13.0125C9.5625 13.3375 9.6 13.6667 9.65 14ZM16.35 14H19.75C19.8333 13.6667 19.8958 13.3375 19.9375 13.0125C19.9792 12.6875 20 12.35 20 12C20 11.65 19.9792 11.3125 19.9375 10.9875C19.8958 10.6625 19.8333 10.3333 19.75 10H16.35C16.4 10.3333 16.4375 10.6625 16.4625 10.9875C16.4875 11.3125 16.5 11.65 16.5 12C16.5 12.35 16.4875 12.6875 16.4625 13.0125C16.4375 13.3375 16.4 13.6667 16.35 14ZM15.95 8H18.9C18.4167 7.16667 17.8125 6.44167 17.0875 5.825C16.3625 5.20833 15.5333 4.75 14.6 4.45C14.9 5 15.1625 5.57083 15.3875 6.1625C15.6125 6.75417 15.8 7.36667 15.95 8ZM10.1 8H13.9C13.7 7.26667 13.4417 6.575 13.125 5.925C12.8083 5.275 12.4333 4.65 12 4.05C11.5667 4.65 11.1917 5.275 10.875 5.925C10.5583 6.575 10.3 7.26667 10.1 8ZM5.1 8H8.05C8.2 7.36667 8.3875 6.75417 8.6125 6.1625C8.8375 5.57083 9.1 5 9.4 4.45C8.46667 4.75 7.6375 5.20833 6.9125 5.825C6.1875 6.44167 5.58333 7.16667 5.1 8Z" fill="#F1F5F9"/>' },
  { id: 'MQTT', label: 'MQTT', icon: '<path d="M6.5 20C4.98333 20 3.6875 19.475 2.6125 18.425C1.5375 17.375 1 16.0917 1 14.575C1 13.275 1.39167 12.1167 2.175 11.1C2.95833 10.0833 3.98333 9.43333 5.25 9.15C5.66667 7.61667 6.5 6.375 7.75 5.425C9 4.475 10.4167 4 12 4C13.95 4 15.6042 4.67917 16.9625 6.0375C18.3208 7.39583 19 9.05 19 11C20.15 11.1333 21.1042 11.6292 21.8625 12.4875C22.6208 13.3458 23 14.35 23 15.5C23 16.75 22.5625 17.8125 21.6875 18.6875C20.8125 19.5625 19.75 20 18.5 20H6.5ZM6.5 18H18.5C19.2 18 19.7917 17.7583 20.275 17.275C20.7583 16.7917 21 16.2 21 15.5C21 14.8 20.7583 14.2083 20.275 13.725C19.7917 13.2417 19.2 13 18.5 13H17V11C17 9.61667 16.5125 8.4375 15.5375 7.4625C14.5625 6.4875 13.3833 6 12 6C10.6167 6 9.4375 6.4875 8.4625 7.4625C7.4875 8.4375 7 9.61667 7 11H6.5C5.53333 11 4.70833 11.3417 4.025 12.025C3.34167 12.7083 3 13.5333 3 14.5C3 15.4667 3.34167 16.2917 4.025 16.975C4.70833 17.6583 5.53333 18 6.5 18Z" fill="#F1F5F9"/>' },
  { id: 'Modbus', label: 'Data Acquisition', icon: '<path d="M9 15V9H15V15H9ZM11 13H13V11H11V13ZM9 21V19H7C6.45 19 5.97917 18.8042 5.5875 18.4125C5.19583 18.0208 5 17.55 5 17V15H3V13H5V11H3V9H5V7C5 6.45 5.19583 5.97917 5.5875 5.5875C5.97917 5.19583 6.45 5 7 5H9V3H11V5H13V3H15V5H17C17.55 5 18.0208 5.19583 18.4125 5.5875C18.8042 5.97917 19 6.45 19 7V9H21V11H19V13H21V15H19V17C19 17.55 18.8042 18.0208 18.4125 18.4125C18.0208 18.8042 17.55 19 17 19H15V21H13V19H11V21H9ZM17 17V7H7V17H17Z" fill="#F1F5F9"/>' },
  { id: 'DataLogging', label: 'Data Logging', icon: '<path d="M12 21C9.48333 21 7.35417 20.6125 5.6125 19.8375C3.87083 19.0625 3 18.1167 3 17V7C3 5.9 3.87917 4.95833 5.6375 4.175C7.39583 3.39167 9.51667 3 12 3C14.4833 3 16.6042 3.39167 18.3625 4.175C20.1208 4.95833 21 5.9 21 7V17C21 18.1167 20.1292 19.0625 18.3875 19.8375C16.6458 20.6125 14.5167 21 12 21ZM12 9.025C13.4833 9.025 14.975 8.8125 16.475 8.3875C17.975 7.9625 18.8167 7.50833 19 7.025C18.8167 6.54167 17.9792 6.08333 16.4875 5.65C14.9958 5.21667 13.5 5 12 5C10.4833 5 8.99583 5.2125 7.5375 5.6375C6.07917 6.0625 5.23333 6.525 5 7.025C5.23333 7.525 6.07917 7.98333 7.5375 8.4C8.99583 8.81667 10.4833 9.025 12 9.025ZM12 14C12.7 14 13.375 13.9667 14.025 13.9C14.675 13.8333 15.2958 13.7375 15.8875 13.6125C16.4792 13.4875 17.0375 13.3333 17.5625 13.15C18.0875 12.9667 18.5667 12.7583 19 12.525V9.525C18.5667 9.75833 18.0875 9.96667 17.5625 10.15C17.0375 10.3333 16.4792 10.4875 15.8875 10.6125C15.2958 10.7375 14.675 10.8333 14.025 10.9C13.375 10.9667 12.7 11 12 11C11.3 11 10.6167 10.9667 9.95 10.9C9.28333 10.8333 8.65417 10.7375 8.0625 10.6125C7.47083 10.4875 6.91667 10.3333 6.4 10.15C5.88333 9.96667 5.41667 9.75833 5 9.525V12.525C5.41667 12.7583 5.88333 12.9667 6.4 13.15C6.91667 13.3333 7.47083 13.4875 8.0625 13.6125C8.65417 13.7375 9.28333 13.8333 9.95 13.9C10.6167 13.9667 11.3 14 12 14ZM12 19C12.7667 19 13.5458 18.9417 14.3375 18.825C15.1292 18.7083 15.8583 18.5542 16.525 18.3625C17.1917 18.1708 17.75 17.9542 18.2 17.7125C18.65 17.4708 18.9167 17.225 19 16.975V14.525C18.5667 14.7583 18.0875 14.9667 17.5625 15.15C17.0375 15.3333 16.4792 15.4875 15.8875 15.6125C15.2958 15.7375 14.675 15.8333 14.025 15.9C13.375 15.9667 12.7 16 12 16C11.3 16 10.6167 15.9667 9.95 15.9C9.28333 15.8333 8.65417 15.7375 8.0625 15.6125C7.47083 15.4875 6.91667 15.3333 6.4 15.15C5.88333 14.9667 5.41667 14.7583 5 14.525V17C5.08333 17.25 5.34583 17.4917 5.7875 17.725C6.22917 17.9583 6.78333 18.1708 7.45 18.3625C8.11667 18.5542 8.85 18.7083 9.65 18.825C10.45 18.9417 11.2333 19 12 19Z" fill="#F1F5F9"/>' },
  { id: 'Firmware', label: 'System', icon: '<path d="M12 16L7 11L8.4 9.55L11 12.15V4H13V12.15L15.6 9.55L17 11L12 16ZM6 20C5.45 20 4.97917 19.8042 4.5875 19.4125C4.19583 19.0208 4 18.55 4 18V15H6V18H18V15H20V18C20 18.55 19.8042 19.0208 19.4125 19.4125C19.0208 19.8042 18.55 20 18 20H6Z" fill="#F1F5F9"/>' },
  { id: 'AccessControl', label: 'Access Control', icon: '<path d="M6 22C5.45 22 4.97917 21.8042 4.5875 21.4125C4.19583 21.0208 4 20.55 4 20V10C4 9.45 4.19583 8.97917 4.5875 8.5875C4.97917 8.19583 5.45 8 6 8H7V6C7 4.61667 7.4875 3.4375 8.4625 2.4625C9.4375 1.4875 10.6167 1 12 1C13.3833 1 14.5625 1.4875 15.5375 2.4625C16.5125 3.4375 17 4.61667 17 6V8H18C18.55 8 19.0208 8.19583 19.4125 8.5875C19.8042 8.97917 20 9.45 20 10V20C20 20.55 19.8042 21.0208 19.4125 21.4125C19.0208 21.8042 18.55 22 18 22H6ZM6 20H18V10H6V20ZM13.4125 16.4125C13.8042 16.0208 14 15.55 14 15C14 14.45 13.8042 13.9792 13.4125 13.5875C13.0208 13.1958 12.55 13 12 13C11.45 13 10.9792 13.1958 10.5875 13.5875C10.1958 13.9792 10 14.45 10 15C10 15.55 10.1958 16.0208 10.5875 16.4125C10.9792 16.8042 11.45 17 12 17C12.55 17 13.0208 16.8042 13.4125 16.4125ZM9 8H15V6C15 5.16667 14.7083 4.45833 14.125 3.875C13.5417 3.29167 12.8333 3 12 3C11.1667 3 10.4583 3.29167 9.875 3.875C9.29167 4.45833 9 5.16667 9 6V8Z" fill="#F1F5F9"/>' },
  { id: 'ConfigBackup', label: 'Config Backup', icon: '<path d="M5 22C4.45 22 3.97917 21.8042 3.5875 21.4125C3.19583 21.0208 3 20.55 3 20V8.725C2.7 8.54167 2.45833 8.30417 2.275 8.0125C2.09167 7.72083 2 7.38333 2 7V4C2 3.45 2.19583 2.97917 2.5875 2.5875C2.97917 2.19583 3.45 2 4 2H20C20.55 2 21.0208 2.19583 21.4125 2.5875C21.8042 2.97917 22 3.45 22 4V7C22 7.38333 21.9083 7.72083 21.725 8.0125C21.5417 8.30417 21.3 8.54167 21 8.725V20C21 20.55 20.8042 21.0208 20.4125 21.4125C20.0208 21.8042 19.55 22 19 22H5ZM5 9V20H19V9H5ZM4 7H20V4H4V7ZM9 14H15V12H9V14Z" fill="#F1F5F9"/>' },
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

// I/O page (now embedded in Data Acquisition page)
setupFormButtons('io-reset-btn', 'io-save-btn', 'io-save-banner', () => {
  state.analogInputs  = [
    { pin: 'AI-0', key: 'Pressure_1', slope: '1',    offset: '0',    invert: false, cloud: true, log: true },
    { pin: 'AI-1', key: 'pH_Level',   slope: '0.01', offset: '-0.5', invert: false, cloud: true, log: true },
  ];
  state.digitalConfigs = [
    { index: '0', alias: 'Pump_Run',   pin: 'DO-0', defaultState: 'OFF', retain: true,  cloud: false, log: false },
    { index: '1', alias: 'Alarm_Horn', pin: 'DO-1', defaultState: 'OFF', retain: false, cloud: false, log: false },
  ];
  state.digitalInputs = [
    { index: 0, alias: 'DI_0', pin: 'DI-0', default_state: 0, invert: false, cloud: false, log_enabled: false },
    { index: 1, alias: 'DI_1', pin: 'DI-1', default_state: 0, invert: false, cloud: false, log_enabled: false },
  ];
  renderAnalogTable();
  renderDigitalTable();
  renderDigitalInputTable();
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

// ── Timing Config Bindings ────────────────────────────────────────────────────
// Sync the shared Timing Config inputs to state.dataAcquisition.timing

document.getElementById('da-poll-interval').addEventListener('input', function() {
  state.dataAcquisition.timing.pollInterval = parseInt(this.value) || 0;
});
document.getElementById('da-request-delay').addEventListener('input', function() {
  state.dataAcquisition.timing.requestDelay = parseInt(this.value) || 0;
});
document.getElementById('da-timeout').addEventListener('input', function() {
  state.dataAcquisition.timing.timeout = parseInt(this.value) || 0;
});

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
  const tbody = document.getElementById('da-analog-tbody');
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
  const tbody = document.getElementById('da-digital-tbody');
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
      <td><div class="toggle-mini ${cfg.retain ? 'on' : ''}" data-di="${i}" data-field="retain"><div class="toggle-mini-knob"></div></div></td>
      <td><div class="toggle-mini ${cfg.cloud  ? 'on' : ''}" data-di="${i}" data-field="cloud" ><div class="toggle-mini-knob"></div></div></td>
      <td><div class="toggle-mini ${cfg.log    ? 'on' : ''}" data-di="${i}" data-field="log"   ><div class="toggle-mini-knob"></div></div></td>`;
    tbody.appendChild(tr);

    // Sync inline Alias input to state
    tr.querySelector('.io-inline-input').addEventListener('input', function() {
      state.digitalConfigs[this.dataset.di].alias = this.value;
    });

    // Sync Default State dropdown to state
    tr.querySelector('select').addEventListener('change', function() {
      state.digitalConfigs[this.dataset.di].defaultState = this.value;
    });

    // Sync all toggles to state
    tr.querySelectorAll('.toggle-mini').forEach(t => {
      t.addEventListener('click', function() {
        this.classList.toggle('on');
        state.digitalConfigs[this.dataset.di][this.dataset.field] = this.classList.contains('on');
      });
    });
  });
}

// ── Digital Input (DI) Table ──────────────────────────────────────────────────
// Renders state.digitalInputs into an editable HTML table.

function renderDigitalInputTable() {
  const tbody = document.getElementById('da-di-tbody');
  tbody.innerHTML = '';

  state.digitalInputs.forEach((di, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${di.index}</td>
      <td><input class="io-inline-input" value="${di.alias}" data-dii="${i}" data-field="alias"/></td>
      <td>${di.pin}</td>
      <td>
        <div class="io-select-wrap" style="position:relative">
          <select data-dii="${i}" data-field="default_state">
            <option value="0" ${di.default_state === 0 ? 'selected' : ''}>LOW</option>
            <option value="1" ${di.default_state === 1 ? 'selected' : ''}>HIGH</option>
          </select>
          <svg style="position:absolute;right:6px;top:50%;transform:translateY(-50%) rotate(180deg);pointer-events:none"
               width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M6.37 8L11.27 12.9a.74.74 0 010 1.05.74.74 0 01-1.05 0L4.95 8.95A1.5 1.5 0 014.55 8c0-.18.03-.34.1-.5.07-.17.17-.32.3-.45l5.13-5.13a.74.74 0 011.05 0 .74.74 0 010 1.05L6.37 8z" fill="#A2A0A9"/>
          </svg>
        </div>
      </td>
      <td><div class="toggle-mini ${di.invert      ? 'on' : ''}" data-dii="${i}" data-field="invert"     ><div class="toggle-mini-knob"></div></div></td>
      <td><div class="toggle-mini ${di.cloud       ? 'on' : ''}" data-dii="${i}" data-field="cloud"      ><div class="toggle-mini-knob"></div></div></td>
      <td><div class="toggle-mini ${di.log_enabled ? 'on' : ''}" data-dii="${i}" data-field="log_enabled"><div class="toggle-mini-knob"></div></div></td>`;
    tbody.appendChild(tr);

    // Sync inline Alias input to state
    tr.querySelector('.io-inline-input').addEventListener('input', function() {
      state.digitalInputs[this.dataset.dii].alias = this.value;
    });

    // Sync Default State dropdown to state
    tr.querySelector('select').addEventListener('change', function() {
      state.digitalInputs[this.dataset.dii].default_state = parseInt(this.value);
    });

    // Sync all toggles to state
    tr.querySelectorAll('.toggle-mini').forEach(t => {
      t.addEventListener('click', function() {
        this.classList.toggle('on');
        state.digitalInputs[this.dataset.dii][this.dataset.field] = this.classList.contains('on');
      });
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

// ── Log Renderer ──────────────────────────────────────────────────────────────

/**
 * Re-render the log viewer showing only unique dates that contain logs.
 */
function renderLogs() {
  const container = document.getElementById('log-date-list');
  if (!container) return;

  // Collect unique dates (YYYY-MM-DD) from all logs
  const uniqueDates = [...new Set(
    state.logs.map(l => l.timestamp.slice(0, 10))
  )].sort((a, b) => b.localeCompare(a)); // newest first

  container.innerHTML = '';

  if (uniqueDates.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-sm-gray';
    empty.textContent = 'No log entries available.';
    container.appendChild(empty);
    return;
  }

  uniqueDates.forEach(date => {
    const div = document.createElement('div');
    div.className = 'log-row';
    div.innerHTML = `<span class="log-message">${date}</span>`;
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
