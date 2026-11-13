'use strict';
// Controller support for Xbox Cloud Gaming on Batocera.
//  - Everywhere: hold View + Menu to exit (Select + Start, Share/Create +
//    Options, or - and + depending on the controller). Holding Esc on a
//    keyboard also exits; that's handled in main.js.
//  - Start screen: shows the exit buttons named for the connected controller;
//    Menu (Start) opens Settings.
//  - On Xbox: hold Menu alone, or the S key, for 1 second to come back to
//    the welcome screen.
//  - Settings screen: D-pad moves / changes, A selects, B cancels, Menu saves.
//  - Volume (Settings): sets the loudness of the page's sound.
//  - Microsoft sign-in pages (which have no controller support of their own):
//      D-pad / left stick  move between buttons and boxes
//      A                   press the button, or open the keyboard on a text box
//      B                   go back
//  - On-screen keyboard:
//      D-pad / stick  choose a key     A  type it      X  delete
//      Y              shift            B  close        Menu (Start)  done + continue
// xbox.com/play has its own controller support, so on xbox.com this only
// watches for the exit combo and leaves everything else to the page.
const { ipcRenderer, webFrame } = require('electron');

let EXIT_HOLD_MS = 2000;
// light up on-screen keys when typing on a real keyboard (config.json: keyboard_highlight)
let KEY_HIGHLIGHT = true;
// the app's sound level, 0-100 (config.json: volume, set on the Settings screen)
let VOLUME = 100;
// the app's own text in the chosen language (Settings > Language); English
// until the app sends it
let TXT = {
  hintPad: 'D-pad to choose · {a} to select · {y} for "don\'t show again" · {menu} for Settings',
  pressAny: 'Press any button on your controller to show its buttons', controller: 'Controller: {name}', connected: 'connected',
  holdExit: 'Keep holding to exit…', padGone: 'Controller disconnected. Reconnect it to keep playing', padBack: 'Controller connected', homeBtn: 'Back to Xbox Cloud Gaming', homeHint: '{view} button or Home key', kShift: 'Shift', kSpace: 'Space', kDel: 'Delete', kDone: 'Done', kHide: 'Hide', kText: 'Text'
};
let FONT_CSS = '', FONT_STACK = 'sans-serif';
function setText(i) {
  if (!i || !i.text) return;
  TXT = Object.assign({}, TXT, i.text);
  FONT_STACK = i.fontStack || FONT_STACK;
  if (i.fontCss && i.fontCss !== FONT_CSS) {
    FONT_CSS = i.fontCss;
    // Japanese / Korean letters for the keyboard and messages on this page
    const add = () => {
      const st = document.createElement('style');
      st.setAttribute('data-xcloud', 'font');
      st.textContent = FONT_CSS;
      (document.head || document.documentElement).appendChild(st);
    };
    if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add);
  }
}
let STREAM_JS = '';   // the stream options (resolution, sharpening, stats, vibration), from the app
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
try {
  const c = ipcRenderer.sendSync('xcloud-config') || {};
  EXIT_HOLD_MS = c.exitHoldMs || EXIT_HOLD_MS;
  KEY_HIGHLIGHT = c.keyHighlight !== false;
  PAD_FIX_ON = c.padFix !== false;
  if (Number.isFinite(c.volume)) VOLUME = Math.min(100, Math.max(0, c.volume));
  setText(c.i18n);
  STREAM_JS = c.stream || '';
} catch (e) { /* use defaults */ }

const ON_XBOX = /(^|\.)xbox\.com$/i.test(location.hostname);
// the Xbox Cloud Gaming dashboard itself (games handle the controller there);
// every other page (sign-in, account, Game Pass sign-up) gets the app's
// controller navigation and a Home button
const ON_DASH = /^play\.xbox\.com$/i.test(location.hostname);
const ON_WEB_PAGE = location.protocol === 'https:' && !ON_DASH;
// the app's own screens (loaded from files): the start screen, and the
// "can't connect" page. Their keyboard and mouse handling is in the pages
// themselves; this script adds the controller.
const ON_APP_PAGE = location.protocol === 'file:' && /\/xcloud-(intro|error|settings|video|profiles|pin|prompt|picktip|message)\.html$/.test(location.pathname);
const ON_VIDEO = ON_APP_PAGE && /xcloud-video\.html$/.test(location.pathname);
const ON_INTRO = ON_APP_PAGE && /xcloud-intro\.html$/.test(location.pathname);
const ON_SETTINGS = ON_APP_PAGE && /xcloud-settings\.html$/.test(location.pathname);
// the profile screens (who's playing, the PIN pad, "set up profiles?"): like
// Settings, the controller presses the page's keys
const ON_KEY_PAGE = ON_APP_PAGE && /xcloud-(profiles|pin|prompt|picktip|message)\.html$/.test(location.pathname);
const ON_ERROR_PAGE = ON_APP_PAGE && !ON_INTRO && !ON_SETTINGS && !ON_VIDEO && !ON_KEY_PAGE;
// the intro video / welcome screen / Settings is showing on top of this page:
// leave the controller to it (main.js also hides the controller from the page)
let OVERLAY_UP = false;
ipcRenderer.on('xcloud-overlay', (e, up) => { OVERLAY_UP = !!up; });
// the language was changed in Settings
ipcRenderer.on('xcloud-lang', (e, i) => { setText(i); try { osk.render(); renderHome(); } catch (err) { /* not open */ } });
const ON_DATA_PAGE = ON_APP_PAGE; // (older name, used below)
const NAV_ON = !ON_DASH;

// Microsoft's sign-in pages read the controller themselves; the app does
// that here, so the page is kept from seeing it (from the very start; the app
// repeats this when the page has loaded)
const NO_PAD_JS = "(function(){\n  if (window.__xcloudNoPad) return;\n  window.__xcloudNoPad = 1;\n  var none = function () { return [null, null, null, null]; };\n  try { Object.defineProperty(Navigator.prototype, 'getGamepads', { value: none, configurable: true, writable: true }); } catch (e) {}\n  try { Object.defineProperty(navigator, 'getGamepads', { value: none, configurable: true, writable: true }); } catch (e) {}\n  var add = EventTarget.prototype.addEventListener;\n  EventTarget.prototype.addEventListener = function (t) {\n    if (t === 'gamepadconnected' || t === 'gamepaddisconnected') return;\n    return add.apply(this, arguments);\n  };\n  try { Object.defineProperty(window, 'ongamepadconnected', { get: function () { return null; }, set: function () {}, configurable: true }); } catch (e) {}\n})();";
if (ON_WEB_PAGE) { try { webFrame.executeJavaScript(NO_PAD_JS); } catch (e) { /* the app adds it on load */ } }
const PAD_EVENTS_JS = "(function(){\n  if (window.__xcloudPadEvents) return;\n  window.__xcloudPadEvents = 1;\n  // \"controller connected\" messages carry the controller too: the page gets\n  // it the way getGamepads shows it (a Steam controller as an Xbox one).\n  var GP = { gamepadconnected: 1, gamepaddisconnected: 1 };\n  function show(p) { try { return window.__xcloudShowPad ? window.__xcloudShowPad(p) : p; } catch (e) { return p; } }\n  function wrapEvent(e) {\n    // (a stand-in target: the real event's own fields can't be changed through a Proxy of it)\n    return new Proxy(Object.create(Object.getPrototypeOf(e)), { get: function (_, k) {\n      if (k === 'gamepad') return show(e.gamepad);\n      var v = e[k]; return typeof v === 'function' ? v.bind(e) : v;\n    } });\n  }\n  var wrapped = new WeakMap();\n  function wrapperOf(fn, make) {\n    if (!fn || (typeof fn !== 'function' && typeof fn.handleEvent !== 'function')) return fn;\n    var w = wrapped.get(fn);\n    if (!w && make) {\n      w = function (e) { var x = wrapEvent(e); return typeof fn === 'function' ? fn.call(this, x) : fn.handleEvent(x); };\n      wrapped.set(fn, w);\n    }\n    return w || fn;\n  }\n  var add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;\n  EventTarget.prototype.addEventListener = function (t, fn) {\n    if (GP[t] && this === window) { var a = Array.prototype.slice.call(arguments); a[1] = wrapperOf(fn, true); return add.apply(this, a); }\n    return add.apply(this, arguments);\n  };\n  EventTarget.prototype.removeEventListener = function (t, fn) {\n    if (GP[t] && this === window) { var a = Array.prototype.slice.call(arguments); a[1] = wrapperOf(fn, false); return rem.apply(this, a); }\n    return rem.apply(this, arguments);\n  };\n  ['ongamepadconnected', 'ongamepaddisconnected'].forEach(function (name) {\n    var h = null, t = name.slice(2);\n    function run(e) { if (h) h.call(window, wrapEvent(e)); }\n    try {\n      Object.defineProperty(window, name, { configurable: true,\n        get: function () { return h; },\n        set: function (f) { if (h) rem.call(window, t, run); h = typeof f === 'function' ? f : null; if (h) add.call(window, t, run); } });\n    } catch (e) { /* left as it is */ }\n  });\n})();";
if (ON_DASH) { try { webFrame.executeJavaScript(PAD_EVENTS_JS); } catch (e) { /* the app adds it on load */ } }
// the stream options, before the page's own scripts make their first request
if (STREAM_JS) { try { webFrame.executeJavaScript(STREAM_JS); } catch (e) { /* the app adds it on load */ } }

// write a line to /userdata/system/logs/xcloud-app.log (for troubleshooting)
function appLog(msg) { try { ipcRenderer.send('xcloud-log', String(msg)); } catch (e) { /* ignore */ } }

// ---------- exit tip (start screen) ----------
// The controller is handled here; keyboard (arrows, Enter, Space, X, Y),
// which controllers the app sees, for the log (a controller the browser
// doesn't know is put into the Xbox layout before Xbox sees it)
if (!ON_APP_PAGE) {
  window.addEventListener('gamepadconnected', e => {
    const p = e.gamepad;
    if (!p) return;
    appLog(`controller: "${p.id}" (${p.mapping === 'standard' ? 'standard layout' : `not a layout the browser knows: ${p.axes.length} axes, ${p.buttons.length} buttons${p.axes.length >= 6 ? ', put into the Xbox layout' : ''}`})`);
    // back after it dropped out: say so (the message about it going away is replaced)
    if (padLost) { padLost = false; clearTimeout(padLostTimer); toast(TXT.padBack, 2500); appLog('controller reconnected'); }
  });
  // a controller dropped out (battery, Bluetooth, cable): say so on screen,
  // unless another controller is still connected. A quick blip (under 1.5
  // seconds) isn't worth a message.
  let padLost = false, padLostTimer = null;
  window.addEventListener('gamepaddisconnected', e => {
    appLog(`controller disconnected: "${e.gamepad.id}"`);
    clearTimeout(padLostTimer);
    padLostTimer = setTimeout(() => {
      let any = false;
      try { for (const p of navigator.getGamepads()) if (p && p.connected) any = true; } catch (err) { /* ignore */ }
      if (any) return;
      padLost = true;
      toast(TXT.padGone, 8000);
    }, 1500);
  });
}
// Batocera's controller-to-keyboard mapping and the mouse are handled by
// the page's own script.
let introChosen = false;
function introChoose(never, how) {
  if (introChosen) return;
  introChosen = true;
  ipcRenderer.send('xcloud-continue', { never: !!never });
  // if the page is somehow still here after a few seconds, allow another try
  setTimeout(() => { introChosen = false; }, 3000);
}
function introButtons() {
  return ['go', 'never', 'settings'].map(id => document.getElementById(id)).filter(Boolean);
}
function introFocused() {
  const list = introButtons();
  if (!list.includes(document.activeElement) && list[0]) list[0].focus();
  return document.activeElement;
}
function introMove(step) {
  const list = introButtons();
  if (!list.length) return;
  const i = list.indexOf(introFocused());
  list[(i + step + list.length) % list.length].focus();
}
let settingsAsked = false;
function introSettings() {
  if (settingsAsked || introChosen) return;
  settingsAsked = true;
  ipcRenderer.send('xcloud-settings');
  setTimeout(() => { settingsAsked = false; }, 3000);
}
function introSelect(how) {
  const el = introFocused();
  if (el && el.id === 'settings') introSettings();
  else introChoose(el && el.id === 'never', how);
}
function introPress(b) {
  if (b === BTN.UP || b === BTN.LEFT) introMove(-1);
  else if (b === BTN.DOWN || b === BTN.RIGHT) introMove(1);
  else if (b === BTN.A) introSelect('controller');
  else if (b === BTN.Y) introChoose(true, 'controller');
}

// ---------- settings screen ----------
// The page's own script does the work; the controller just presses its keys.
function settingsKey(key) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}
function settingsPress(b) {
  const keys = { [BTN.UP]: 'ArrowUp', [BTN.DOWN]: 'ArrowDown', [BTN.LEFT]: 'ArrowLeft', [BTN.RIGHT]: 'ArrowRight', [BTN.A]: 'Enter', [BTN.B]: 'Escape' };
  if (keys[b]) settingsKey(keys[b]);
}
if (ON_SETTINGS) {
  document.addEventListener('DOMContentLoaded', () => appLog('settings screen shown'));
}

// ---------- Home: back to the dashboard from any other page ----------
// (Game Pass sign-up, Microsoft account pages, sign-in). A button at the top;
// the View button (Select / Share / -) or the Home key does the same.
let homeEl = null;
function goHome(how) {
  appLog(`home (${how}) from ${location.hostname}`);
  ipcRenderer.send('xcloud-home');
}
function homeLabel() {
  let pad = null;
  try { pad = Array.from(navigator.getGamepads ? navigator.getGamepads() : []).find(p => p && p.connected !== false) || null; } catch (e) { pad = null; }
  // this page may not see the controller yet (no button pressed on it, or a
  // sign-in page kept from it): use the last one the app saw instead
  let id = pad ? pad.id : '';
  if (!id) { try { id = ipcRenderer.sendSync('xcloud-last-pad') || ''; } catch (e) { id = ''; } }
  const view = PAD_STYLES[padStyle(id)].k1[1];
  return fill(TXT.homeHint, { view });
}
function showHome() {
  if (!ON_WEB_PAGE || homeEl || !document.body) return;
  homeEl = document.createElement('div');
  homeEl.setAttribute('data-xcloud', 'home');
  Object.assign(homeEl.style, {
    position: 'fixed', top: '14px', left: '50%', transform: 'translateX(-50%)', zIndex: '2147483646',
    background: 'rgba(16,16,16,0.94)', color: '#fff', border: `2px solid ${GREEN}`, borderRadius: '999px',
    padding: '8px 22px', font: `600 18px ${FONT_STACK}`, cursor: 'pointer', display: 'flex', alignItems: 'center',
    gap: '12px', boxShadow: '0 4px 18px rgba(0,0,0,.5)', userSelect: 'none'
  });
  homeEl.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); goHome('clicked'); }, true);
  document.body.appendChild(homeEl);
  renderHome();
}
function renderHome() {
  if (!homeEl) return;
  homeEl.innerHTML = '';
  const a = document.createElement('span'); a.textContent = `⌂ ${TXT.homeBtn}`;
  const b = document.createElement('span'); b.textContent = homeLabel();
  Object.assign(b.style, { fontWeight: '400', fontSize: '15px', color: '#9fd88a' });
  homeEl.append(a, b);
}
if (ON_WEB_PAGE) {
  document.addEventListener('DOMContentLoaded', showHome);
  window.addEventListener('load', showHome);
  setInterval(() => { if (!homeEl || !homeEl.isConnected) { homeEl = null; showHome(); } else renderHome(); }, 1500);
  window.addEventListener('keydown', e => {
    if (e.key === 'Home' && !e.ctrlKey && !e.altKey && !isTextBox(e.target)) { e.preventDefault(); goHome('Home key'); }
  }, true);
}

// ---------- mouse cursor ----------
// Hidden after 3 seconds without moving the mouse (so it doesn't sit in the
// middle of a game); it comes back as soon as the mouse moves.
(function cursorAutoHide() {
  const HIDE_AFTER = 3000;
  const style = document.createElement('style');
  style.setAttribute('data-xcloud', 'nocursor');
  style.textContent = '*{cursor:none !important}';
  let timer = null, hidden = false;
  const hide = () => {
    if (hidden) return;
    (document.head || document.documentElement).appendChild(style);
    hidden = true;
  };
  const wake = () => {
    if (hidden) { style.remove(); hidden = false; }
    clearTimeout(timer);
    timer = setTimeout(hide, HIDE_AFTER);
  };
  window.addEventListener('mousemove', wake, true);
  window.addEventListener('mousedown', wake, true);
  document.addEventListener('DOMContentLoaded', () => { clearTimeout(timer); timer = setTimeout(hide, HIDE_AFTER); });
})();

// ---------- volume ----------
// Applies the Settings screen's volume to every sound and video element the
// page plays (the game stream included). Checked whenever something starts
// playing or changes its own volume, and once a second as a backstop.
// (At 100% the page's own volume is left alone, unless it was just changed
// in Settings.) Mute in Settings is sent as volume 0.
let volumeSet = VOLUME < 100;
function applyVolume(el) {
  if (!volumeSet || !el || (el.tagName !== 'VIDEO' && el.tagName !== 'AUDIO')) return;
  const v = VOLUME / 100;
  try {
    if (Math.abs(el.volume - v) > 0.004) el.volume = v;
    // muted: also mute the element; unmuting only undoes what this did
    if (VOLUME === 0) { if (!el.muted) { el.muted = true; el.dataset.xcloudMuted = '1'; } }
    else if (el.dataset.xcloudMuted === '1') { el.muted = false; delete el.dataset.xcloudMuted; }
  } catch (e) { /* ignore */ }
}
if (!ON_APP_PAGE) {
  for (const ev of ['play', 'playing', 'loadedmetadata', 'volumechange']) {
    document.addEventListener(ev, e => applyVolume(e.target), true);
  }
  setInterval(() => { document.querySelectorAll('video,audio').forEach(applyVolume); }, 1000);
  if (volumeSet) document.addEventListener('DOMContentLoaded', () => appLog(VOLUME ? `volume set to ${VOLUME}%` : 'sound muted'));
  // a new volume, or mute, chosen in Settings
  ipcRenderer.on('xcloud-volume', (event, v) => {
    if (!Number.isFinite(v)) return;
    VOLUME = Math.min(100, Math.max(0, v));
    volumeSet = true;
    document.querySelectorAll('video,audio').forEach(applyVolume);
  });
}

if (ON_INTRO) {
  document.addEventListener('DOMContentLoaded', () => appLog('start screen shown'));
}

// ---------- which controller is connected (start screen) ----------
// The exit combo is always the same two buttons (standard buttons 8 and 9);
// only their names differ by controller. The browser reports each pad's name
// and USB/Bluetooth vendor and product IDs, e.g.
//   "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)"
// Xbox's View and Menu icons, drawn as pictures so they don't depend on
// which symbols Batocera's fonts include.
const ICON_VIEW = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="13" height="13" rx="1.5"/><path d="M8 20h11.5a1.5 1.5 0 0 0 1.5-1.5V8"/></svg>';
const ICON_MENU = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 6.5h16M4 12h16M4 17.5h16"/></svg>';

// a / y: what the bottom and top face buttons are called (standard buttons 0
// and 3).
const PAD_STYLES = {
  xbox:    { k1: [ICON_VIEW, 'View', false],   k2: [ICON_MENU, 'Menu', false],     a: 'A', y: 'Y' },
  ps4:     { k1: ['SHARE', 'Share', true],     k2: ['OPTIONS', 'Options', true],   a: '✕', y: '△' },
  ps5:     { k1: ['CREATE', 'Create', true],   k2: ['OPTIONS', 'Options', true],   a: '✕', y: '△' },
  generic: { k1: ['SELECT', 'Select', true],   k2: ['START', 'Start', true],       a: 'A', y: 'Y' }
};
const PS5_PRODUCTS = new Set(['0ce6', '0df2', '0e5f']); // DualSense, DualSense Edge, Access

function padStyle(id) {
  const s = String(id || '');
  const m = s.match(/Vendor:\s*([0-9a-f]{4})\s*Product:\s*([0-9a-f]{4})/i) || s.match(/^([0-9a-f]{4})-([0-9a-f]{4})-/i);
  const vendor = m ? m[1].toLowerCase() : '';
  const product = m ? m[2].toLowerCase() : '';
  // a Steam controller (Steam Deck, Steam Controller) has Xbox's buttons and
  // View / Menu, and is shown to Xbox as an Xbox controller
  if (vendor === '045e' || vendor === '28de' || /xbox|x-box|microsoft|steam deck|steam controller|valve/i.test(s)) return 'xbox';
  if (vendor === '054c' || /dualsense|dualshock|playstation|\bps[345]\b/i.test(s)) {
    return PS5_PRODUCTS.has(product) || /dualsense|\bps5\b/i.test(s) ? 'ps5' : 'ps4';
  }
  return 'generic';
}

function padName(id) {
  // drop the "(STANDARD GAMEPAD Vendor: ...)" part, and Linux-style "045e-0b13-" prefixes
  const name = String(id || '').replace(/\s*\([^)]*\)\s*$/, '').replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, '').trim();
  // Sony's PS4 pad just calls itself "Wireless Controller"
  if (/^wireless controller$/i.test(name) && padStyle(id) === 'ps4') return 'DualShock 4 (PlayStation 4)';
  return name;
}

// ---------- the controller's own button names in the hints (profile and PIN screens) ----------
// The hints say "A: choose · Y: remove · B: back". Those letters mean the
// buttons in Xbox positions (bottom, right, left, top); they're shown as the
// buttons of the controller in use: PlayStation's ✕ ○ □ △, Xbox's coloured
// A B X Y. Until a controller is
// seen here, the last one the app saw is used; plain letters if none.
const GLYPH_PAGE = /\/xcloud-(profiles|pin)\.html$/.test(location.pathname);
const FACE_BUTTONS = {   // Xbox position -> [shown, colour]
  xbox:   { A: ['A', '#107c10'], B: ['B', '#c42b1c'], X: ['X', '#1a5fb4'], Y: ['Y', '#c19c00'] },
  ps:     { A: ['✕', '#4b6fd6'], B: ['○', '#d9434b'], X: ['□', '#c060a8'], Y: ['△', '#22a37f'] }
};
let glyphKind = '';   // 'xbox' | 'ps' | '' (plain letters)
// Menu (Start) by its own name on each controller
const MENU_NAME = { ps: 'Options' };
// a hint written by the app itself (the on-screen keyboard): the controller's buttons
function padHintHtml(text) {
  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const menu = MENU_NAME[glyphKind];
  if (menu) text = text.replace(/\bMenu\b/g, menu);
  const html = glyphHtml(text);
  return html == null ? esc(text) : html;
}
function kindOf(id) {
  const st = padStyle(id);
  return st === 'ps4' || st === 'ps5' ? 'ps' : st === 'xbox' ? st : '';
}
function glyphHtml(text) {
  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const map = FACE_BUTTONS[glyphKind];
  if (!map) return null;
  const re = /(^|[\s·(（:：])([ABXY])(?=$|[\s:：·),.、]|[가-힣])/g;
  let out = '', last = 0, m;
  while ((m = re.exec(text))) {
    const at = m.index + m[1].length;
    const [shown, colour] = map[m[2]];
    out += esc(text.slice(last, at)) + `<span class="xcloud-btn" style="display:inline-flex;align-items:center;justify-content:center;min-width:1.45em;height:1.45em;padding:0 .2em;box-sizing:border-box;border-radius:50%;background:${colour};color:#fff;font-weight:700;font-size:.95em;line-height:1;vertical-align:-.25em;margin:0 .08em">${shown}</span>`;
    last = at + 1;
  }
  return last ? out + esc(text.slice(last)) : null;
}
// the hint lines are rewritten by the page as you move around: dress each new text
function dressHints() {
  document.querySelectorAll('.hint').forEach(el => {
    let raw;
    if (el.dataset.xcloudShown === el.textContent) {
      if (el.dataset.xcloudKind === glyphKind) return;   // already dressed for this controller
      raw = el.dataset.xcloudRaw;                         // the controller changed: redo it
    } else raw = el.textContent;                          // the page wrote a new hint
    const html = glyphHtml(raw);
    if (html == null) el.textContent = raw; else el.innerHTML = html;
    el.dataset.xcloudRaw = raw; el.dataset.xcloudShown = el.textContent; el.dataset.xcloudKind = glyphKind;
  });
}
let lastReportedPad = '';
function watchPadKind() {
  let id = '';
  try { const p = Array.from(navigator.getGamepads ? navigator.getGamepads() : []).find(q => q && q.connected !== false); id = p ? p.id : ''; } catch (e) { id = ''; }
  if (id && id !== lastReportedPad) { lastReportedPad = id; ipcRenderer.send('xcloud-pad-seen', id); }
  if (id) {
    const k = kindOf(id);
    if (k !== glyphKind) {
      glyphKind = k;
      if (GLYPH_PAGE) dressHints();
      // the on-screen keyboard's hint line too (any page)
      try { if (typeof osk !== 'undefined' && osk.isOpen && osk.kind !== glyphKind) osk.render(); } catch (e) { /* not built yet */ }
    }
  }
}
setInterval(watchPadKind, 700);
try { const last = ipcRenderer.sendSync('xcloud-last-pad'); if (last) glyphKind = kindOf(last); } catch (e) { /* none yet */ }
if (GLYPH_PAGE) {
  document.addEventListener('DOMContentLoaded', () => {
    dressHints();
    new MutationObserver(() => dressHints()).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
}

let shownPadId = null;
function updateIntroKeys() {
  let pad = null;
  try { pad = Array.from(navigator.getGamepads ? navigator.getGamepads() : []).find(p => p && p.connected !== false) || null; } catch (e) { pad = null; }
  const id = pad ? pad.id : '';
  if (id === shownPadId) return;
  const k1g = document.getElementById('k1g');
  if (!k1g) return; // page not ready yet
  shownPadId = id;
  const style = PAD_STYLES[pad ? padStyle(id) : 'generic'];
  const set = (n, [glyph, label, word]) => {
    const g = document.getElementById(`k${n}g`), l = document.getElementById(`k${n}l`);
    if (g) {
      // our own fixed icons are pictures (SVG); everything else is plain text
      if (glyph.startsWith('<svg')) g.innerHTML = glyph; else g.textContent = glyph;
      g.className = word ? 'btn word' : 'btn';
    }
    if (l) l.textContent = label;
  };
  set(1, style.k1);
  set(2, style.k2);
  const ka = document.getElementById('ka'), ky = document.getElementById('ky'), hint = document.getElementById('hint');
  if (ka) ka.textContent = style.a;
  if (ky) ky.textContent = style.y;
  if (hint) hint.textContent = fill(TXT.hintPad, { a: style.a, y: style.y, menu: style.k1[1] });
  // the Settings button's badge: View / Select
  const km = document.getElementById('km'), kml = document.getElementById('kml');
  if (km) {
    const [glyph, , word] = style.k1;
    if (glyph.startsWith('<svg')) km.innerHTML = glyph; else km.textContent = glyph;
    km.className = word ? 'm word' : 'm';
  }
  if (kml) kml.textContent = style.k1[1];
  const kml2 = document.getElementById('kml2');
  if (kml2) kml2.textContent = style.k2[1];
  const dev = document.getElementById('dev');
  if (dev) dev.textContent = pad ? fill(TXT.controller, { name: padName(id) || TXT.connected }) : TXT.pressAny;
}

const BTN = { A: 0, B: 1, X: 2, Y: 3, VIEW: 8, MENU: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const GREEN = '#107c10';

// ---------- small helpers ----------
function whenBody(fn) {
  if (document.body) fn();
  else document.addEventListener('DOMContentLoaded', fn, { once: true });
}

let toastEl = null;
let toastTimer = null;
function toast(msg, ms) {
  whenBody(() => {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.setAttribute('data-xcloud', 'toast');
      Object.assign(toastEl.style, {
        position: 'fixed', left: '50%', bottom: '6%', transform: 'translateX(-50%)',
        background: 'rgba(16,16,16,0.92)', color: '#fff', border: `2px solid ${GREEN}`,
        borderRadius: '10px', padding: '14px 26px', font: `600 22px ${FONT_STACK}`,
        zIndex: '2147483647', pointerEvents: 'none', transition: 'opacity .25s', opacity: '0'
      });
    }
    // above the game when it's full screen (only the full-screen element shows then)
    const fs = document.fullscreenElement;
    const host = fs && fs.tagName !== 'VIDEO' ? fs : document.body;
    if (toastEl.parentNode !== host) host.appendChild(toastEl);
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (toastEl) toastEl.style.opacity = '0'; }, ms || 2500);
  });
}
ipcRenderer.on('xcloud-toast', (e, msg, ms) => toast(msg, ms));

// the EmulationStation game list update: a small bar with the percentage in
// the top-right corner of the dashboard until it's done (pct null hides it).
// Not shown over a game in full screen.
let glEl = null;
ipcRenderer.on('xcloud-glprogress', (e, pct, text) => whenBody(() => {
  if (pct == null) { if (glEl) { glEl.remove(); glEl = null; } return; }
  if (!glEl) {
    glEl = document.createElement('div');
    glEl.setAttribute('data-xcloud', 'glprogress');
    Object.assign(glEl.style, {
      position: 'fixed', top: '18px', right: '22px', zIndex: '2147483646', pointerEvents: 'none',
      background: 'rgba(16,16,16,0.9)', border: `2px solid ${GREEN}`, borderRadius: '10px',
      padding: '10px 16px', color: '#fff', font: `600 16px ${FONT_STACK}`, minWidth: '300px'
    });
    glEl.innerHTML = '<div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:8px">' +
      '<span data-t></span><span data-p style="color:#7fd16f;font-weight:700"></span></div>' +
      '<div style="height:8px;border-radius:4px;background:#3a3a3a;overflow:hidden">' +
      `<i data-f style="display:block;height:100%;width:0;background:${GREEN};transition:width .3s"></i></div>`;
    document.body.appendChild(glEl);
  }
  glEl.querySelector('[data-t]').textContent = text || '';
  glEl.querySelector('[data-p]').textContent = pct + '%';
  glEl.querySelector('[data-f]').style.width = pct + '%';
}));

// ---------- gamepad reading ----------
// Combine every connected pad into one set of buttons, plus the left stick as a D-pad.
let padCount = 0;   // how many controllers the page saw on the last read
// A controller the browser doesn't know (no "standard" layout: some
// controllers on HippOS, the Steam Deck...) has its buttons in its own
// order. Xbox gets it in the Xbox layout (PAD_FIX in main.js); the app's own
// screens and combos read it the same way here, so View, Menu, the
// triggers and the D-pad work too, not only A B X Y.
var PAD_FIX_ON;   // (set from the app's settings above; off only when false)
const trigLow = {};
function trigOf(key, v) {
  if (v === undefined) return 0;
  if (trigLow[key] === undefined || v < trigLow[key]) trigLow[key] = v;
  const x = trigLow[key] < -0.5 ? (v + 1) / 2 : v;
  return x < 0.02 ? 0 : x > 1 ? 1 : x;
}
function xboxButtons(p) {
  const on = i => { const x = p.buttons[i]; return !!x && (x.pressed || x.value > 0.5); };
  if (p.mapping === 'standard' || PAD_FIX_ON === false || p.axes.length < 6) return p.buttons.map((b, i) => on(i));
  const a = p.axes, n = p.buttons.length, key = p.index + ':' + p.id;
  const lt = trigOf(key + 'l', a[2]) > 0.5, rt = trigOf(key + 'r', a[5]) > 0.5;
  let b;
  if (n >= 13) { b = []; for (let i = 0; i < 12; i++) b.push(on(i)); b[6] = b[6] || lt; b[7] = b[7] || rt; }
  else b = [on(0), on(1), on(2), on(3), on(4), on(5), lt, rt, on(6), on(7), on(9), on(10)];
  const hx = a.length >= 8 ? a[6] : 0, hy = a.length >= 8 ? a[7] : 0;
  if (n >= 17) b.push(on(13), on(14), on(15), on(16));
  else b.push(hy < -0.5, hy > 0.5, hx < -0.5, hx > 0.5);
  b.push(n >= 13 ? on(12) : on(8));   // Guide
  return b;
}
function readPads() {
  const state = new Array(17).fill(false);
  let pads = [];
  try { pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; } catch (e) { pads = []; }
  padCount = 0;
  for (const p of pads) {
    if (!p) continue;
    padCount++;
    xboxButtons(p).forEach((b, i) => { if (i < state.length && b) state[i] = true; });
    const x = p.axes[0] || 0, y = p.axes[1] || 0;
    if (y < -0.6) state[BTN.UP] = true;
    if (y > 0.6) state[BTN.DOWN] = true;
    if (x < -0.6) state[BTN.LEFT] = true;
    if (x > 0.6) state[BTN.RIGHT] = true;
  }
  return state;
}

// ---------- exit combo ----------
let exitStart = 0;
let exitSent = false;
let exitWarned = false;
let comboUsed = false; // so Menu released after the combo isn't treated as "done"
function checkExit(s) {
  if (s[BTN.VIEW] && s[BTN.MENU]) {
    comboUsed = true;
    const now = Date.now();
    if (!exitStart) exitStart = now;
    if (!exitWarned && now - exitStart > 400) { exitWarned = true; toast(TXT.holdExit, EXIT_HOLD_MS); }
    if (!exitSent && now - exitStart >= EXIT_HOLD_MS) { exitSent = true; ipcRenderer.send('xcloud-quit'); }
  } else {
    exitStart = 0;
    exitWarned = false;
  }
}

// ---------- hold Menu on Xbox: back to the welcome screen ----------
// A quick tap of Menu stays with the game (pause menus). Holding it alone
// for MENU_HOLD_MS opens the welcome screen. Pressing View during the hold
// (the exit combo) cancels it.
const MENU_HOLD_MS = 1000;
let menuStart = 0, menuSent = false, menuSpoiled = false;
function checkMenuHold(s) {
  if (!ON_DASH) return;
  if (s[BTN.MENU]) {
    if (s[BTN.VIEW]) menuSpoiled = true;
    if (!menuStart) menuStart = Date.now();
    if (!menuSent && !menuSpoiled && Date.now() - menuStart >= MENU_HOLD_MS) {
      menuSent = true;
      appLog('Menu held: opening the welcome screen');
      ipcRenderer.send('xcloud-welcome');
    }
  } else {
    menuStart = 0; menuSent = false; menuSpoiled = false;
  }
}

// the same with the S key held for 1 second (not while typing in a box)
if (ON_DASH) {
  let sTimer = null;
  const isS = e => (e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.altKey && !e.metaKey;
  const stopS = () => { if (sTimer) { clearTimeout(sTimer); sTimer = null; } };
  window.addEventListener('keydown', e => {
    if (!isS(e) || e.repeat || sTimer || isTextBox(e.target)) return;
    sTimer = setTimeout(() => {
      sTimer = null;
      appLog('S held: opening the welcome screen');
      ipcRenderer.send('xcloud-welcome');
    }, MENU_HOLD_MS);
  }, true);
  window.addEventListener('keyup', e => { if (e.key === 's' || e.key === 'S') stopS(); }, true);
  window.addEventListener('blur', stopS);
  // Backspace: the Settings screen (not while typing, and not in a game,
  // where the key belongs to the game)
  window.addEventListener('keydown', e => {
    if (e.key !== 'Backspace' || e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    if (OVERLAY_UP || isTextBox(e.target) || isTextBox(document.activeElement)) return;
    if (/\/launch\//i.test(location.pathname)) return;
    e.preventDefault(); e.stopPropagation();
    appLog('Backspace: opening Settings');
    ipcRenderer.send('xcloud-settings-dash');
  }, true);
  // F8: this game into Batocera's list (or out of it)
  window.addEventListener('keydown', e => {
    if (e.key !== 'F8' || e.repeat) return;
    if (OVERLAY_UP || isTextBox(e.target) || isTextBox(document.activeElement)) return;
    e.preventDefault(); e.stopPropagation();
    sendPickToggle('F8');
  }, true);
}
// the same as F8, from the keyboard or the controller (LB + RB + LT + RT held)
function sendPickToggle(how) {
  if (!ON_DASH) return;
  appLog(`add/remove this game: ${how}`);
  {
    // the address, and the page's own idea of which game it is (if it says)
    const also = [];
    try {
      const c = document.querySelector('link[rel=canonical]'); if (c && c.href) also.push(c.href);
      const og = document.querySelector('meta[property="og:url"]'); if (og && og.content) also.push(og.content);
    } catch (err) { /* ignore */ }
    // the game's name as the page shows it (its heading, or the share title)
    let name = '';
    try {
      const og = document.querySelector('meta[property="og:title"]');
      const h1 = document.querySelector('h1');
      name = (h1 && h1.textContent.trim()) || (og && og.content) || document.title;
    } catch (err) { name = document.title; }
    ipcRenderer.send('xcloud-pick-toggle', location.href, also, name);
  }
}
// LB + RB + LT + RT (L1 + R1 + L2 + R2) held together for a second on the
// dashboard: this game into Batocera's list, like F8. A second's hold, so a
// quick squeeze in a game doesn't do it; once per hold.
const PICK_COMBO = [4, 5, 6, 7], PICK_HOLD_MS = 1000;
let pickSince = 0, pickDone = false;
function checkPickCombo(s) {
  if (!ON_DASH || OVERLAY_UP || osk.isOpen) { pickSince = 0; return; }
  if (PICK_COMBO.every(b => s[b])) {
    if (!pickSince) pickSince = Date.now();
    else if (!pickDone && Date.now() - pickSince >= PICK_HOLD_MS) { pickDone = true; sendPickToggle('LB + RB + LT + RT'); }
  } else { pickSince = 0; pickDone = false; }
}

// ---------- hold View on a game: open its whole row ----------
// Xbox's controller navigation only moves between game tiles, so a row's
// title ("Stream for free with ads >") can only be clicked with a mouse.
// Holding View alone for a second on a tile opens that row's full list.
// (A tap of View still goes to Xbox; Menu during the hold is the exit combo.)
const ROW_HOLD_MS = 1000;
let rowStart = 0, rowDone = false, rowSpoiled = false;
function checkRowHold(s) {
  if (!ON_DASH || OVERLAY_UP || osk.isOpen) { rowStart = 0; return; }
  if (s[BTN.VIEW]) {
    if (s[BTN.MENU]) rowSpoiled = true;
    if (!rowStart) rowStart = Date.now();
    if (!rowDone && !rowSpoiled && Date.now() - rowStart >= ROW_HOLD_MS) { rowDone = true; openRow(); }
  } else { rowStart = 0; rowDone = false; rowSpoiled = false; }
}
// the row's title for a tile: on the Xbox site each row is a <section> whose
// heading (often a link, "Stream for free with ads >") comes before its
// carousel of game buttons. Only that section is searched, so another row's
// title is never picked.
function rowTitleFor(tile) {
  const sec = tile.closest('section');
  if (sec) {
    const before = el => !!(el.compareDocumentPosition(tile) & Node.DOCUMENT_POSITION_FOLLOWING);
    const isTile = el => !!el.querySelector('img,video,picture') || el.contains(tile) || tile.contains(el);
    // a link or button before the games, with a short text and no picture
    for (const c of sec.querySelectorAll('a[href],button,[role=link],[role=button]')) {
      if (!before(c) || isTile(c) || !visible(c)) continue;
      const txt = (c.textContent || '').trim();
      if (txt && txt.length <= 80) return c;
    }
    // or the heading itself, clicked through whatever it sits in
    for (const h of sec.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]')) {
      if (!before(h) || !visible(h) || !(h.textContent || '').trim()) continue;
      return h.querySelector('a,button,[role=link],[role=button]') || h.closest('a,button,[role=link],[role=button]') || h;
    }
  }
  // no section: the nearest short link or button just above the tile
  const tr = tile.getBoundingClientRect();
  for (let a = tile.parentElement, depth = 0; a && a !== document.body && depth < 6; a = a.parentElement, depth++) {
    let best = null, bestGap = Infinity;
    for (const c of a.querySelectorAll('a[href],button,[role=link],[role=button]')) {
      if (c === tile || c.contains(tile) || tile.contains(c) || !visible(c)) continue;
      if (c.querySelector('img,video,picture')) continue;
      const txt = (c.textContent || '').trim();
      if (!txt || txt.length > 80) continue;
      const r = c.getBoundingClientRect();
      if (r.height > 80 || r.bottom > tr.top + 4) continue;
      const gap = tr.top - r.bottom;
      if (gap <= 120 && gap < bestGap) { best = c; bestGap = gap; }
    }
    if (best) return best;
  }
  return null;
}
// what a row's section holds before its games, for the log when no title is found
function sectionSummary(tile) {
  const sec = tile.closest('section');
  if (!sec) return 'no section';
  const out = [];
  for (const el of sec.querySelectorAll('*')) {
    if (out.length >= 6 || el.contains(tile)) { if (out.length >= 6) break; continue; }
    if (!(el.compareDocumentPosition(tile) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
    const own = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
    if (own) out.push(`${describe(el)} "${own.slice(0, 40)}"`);
  }
  return out.join(' / ') || 'nothing with text before the games';
}
function describe(el) {
  if (!el || !el.tagName) return String(el);
  const cls = typeof el.className === 'string' ? el.className.split(/\s+/).slice(0, 2).join('.') : '';
  return el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (el.getAttribute('aria-label') ? ` "${el.getAttribute('aria-label').slice(0, 40)}"` : '');
}
// a compact outline of the page around a tile, for the log: tags, the first two
// classes and their own text, from the nearest container holding a few rows
function outline(tile) {
  let box = tile;
  for (let i = 0; i < 8 && box.parentElement && box.parentElement !== document.body; i++) box = box.parentElement;
  const out = [];
  (function walk(el, depth) {
    if (out.join('').length > 2400 || depth > 9) return;
    if (el !== box && el.querySelector && el.querySelector('img') && el.matches('button,a')) { out.push(`${'  '.repeat(depth)}[tile${el === tile || el.contains(tile) ? ' *HELD*' : ''}]`); return; }
    const own = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
    const role = el.getAttribute && el.getAttribute('role');
    if (own || /^(A|BUTTON|SECTION|H[1-6])$/.test(el.tagName) || role) out.push(`${'  '.repeat(depth)}${describe(el)}${role ? ' role=' + role : ''}${el.getAttribute && el.getAttribute('href') ? ' href=' + el.getAttribute('href').slice(0, 60) : ''}${own ? ' "' + own.slice(0, 40) + '"' : ''}`);
    for (const c of el.children) walk(c, depth + 1);
  })(box, 0);
  return out.join(' | ');
}
function openRow() {
  const tile = document.activeElement;
  if (!tile || tile === document.body || tile === document.documentElement) { appLog('View held: no game selected, so no row to open'); return; }
  const t = rowTitleFor(tile);
  if (!t) {
    const up = []; for (let a = tile.parentElement, i = 0; a && i < 5; a = a.parentElement, i++) up.push(describe(a));
    appLog(`View held: no row title found above ${describe(tile)} (in ${up.join(' < ')}); the section has: ${sectionSummary(tile)}`);
    try { appLog('View held: page outline: ' + outline(tile)); } catch (e) { /* ignore */ }
    toast(TXT.rowNone || 'This row has no full list', 2500);
    return;
  }
  const name = (t.textContent || '').trim().replace(/\s+/g, ' ');
  try { appLog('View held: page outline: ' + outline(tile)); } catch (e) { /* ignore */ }
  appLog(`View held: opening the row "${name}" (${describe(t)}) for ${describe(tile)}`);
  toast('\u203a ' + name, 2000);
  t.click();
}

// ---------- focus navigation for sign-in pages ----------
const FOCUSABLE = 'a[href],button,input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"]),[role=button],[role=link],[role=checkbox]';

function visible(el) {
  if (!el || el.disabled) return false;
  if (el.closest('[data-xcloud]')) return false;
  const r = el.getClientRects();
  if (!r.length) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
}

function focusables() {
  return Array.from(document.querySelectorAll(FOCUSABLE)).filter(visible);
}

function moveFocus(dir) {
  const list = focusables();
  if (!list.length) return;
  let i = list.indexOf(document.activeElement);
  if (i < 0) i = dir > 0 ? -1 : 0;
  const next = list[(i + dir + list.length) % list.length];
  next.focus({ preventScroll: true });
  next.scrollIntoView({ block: 'center', inline: 'nearest' });
}

function isTextBox(el) {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return !el.readOnly;
  if (el.tagName !== 'INPUT' || el.readOnly) return false;
  const t = (el.getAttribute('type') || 'text').toLowerCase();
  return ['text', 'email', 'password', 'tel', 'number', 'search', 'url'].includes(t);
}

function setValue(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function pressEnter(el) {
  // click the page's main button (Next / Sign in), or submit the form
  const form = el && el.form;
  const scope = form || document;
  const btn = scope.querySelector('#idSIButton9, [data-testid="primaryButton"], button[type=submit], input[type=submit]');
  if (btn && visible(btn)) { btn.click(); return; }
  if (form && form.requestSubmit) { form.requestSubmit(); return; }
  const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true };
  el.dispatchEvent(new KeyboardEvent('keydown', opts));
  el.dispatchEvent(new KeyboardEvent('keyup', opts));
}

function activate(el) {
  if (!el || el === document.body || !visible(el)) { moveFocus(1); return; }
  if (isTextBox(el)) { osk.open(el); return; }
  if (el.tagName === 'SELECT') {
    el.selectedIndex = (el.selectedIndex + 1) % el.options.length;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  el.click();
}

// ---------- on-screen keyboard ----------
// Opens by itself when a sign-in page puts you in a box to type in (email,
// password, code). Use it with a controller (D-pad + A) or click its keys
// with a mouse. Typing on a real keyboard works at the same time, and the
// preview at the top shows what you've typed either way.
const SHIFT = '⇧ Shift', SPACE = 'Space', DEL = '⌫ Delete', DONE = 'Done ✓', DOTCOM = '.com', HIDE = 'Hide';
// what those keys say, in the chosen language
function keyLabel(key) {
  if (key === SHIFT) return `⇧ ${TXT.kShift}`;
  if (key === SPACE) return TXT.kSpace;
  if (key === DEL) return `⌫ ${TXT.kDel}`;
  if (key === DONE) return `${TXT.kDone} ✓`;
  if (key === HIDE) return TXT.kHide;
  return key;
}
const LOWER = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '@'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '-', '_'],
  [SHIFT, DOTCOM, SPACE, DEL, HIDE, DONE]
];
const UPPER = [
  ['!', '#', '$', '%', '&', '*', '+', '=', '?', '/'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', '@'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', "'", '~'],
  [SHIFT, DOTCOM, SPACE, DEL, HIDE, DONE]
];

// boxes that only take digits (sign-in codes, phone numbers, PINs): a number pad
const NUMPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [DEL, '0', DONE],
  [HIDE]
];
function isNumberBox(el) {
  if (!el) return false;
  const type = (el.getAttribute('type') || '').toLowerCase();
  const mode = (el.getAttribute('inputmode') || '').toLowerCase();
  const pat = el.getAttribute('pattern') || '';
  return type === 'number' || type === 'tel' || mode === 'numeric' || mode === 'decimal' || mode === 'tel' ||
    (el.getAttribute('autocomplete') || '').toLowerCase() === 'one-time-code' || /^(\\d|\[0-9\])[{*+]/.test(pat);
}

// where the text cursor is (some box types, like email, don't report it)
function caretOf(el) {
  try {
    if (typeof el.selectionStart === 'number' && el.selectionStart !== null) {
      return [el.selectionStart, el.selectionEnd];
    }
  } catch (e) { /* not supported for this box type */ }
  return [el.value.length, el.value.length];
}
function setCaret(el, pos) {
  try { el.setSelectionRange(pos, pos); } catch (e) { /* not supported for this box type */ }
}

const osk = {
  el: null, target: null, row: 1, col: 0, shift: false, isOpen: false, oldPad: '', numeric: false,
  layout() { return this.numeric ? NUMPAD : this.shift ? UPPER : LOWER; },
  lit: null, litUntil: 0, litTimer: null,

  build() {
    const box = document.createElement('div');
    box.setAttribute('data-xcloud', 'keyboard');
    Object.assign(box.style, {
      position: 'fixed', left: '0', right: '0', bottom: '0', zIndex: '2147483646',
      background: 'rgba(12,12,12,0.97)', borderTop: `3px solid ${GREEN}`,
      padding: '18px 3% 22px', font: `600 24px ${FONT_STACK}`, color: '#fff', boxSizing: 'border-box',
      userSelect: 'none'
    });
    // mouse: click a key. mousedown (not click) and preventDefault, so the
    // text box keeps the focus and a real keyboard keeps typing into it.
    box.addEventListener('mousedown', e => {
      e.preventDefault();
      const k = e.target && e.target.closest ? e.target.closest('[data-r]') : null;
      if (!k) return;
      this.row = Number(k.getAttribute('data-r'));
      this.col = Number(k.getAttribute('data-c'));
      this.press();
    });
    this.onInput = () => this.render();
    document.body.appendChild(box);
    this.el = box;
  },

  render() {
    if (!this.isOpen || !this.el) return;
    const t = this.target;
    if (!t || !t.isConnected) { this.close(); return; }
    const layout = this.layout();
    const isPw = (t.getAttribute('type') || '').toLowerCase() === 'password';
    const value = t.value || '';
    const [cs] = caretOf(t);
    const shown = isPw ? '•'.repeat(value.length) : value;
    const label = t.getAttribute('aria-label') || t.getAttribute('placeholder') || t.name || TXT.kText;
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let html = `<div style="margin:0 0 6px;color:#9fd88a;font-size:18px">${esc(label)}</div>`;
    html += `<div style="background:#222;border:2px solid #444;border-radius:8px;padding:10px 14px;min-height:30px;margin-bottom:14px;word-break:break-all">` +
      `${esc(shown.slice(0, cs))}<span style="color:${GREEN}">▏</span>${esc(shown.slice(cs))}</div>`;
    if (this.numeric) html += '<div style="max-width:720px;margin:0 auto">';
    layout.forEach((row, r) => {
      html += '<div style="display:flex;gap:8px;margin-bottom:8px">';
      row.forEach((key, c) => {
        const sel = r === this.row && c === this.col;
        const wide = key.length > 1 && key !== DOTCOM ? 2 : 1;
        const on = key === SHIFT && this.shift;
        const lit = this.lit && this.lit[0] === r && this.lit[1] === c && Date.now() < this.litUntil;
        html += `<div data-r="${r}" data-c="${c}"${lit ? ' class="xcloud-lit"' : ''} style="flex:${wide};text-align:center;padding:12px 0;border-radius:8px;cursor:pointer;` +
          `background:${sel ? GREEN : on ? '#2c4a22' : '#2a2a2a'};outline:${sel ? '3px solid #fff' : 'none'}">${esc(keyLabel(key))}</div>`;
      });
      html += '</div>';
    });
    if (this.numeric) html += '</div>';
    html += '<div style="font-size:16px;color:#aaa;text-align:center;margin-top:6px">' +
      padHintHtml(this.numeric ? 'Controller: A type · X delete · B hide · Menu done' : 'Controller: A type · X delete · Y shift · B hide · Menu done') +
      ' &nbsp;|&nbsp; or type on your keyboard, or click the keys</div>';
    this.kind = glyphKind;
    this.el.innerHTML = html;
  },

  open(target) {
    whenBody(() => {
      if (!this.el) this.build();
      if (this.isOpen && this.target === target) { this.render(); return; }
      if (this.target !== target) {
        if (this.target) {
          this.target.removeEventListener('input', this.onInput);
          this.target.removeEventListener('keyup', this.onInput);
        }
        target.addEventListener('input', this.onInput);
        target.addEventListener('keyup', this.onInput); // caret moved with the arrow keys
      }
      const wasOpen = this.isOpen;
      const numeric = isNumberBox(target);
      if (!wasOpen || numeric !== this.numeric) { this.row = numeric ? 0 : 1; this.col = 0; this.shift = false; }
      this.numeric = numeric;
      if (!wasOpen && ON_DASH) ipcRenderer.send('xcloud-osk', true);
      this.target = target;
      this.isOpen = true;
      this.el.style.display = 'block';
      if (document.activeElement !== target) target.focus({ preventScroll: true });
      this.render();
      // keep the box visible above the keyboard
      if (!wasOpen) this.oldPad = document.body.style.paddingBottom;
      document.body.style.paddingBottom = `${this.el.offsetHeight + 20}px`;
      try { target.scrollIntoView({ block: 'center' }); } catch (e) { /* ignore */ }
    });
  },

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.el) this.el.style.display = 'none';
    if (ON_DASH) ipcRenderer.send('xcloud-osk', false);
    document.body.style.paddingBottom = this.oldPad || '';
    if (this.target && this.target.isConnected) {
      this.target.dispatchEvent(new Event('change', { bubbles: true }));
      if (ON_DASH) {
        // back to Xbox: the box lets go, so the D-pad moves around the page again
        const t = this.target;
        setTimeout(() => {
          try { if (document.activeElement === t) t.blur(); } catch (e) { /* ignore */ }
          appLog(`dashboard: keyboard closed, the box ${document.activeElement === t ? 'kept the focus' : 'let go'}`);
        }, 400);
      } else if (document.activeElement !== this.target) this.target.focus({ preventScroll: true });
    }
  },

  move(dr, dc) {
    const layout = this.layout();
    if (dr) {
      this.row = (this.row + dr + layout.length) % layout.length;
      this.col = Math.min(this.col, layout[this.row].length - 1);
    }
    if (dc) {
      const n = layout[this.row].length;
      this.col = (this.col + dc + n) % n;
    }
    this.render();
  },

  type(text) {
    const t = this.target;
    if (!t) return;
    if (this.numeric && /^[0-9]$/.test(text)) { ipcRenderer.send('xcloud-key', text); setTimeout(() => this.render(), 120); return; }
    const max = t.maxLength > 0 ? t.maxLength : Infinity;
    const [s, e] = caretOf(t);
    const v = t.value;
    if (v.length - (e - s) + text.length > max) return;
    setValue(t, v.slice(0, s) + text + v.slice(e));
    setCaret(t, s + text.length);
    this.render();
  },

  backspace() {
    const t = this.target;
    if (this.numeric && t) { ipcRenderer.send('xcloud-key', 'Backspace'); setTimeout(() => this.render(), 120); return; }
    if (!t || !t.value) return;
    const [s, e] = caretOf(t);
    const v = t.value;
    if (s !== e) { setValue(t, v.slice(0, s) + v.slice(e)); setCaret(t, s); }
    else if (s > 0) { setValue(t, v.slice(0, s - 1) + v.slice(s)); setCaret(t, s - 1); }
    this.render();
  },

  done() {
    const t = this.target;
    this.close();
    if (!t) return;
    if (ON_DASH) {
      const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
      t.dispatchEvent(new KeyboardEvent('keydown', opts));
      t.dispatchEvent(new KeyboardEvent('keypress', opts));
      t.dispatchEvent(new KeyboardEvent('keyup', opts));
      if (t.form && t.form.requestSubmit) { try { t.form.requestSubmit(); } catch (e) { /* ignore */ } }
      return;
    }
    pressEnter(t);
  },

  // light up the on-screen key that matches a key pressed on a real keyboard
  flash(label) {
    if (!this.isOpen) return;
    const layouts = this.numeric ? [NUMPAD] : this.shift ? [UPPER, LOWER] : [LOWER, UPPER];
    let pos = null;
    for (const layout of layouts) {
      layout.forEach((row, r) => row.forEach((k, c) => {
        if (pos) return;
        if (k === label || (label.length === 1 && k.length === 1 && k.toLowerCase() === label.toLowerCase())) pos = [r, c, layout];
      }));
      if (pos) break;
    }
    if (!pos) return;
    // a symbol that's only on the other layout: show that layout while it's lit
    // the controller's selection follows what's typed, so it carries on from there
    this.row = pos[0]; this.col = pos[1];
    if (!KEY_HIGHLIGHT) { this.render(); return; }
    if (!this.numeric && pos[2] !== (this.shift ? UPPER : LOWER) && label.length === 1 && !/[a-z]/i.test(label)) {
      this.shift = !this.shift;
      clearTimeout(this.shiftBack);
      this.shiftBack = setTimeout(() => { this.shift = !this.shift; this.render(); }, 450);
    }
    this.lit = [pos[0], pos[1]];
    this.litUntil = Date.now() + 260;
    clearTimeout(this.litTimer);
    this.litTimer = setTimeout(() => { this.lit = null; this.render(); }, 270);
    this.render();
  },

  press() {
    const key = this.layout()[this.row][this.col];
    if (key === SHIFT) { this.shift = !this.shift; this.render(); }
    else if (key === SPACE) this.type(' ');
    else if (key === DEL) this.backspace();
    else if (key === HIDE) this.close();
    else if (key === DONE) this.done();
    else this.type(key);
  }
};

if (ON_DASH) {
  // Enter in a text box on a real keyboard (search): once Xbox has it, the box
  // lets go, so the controller moves around the results
  document.addEventListener('keydown', e => {
    if (osk.isOpen || (e.key !== 'Enter' && e.key !== 'NumpadEnter')) return;
    const t = e.target;
    if (!isTextBox(t)) return;
    setTimeout(() => { try { if (document.activeElement === t) { t.blur(); appLog('dashboard: search sent, the box let go'); } } catch (err) { /* ignore */ } }, 400);
  });
  document.addEventListener('keydown', e => {
    if (!osk.isOpen) return;
    if (e.key === 'Escape') { osk.close(); return; }
    if (e.key === 'Enter' || e.key === 'NumpadEnter') { osk.close(); return; }
    // typing on a real keyboard: that key lights up, and the selection moves to it
    if (e.key === 'Backspace' || e.key === 'Delete') osk.flash(DEL);
    else if (e.key === ' ') osk.flash(SPACE);
    else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) osk.flash(e.key);
  }, true);
}
// open the keyboard by itself on the sign-in pages
if (NAV_ON && !ON_DATA_PAGE) {
  // a box gets focus: by the page itself, Tab, D-pad, or a click
  document.addEventListener('focusin', e => {
    const el = e.target;
    if (isTextBox(el) && visible(el)) osk.open(el);
  }, true);
  // clicking the box you're already in brings it back after Hide
  document.addEventListener('mousedown', e => {
    const el = e.target;
    if (!osk.isOpen && isTextBox(el) && visible(el)) osk.open(el);
  }, true);
  // a real keyboard while the on-screen keyboard is open:
  //   Enter = Done (presses Next / Sign in, once), Esc tap = hide,
  //   and every key you press lights up on the on-screen keyboard
  document.addEventListener('keydown', e => {
    if (!osk.isOpen) return;
    if (e.key === 'Escape') { osk.flash(HIDE); osk.close(); return; }
    if (e.key === 'Enter' || e.key === 'NumpadEnter') {
      e.preventDefault(); e.stopPropagation();   // so the page doesn't also submit
      osk.flash(DONE);
      osk.done();
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') osk.flash(DEL);
    else if (e.key === ' ') osk.flash(SPACE);
    else if (e.key === 'Shift') osk.flash(SHIFT);
    else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) osk.flash(e.key);
  }, true);

  // the pressed-key animation
  whenBody(() => {
    const st = document.createElement('style');
    st.setAttribute('data-xcloud', 'osk-style');
    st.textContent = '@keyframes xcloud-press{0%{transform:scale(1.14);background:#3fd13f;box-shadow:0 0 22px #7dff7d;color:#0b2a0b}' +
      '100%{transform:scale(1);box-shadow:none}}' +
      '[data-xcloud=keyboard] .xcloud-lit{animation:xcloud-press .26s ease-out;position:relative;z-index:1}';
    (document.head || document.body).appendChild(st);
  });

  // have the box ready to type in: whenever a sign-in box is on the page and
  // nothing else is selected, select it (covers boxes drawn late, and the
  // jump from the email step to the password step)
  const selectBoxIfNone = () => {
    const a = document.activeElement;
    if (a && a !== document.body && a !== document.documentElement) return;
    const box = focusables().find(isTextBox);
    if (box) box.focus({ preventScroll: true });
  };
  let watchUntil = Date.now() + 20000;
  const watcher = new MutationObserver(() => {
    if (Date.now() > watchUntil) return;
    clearTimeout(watcher.t);
    watcher.t = setTimeout(selectBoxIfNone, 60);
  });
  document.addEventListener('DOMContentLoaded', () => {
    watcher.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    selectBoxIfNone();
  });
  window.addEventListener('load', selectBoxIfNone);
  // a new step (the page swaps its content) restarts the watch
  document.addEventListener('focusout', () => { watchUntil = Math.max(watchUntil, Date.now() + 5000); setTimeout(selectBoxIfNone, 120); }, true);
}

// ---------- button handling with key repeat ----------
const prev = new Array(17).fill(false);
const heldSince = new Array(17).fill(0);
const lastRepeat = new Array(17).fill(0);
const REPEATS = new Set([BTN.UP, BTN.DOWN, BTN.LEFT, BTN.RIGHT, BTN.X]);

function onPress(b) {
  if (ON_INTRO) { introPress(b); return; }
  if (ON_SETTINGS) { settingsPress(b); return; }
  if (ON_KEY_PAGE) {
    if (b === BTN.Y) settingsKey('y');
    else if (b === BTN.X) settingsKey('x');
    else settingsPress(b);
    return;
  }
  if (ON_VIDEO) { if ([BTN.A, BTN.B, BTN.X].includes(b)) settingsKey('Enter'); return; }
  if (ON_ERROR_PAGE) {
    if (b === BTN.A) ipcRenderer.send('xcloud-retry');
    return;
  }
  if (ON_DASH) { dashPress(b); return; }
  if (!NAV_ON) return;
  if (osk.isOpen) {
    if (b === BTN.UP) osk.move(-1, 0);
    else if (b === BTN.DOWN) osk.move(1, 0);
    else if (b === BTN.LEFT) osk.move(0, -1);
    else if (b === BTN.RIGHT) osk.move(0, 1);
    else if (b === BTN.A) osk.press();
    else if (b === BTN.X) osk.backspace();
    else if (b === BTN.Y) { osk.shift = !osk.shift; osk.render(); }
    else if (b === BTN.B) osk.close();
    return;
  }
  if (b === BTN.UP || b === BTN.LEFT) moveFocus(-1);
  else if (b === BTN.DOWN || b === BTN.RIGHT) moveFocus(1);
  else if (b === BTN.A) activate(document.activeElement);
  else if (b === BTN.B) { if (history.length > 1) history.back(); }
}

// ---------- the dashboard's text boxes (search) ----------
// Xbox has no keyboard of its own here: with a text box selected, X or A
// opens the app's on-screen keyboard (A also lets Xbox open the box, which
// then gets the keyboard). While it's open the controller types and Xbox
// doesn't see it; B hides it, Menu searches.
let lastPadPress = 0;
function searchBoxNear(el) {
  if (isTextBox(el) && visible(el)) return el;
  // only inside what's highlighted (nothing highlighted: no box)
  if (!el || el === document.body || el === document.documentElement) return null;
  const inner = el.querySelector ? el.querySelector('input') : null;
  if (inner && isTextBox(inner) && visible(inner)) return inner;
  return null;
}
function anySearchBox() {
  const all = Array.from(document.querySelectorAll('input')).filter(x => isTextBox(x) && visible(x));
  return all.find(x => /search|such|cerca|buscar|pesquis|recherch|zoek|sök|søg|hae|szuk|hled|vyhľad|keres|検索|검색/i.test(
    `${x.type} ${x.getAttribute('aria-label') || ''} ${x.placeholder || ''} ${x.name || ''} ${x.id || ''}`)) || all[0] || null;
}
function dashPress(b) {
  if (b === BTN.A || b === BTN.X) lastPadPress = Date.now();   // only a press that picks something opens the keyboard
  if (osk.isOpen) {
    if (b === BTN.UP) osk.move(-1, 0);
    else if (b === BTN.DOWN) osk.move(1, 0);
    else if (b === BTN.LEFT) osk.move(0, -1);
    else if (b === BTN.RIGHT) osk.move(0, 1);
    else if (b === BTN.A) osk.press();
    else if (b === BTN.X) osk.backspace();
    else if (b === BTN.Y) { osk.shift = !osk.shift; osk.render(); }
    else if (b === BTN.B) osk.close();
    return;
  }
  if (OVERLAY_UP || /\/launch\//i.test(location.pathname)) return;
  // a text box still selected (typed in with a real keyboard): the D-pad or B
  // lets go of it, so the controller moves around Xbox again (Xbox ignores the
  // D-pad while a text box has the focus)
  if ([BTN.UP, BTN.DOWN, BTN.LEFT, BTN.RIGHT, BTN.B].includes(b) && isTextBox(document.activeElement)) {
    appLog('dashboard: the D-pad let go of the text box');
    try { document.activeElement.blur(); } catch (e) { /* ignore */ }
    return;
  }
  if (b !== BTN.X && b !== BTN.A) return;
  const el = document.activeElement;
  const box = searchBoxNear(el);
  if (box) { appLog(`dashboard: keyboard opened for "${box.getAttribute('aria-label') || box.placeholder || 'a text box'}"`); osk.open(box); return; }
  // X on the search button: open it, then the keyboard for its box
  if (b === BTN.X && el && el !== document.body) {
    const what = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('placeholder') || ''} ${el.textContent || ''}`.slice(0, 200);
    if (/search|such|cerca|buscar|pesquis|recherch|zoek|sök|søg|hae|szuk|hled|vyhľad|keres|検索|검색/i.test(what)) {
      try { el.click(); } catch (e) { /* ignore */ }
      setTimeout(() => {
        const t = searchBoxNear(document.activeElement) || anySearchBox();
        if (t) { appLog('dashboard: keyboard opened for the search box'); osk.open(t); }
        else appLog('dashboard: X on the search button, but no text box came up');
      }, 350);
    }
  }
}
if (ON_DASH) {
  // a text box picked with the controller (A): the keyboard comes up with it
  document.addEventListener('focusin', e => {
    const el = e.target;
    if (osk.isOpen || OVERLAY_UP || Date.now() - lastPadPress > 1500) return;
    if (isTextBox(el) && visible(el)) { appLog('dashboard: keyboard opened for a text box picked with the controller'); osk.open(el); }
  }, true);
}

function onRelease(b) {
  // Menu acts on release, so holding it for the exit combo doesn't also press "done"
  if (b === BTN.VIEW && !comboUsed && ON_WEB_PAGE) { goHome('View button'); return; }
  // View / Select opens Settings from the welcome screen (on release, so the
  // View + Menu exit combo doesn't also open it)
  if (b === BTN.VIEW && !comboUsed && ON_INTRO) { introSettings(); return; }
  if (b === BTN.MENU && !comboUsed && ON_SETTINGS) { settingsKey('F10'); return; } // = Save
  if (b === BTN.MENU && !comboUsed && ON_VIDEO) { settingsKey('Enter'); return; }   // skip the video
  if (b === BTN.MENU && !comboUsed && ON_DASH && osk.isOpen) { osk.done(); return; }
  if (b === BTN.MENU && !comboUsed && NAV_ON && !ON_DATA_PAGE) {
    if (osk.isOpen) osk.done();
    else if (isTextBox(document.activeElement)) pressEnter(document.activeElement);
  }
}

// buttons already held when a page opens (e.g. A, from the button that
// opened it) count only once they're let go and pressed again. The browser
// only shows a page the controller once a button changes, so a page can open
// seeing no controller and then find A already down a moment later: whenever
// a controller (re)appears, what's held then is "already held", not a press.
let firstTick = true, lastPadCount = 0;
const pageOpened = Date.now();
function tick() {
  const s = readPads();
  const appeared = padCount > lastPadCount;
  lastPadCount = padCount;
  if (firstTick || (appeared && Date.now() - pageOpened < 400)) {
    firstTick = false;
    for (let b = 0; b < s.length; b++) prev[b] = s[b];
    comboUsed = comboUsed || !!s[BTN.MENU];
    if (appeared && s.some(Boolean)) appLog('a button already held when this screen opened: ignored until it is let go');
    return;
  }
  if (OVERLAY_UP && !ON_APP_PAGE) {
    // the screen on top has the controller; just keep track of what's held
    for (let b = 0; b < s.length; b++) prev[b] = s[b];
    comboUsed = comboUsed || !!s[BTN.MENU];
    if (!s[BTN.VIEW] && !s[BTN.MENU]) comboUsed = false;
    menuStart = 0; menuSent = false;
    return;
  }
  checkExit(s);
  checkMenuHold(s);
  checkPickCombo(s);
  checkRowHold(s);
  if (ON_INTRO) updateIntroKeys();
  const now = Date.now();
  for (let b = 0; b < s.length; b++) {
    if (s[b] && !prev[b]) {
      heldSince[b] = now; lastRepeat[b] = now;
      if (b !== BTN.MENU && !(s[BTN.VIEW] && s[BTN.MENU])) onPress(b);
    } else if (s[b] && prev[b] && REPEATS.has(b) && now - heldSince[b] > 400 && now - lastRepeat[b] > 110) {
      lastRepeat[b] = now;
      onPress(b);
    } else if (!s[b] && prev[b]) {
      onRelease(b);
    }
    prev[b] = s[b];
  }
  // forget the combo only once both buttons are fully let go
  if (!s[BTN.VIEW] && !s[BTN.MENU]) comboUsed = false;
}

setInterval(tick, 25);

// a clear focus ring on sign-in pages, so you can see where you are
if (NAV_ON && !ON_DATA_PAGE) {
  whenBody(() => {
    const st = document.createElement('style');
    st.setAttribute('data-xcloud', 'style');
    st.textContent = `:focus{outline:4px solid ${GREEN} !important;outline-offset:3px !important;border-radius:4px}`;
    document.head ? document.head.appendChild(st) : document.body.appendChild(st);
    // (only ever pre-select a text box, never a button: a button selected
    // too early would swallow Space/Enter typed for the box that comes next.
    // With nothing selected, the first D-pad press selects the first item.)
  });
}
