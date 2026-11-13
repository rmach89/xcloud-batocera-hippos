'use strict';
// Xbox Cloud Gaming for Batocera: a fullscreen window that only opens
// xbox.com/play and Microsoft sign-in. Everything else is blocked.
const { app, BrowserWindow, WebContentsView, session, ipcMain, Menu, powerSaveBlocker, nativeImage, net } = require('electron');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const rules = require('./rules');
const i18n = require('./i18n');

const HOME = process.env.XCLOUD_HOME || '/userdata/system/add-ons/xcloud';
const CONFIG = path.join(HOME, 'config.json');
const LOG = process.env.XCLOUD_APP_LOG || '/userdata/system/logs/xcloud-app.log';
// created when you choose "Don't show this again" on the exit tip
const TIP_HIDDEN = path.join(HOME, 'exit-tip-hidden');
// the version of this package (shown in Settings)
const VERSION = require('./package.json').version;
// when the intro video last played ("once a day")
const INTRO_LAST = path.join(HOME, 'intro-last-played');
// the intro video played when the app opens (while Xbox loads behind it)
const INTRO_VIDEO = path.join(HOME, 'xcloud-intro.mp4');
// the same video as WebM (VP9), which every browser engine build plays; tried first
const INTRO_WEBM = path.join(HOME, 'xcloud-intro.webm');
// and as an animated picture, for engines that can't decode video at all (shown
// with the soundtrack played on its own)
const INTRO_FRAMES = path.join(HOME, 'xcloud-intro-frames.webp');
// and its soundtrack on its own (the picture version plays it; no video decoding needed)
const INTRO_AUDIO = path.join(HOME, 'xcloud-intro-audio.ogg');
// left by older versions (children mode); removed on start
const KIDS_FILE = path.join(HOME, 'children-mode');
// sets up and updates the browser engine
const BUILD_RUNTIME = path.join(HOME, 'Build-Runtime.py');

const DEFAULTS = {
  // the cloud gaming site's own address (www.xbox.com/<region>/play redirects here)
  start_url: 'https://play.xbox.com/en-us/play',
  // Microsoft's own sites: Xbox Cloud Gaming, Microsoft sign-in and account
  // pages, and the Xbox / Microsoft Store pages for signing up for Game
  // Pass, plus PayPal for paying for it. Nothing else.
  allowed: [
    'xbox.com', '*.xbox.com',
    'microsoft.com', '*.microsoft.com',
    'live.com', '*.live.com',
    '*.microsoftonline.com',
    '*.xboxlive.com',
    'aka.ms',
    'paypal.com', '*.paypal.com'
  ],
  user_agent: '',
  exit_hold_seconds: 2,
  show_exit_tip: true,
  keyboard_highlight: true,
  volume: 100,
  muted: false,              // the app's sound turned off (Settings > Volume)
  play_intro: true,          // true = every time, "daily" = once a day, false = never
  intro_volume: 100,         // the intro video's sound, 0-100
  intro_muted: false,        // true = the intro video plays silently
  stream_as_windows: false,  // tell the Xbox site this is a Windows PC (sharper on some setups)
  stream_resolution: 'auto', // the stream size asked for: 'auto' (720p), '1080p', '1080p-hq' or '1440p'
  video_sharpen: 'off',      // a sharpening filter on the stream: 'off', 'low', 'medium' or 'high'
  clarity_boost: false,      // a little more contrast and colour in the stream's picture
  video_contrast: 100,       // the stream's picture, 50-150% (100 = unchanged)
  video_saturation: 100,
  video_brightness: 100,
  stream_stats: false,       // a small box with the stream's resolution, fps, ping, bitrate...
  vibration: 100,            // controller vibration strength in games, 0 (off) to 100%
  language: 'auto',          // 'auto' = the same as Batocera
  controller_fix: true,      // put controllers the browser doesn't know (Steam Deck...) in the Xbox layout
  game_list: 'off',          // Batocera's Xbox Cloud list: 'off' (opens the app), 'all' cloud games, or 'picked' ones
  game_list_3d: false,       // the games' pictures in that list: 3D cases instead of the flat box art
  sign_out_on_exit: false,   // sign out of Xbox every time the app closes
  gpu_acceleration: false
};
// the stream options' choices (Settings)
const STREAM_RES = ['auto', '1080p', '1080p-hq', '1440p'];
const SHARPEN = ['off', 'low', 'medium', 'high'];
const VIBRATION = [0, 25, 50, 75, 100];
const PICTURE = ['video_contrast', 'video_saturation', 'video_brightness'];
// 50-150 in steps of 5; anything else is 100 (unchanged)
function pictureLevel(v) { const n = Number(v); return Number.isFinite(n) ? Math.round(Math.min(150, Math.max(50, n)) / 5) * 5 : 100; }
// the script that does them, in the Xbox page (stream.js)
let STREAM_JS = '';
try { STREAM_JS = fs.readFileSync(path.join(__dirname, 'stream.js'), 'utf8'); } catch (e) { /* logged at startup */ }
function streamCfg() {
  return { res: cfg.stream_resolution, sharpen: SHARPEN.indexOf(cfg.video_sharpen), clarity: cfg.clarity_boost, stats: cfg.stream_stats, vib: cfg.vibration,
    contrast: cfg.video_contrast, saturation: cfg.video_saturation, brightness: cfg.video_brightness };
}
function streamScript() {
  return `window.__xcloudStreamCfg = ${JSON.stringify(streamCfg())}; ${STREAM_JS}`;
}
// only on Xbox's own play pages (not sign-in or the Store)
function onXboxPlay(url) { return /^https:\/\/(play|www)\.xbox\.com\//i.test(String(url || '')); }
function applyStreamOptions(wc) {
  if (!wc) return;
  try {
    if (!onXboxPlay(wc.getURL())) return;
    wc.executeJavaScript(`${streamScript()} window.__xcloudStreamSet(${JSON.stringify(streamCfg())});`).catch(() => { /* page between loads */ });
  } catch (e) { /* closed */ }
}
// earlier versions' default start page, which now just redirects
const OLD_DEFAULT_START = /^https:\/\/www\.xbox\.com\/([a-z]{2}-[a-z]{2})\/play\/?$/i;

function log(msg) {
  try { fs.appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`); } catch (e) { /* ignore */ }
}
// keep the log small: over 1 MB, keep just the newest 256 KB
(function trimLog() {
  try {
    const size = fs.statSync(LOG).size;
    if (size <= 1024 * 1024) return;
    const keep = 256 * 1024;
    const fd = fs.openSync(LOG, 'r');
    const buf = Buffer.alloc(keep);
    fs.readSync(fd, buf, 0, keep, size - keep);
    fs.closeSync(fd);
    const text = buf.toString('utf8');
    fs.writeFileSync(LOG, `${new Date().toISOString()} (log trimmed to its newest part)\n` + text.slice(text.indexOf('\n') + 1));
  } catch (e) { /* no log yet */ }
})();

const profiles = require('./profiles').create(HOME, log);
// the profile playing now (null until profiles are set up)
let curProfile = profiles.last();

function loadConfig(profileId) {
  let user = {};
  try {
    user = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  } catch (e) {
    log(`config.json not used (${e.message}); using built-in settings`);
  }
  // a profile's own Settings choices on top of config.json
  if (profileId) Object.assign(user, profiles.settings(profileId));
  const cfg = Object.assign({}, DEFAULTS, user);
  // the built-in sites are always allowed; config.json's "allowed" adds to them
  const extra = Array.isArray(user.allowed) ? user.allowed : [];
  cfg.allowed = Array.from(new Set(DEFAULTS.allowed.concat(extra)));
  if (typeof cfg.start_url !== 'string' || !/^https:\/\//i.test(cfg.start_url)) cfg.start_url = DEFAULTS.start_url;
  // go straight to play.xbox.com instead of through the old address's redirect
  const old = cfg.start_url.match(OLD_DEFAULT_START);
  if (old) cfg.start_url = `https://play.xbox.com/${old[1].toLowerCase()}/play`;
  cfg.gpu_acceleration = cfg.gpu_acceleration === true;
  cfg.keyboard_highlight = cfg.keyboard_highlight !== false;
  const hold = Number(cfg.exit_hold_seconds);
  cfg.exit_hold_seconds = hold >= 0.5 && hold <= 10 ? hold : DEFAULTS.exit_hold_seconds;
  cfg.show_exit_tip = cfg.show_exit_tip !== false;
  cfg.introMode = cfg.play_intro === false ? 'off' : cfg.play_intro === 'daily' ? 'daily' : 'always';
  cfg.stream_as_windows = cfg.stream_as_windows === true;
  cfg.stream_resolution = STREAM_RES.includes(cfg.stream_resolution) ? cfg.stream_resolution : 'auto';
  cfg.video_sharpen = SHARPEN.includes(cfg.video_sharpen) ? cfg.video_sharpen : 'off';
  cfg.stream_stats = cfg.stream_stats === true;
  cfg.clarity_boost = cfg.clarity_boost === true;
  for (const k of PICTURE) cfg[k] = pictureLevel(cfg[k]);
  const vib = Number(cfg.vibration);
  cfg.vibration = Number.isFinite(vib) ? Math.round(Math.min(100, Math.max(0, vib)) / 25) * 25 : DEFAULTS.vibration;
  const iv = Number(cfg.intro_volume);
  cfg.intro_volume = Number.isFinite(iv) ? Math.round(Math.min(100, Math.max(0, iv))) : DEFAULTS.intro_volume;
  cfg.intro_muted = cfg.intro_muted === true;
  // the app's own text: Batocera's language unless one is picked in Settings
  const choice = String(cfg.language || 'auto');
  cfg.languageChoice = i18n.STRINGS[choice] ? choice : 'auto';
  cfg.language = cfg.languageChoice === 'auto' ? batoceraLanguage() : cfg.languageChoice;
  // the app's sound level, 0 (silent) to 100 (full)
  const vol = Number(cfg.volume);
  cfg.volume = Number.isFinite(vol) ? Math.round(Math.min(100, Math.max(0, vol))) : DEFAULTS.volume;
  cfg.muted = cfg.muted === true;
  cfg.sign_out_on_exit = cfg.sign_out_on_exit === true;
  return cfg;
}

// Batocera's language (system.language in batocera.conf, e.g. de_DE), as one
// of the app's languages
// HippOS (a Debian-based gaming system built like Batocera) runs this too
const HIPPOS_VERSION_FILE = process.env.XCLOUD_HIPPOS_VERSION || '/usr/share/hippos/version';
const ON_HIPPOS = (() => { try { return fs.existsSync(HIPPOS_VERSION_FILE); } catch (e) { return false; } })();
// the system's language: Batocera's batocera.conf, or HippOS's hippos.conf
// (the same kind of file; batocera.conf is still read there if it has one)
function batoceraLanguage() {
  const confs = ON_HIPPOS
    ? [process.env.XCLOUD_HIPPOS_CONF || '/userdata/system/hippos.conf', process.env.XCLOUD_BATOCERA_CONF || '/userdata/system/batocera.conf']
    : [process.env.XCLOUD_BATOCERA_CONF || '/userdata/system/batocera.conf'];
  let loc = '';
  for (const conf of confs) {
    try {
      const m = fs.readFileSync(conf, 'utf8').match(/^[ \t]*system\.language[ \t]*=[ \t]*([A-Za-z_.@-]+)/m);
      if (m) { loc = m[1]; break; }
    } catch (e) { /* not there */ }
  }
  if (!loc) loc = process.env.LANGUAGE || process.env.LC_ALL || process.env.LANG || '';
  return i18n.fromLocale(loc);
}

const cfg = loadConfig(curProfile && curProfile.id);
const allowList = rules.compile(cfg.allowed);
// the start page is always allowed
try {
  const s = new URL(cfg.start_url);
  allowList.push(rules.compileRule(s.hostname + s.pathname));
} catch (e) { /* already validated */ }
// Children's and teens' accounts: Microsoft itself limits what they can play
// and buy. The app only keeps them out of adults' profiles: when a child's
// or teen's profile is set up here, adult profiles need the PIN.
function isMinor(p) { return !!p && (p.age === 'Child' || p.age === 'Teen'); }
function minorsHere() { return profiles.list.some(isMinor); }
try { fs.unlinkSync(KIDS_FILE); } catch (e) { /* not there */ }
const isAllowed = url => rules.isAllowed(url, allowList);

// keep this app's sign-in separate from anything else on the system
app.setPath('userData', path.join(HOME, 'profile'));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// optional (Settings > GPU acceleration): ask Chromium to use the graphics
// chip even where it normally wouldn't, including decoding the game's video
// (VA-API). Read once at start, so a change applies the next time the app opens.
const GPU_AT_START = cfg.gpu_acceleration;
if (GPU_AT_START) {
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoDecodeLinuxGL,VaapiIgnoreDriverChecks,AcceleratedVideoDecodeLinuxGL');
}
// what the graphics chip is doing, for the log (after start)
function logGpu() {
  try {
    const f = app.getGPUFeatureStatus() || {};
    log(`gpu: acceleration ${GPU_AT_START ? 'on' : 'off'}; engine reports video decode ${f.video_decode || '?'}, compositing ${f.gpu_compositing || '?'}, webgl ${f.webgl || '?'}`);
  } catch (e) { /* not available */ }
}

// sites to open connections to early, while the start screen is up
const WARM_UP = ['https://play.xbox.com', 'https://www.xbox.com', 'https://login.live.com', 'https://xsts.auth.xboxlive.com'];

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWin = null;
// the browser storage (sign-in) of a profile; the first profile (and the app
// without profiles) uses the original one
function sessionFor(p) {
  const part = profiles.partition(p);
  return part ? session.fromPartition(part) : session.defaultSession;
}
function curSession() { return sessionFor(curProfile); }
const sessionsReady = new Set();
function setupSession(ses) {
  if (sessionsReady.has(ses)) return;
  sessionsReady.add(ses);
  const okPermissions = new Set(['fullscreen', 'pointerLock', 'keyboardLock', 'clipboard-sanitized-write']);
  try {
    ses.setPermissionRequestHandler((wc, permission, callback, details) => {
      const origin = (details && (details.requestingUrl || details.securityOrigin)) || wc.getURL();
      callback(okPermissions.has(permission) && rules.hostAllowed(origin, allowList));
    });
    ses.on('will-download', event => { event.preventDefault(); log('blocked a download'); });
  } catch (e) { /* ignore */ }
  try { ses.setUserAgent(cleanUserAgent()); } catch (e) { /* ignore */ }
  // open the connections (DNS + secure handshake) now, so the Xbox page
  // starts loading faster when it's asked for
  for (const url of WARM_UP) {
    try { ses.preconnect({ url, numSockets: 2 }); } catch (e) { /* older Electron: skip */ }
  }
}
// started from the F1 "Xbox Cloud Gaming Settings" shortcut: show only the settings
const SETTINGS_MODE = process.argv.includes('--xcloud-settings');

// Exiting: save the sign-in (cookies and site data) to disk, then close at
// once instead of a full, slower browser shutdown. Never waits more than
// 1.5 s for the save.
let exiting = false;
function fastExit(reason) {
  if (exiting) return;
  exiting = true;
  log(`exit requested (${reason})`);
  try { if (mainWin) mainWin.hide(); } catch (e) { /* ignore */ }  // get off the screen right away
  const ses = curSession();
  // Settings > Sign out when closing: forget the Xbox sign-in on the way out
  // (not when only the F1 Settings shortcut was open)
  if (cfg.sign_out_on_exit && !SETTINGS_MODE) {
    log('signing out of Xbox on exit (Settings > Sign out when closing)');
    if (curProfile) profiles.update(curProfile, { xuid: '', age: '' });
    const out = Promise.resolve().then(() => ses.clearStorageData()).then(() => ses.clearCache())
      .catch(e => log(`sign out on exit: ${e.message}`));
    Promise.race([out, new Promise(resolve => setTimeout(resolve, 4000))]).then(() => app.exit(0));
    return;
  }
  const saves = [];
  try { saves.push(ses.cookies.flushStore()); } catch (e) { /* ignore */ }
  try { if (ses.flushStorageData) ses.flushStorageData(); } catch (e) { /* ignore */ }
  const limit = new Promise(resolve => setTimeout(resolve, 1500));
  Promise.race([Promise.allSettled(saves), limit]).then(() => app.exit(0));
}


// The 🎮 emoji as a small picture, so it shows even where no emoji font is
// installed (Batocera). From Google's Noto Color Emoji, Apache License 2.0.
// the app's cloud icon, shown beside the title on the welcome screen
const APP_ICON_PNG = 'data:image/png;base64,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';
const GAMEPAD_PNG = 'data:image/png;base64,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';

// The app's own screens (the start screen and "can't connect") are written
// to files in the profile folder and loaded from there, so the controller
// helper (preload.js) always runs on them. Each also has its own small
// script for keyboard and mouse, so those work even without the helper.
// The screens answer by going to https://xcloud.invalid/<action>, which
// never leaves the app: main.js catches it (see handleAction).
const ACTION_PREFIX = 'https://xcloud.invalid/';

// a gear, drawn as a picture (Batocera's fonts may not have a gear symbol)
const GEAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6a.5.5 0 0 0 .1-.6l-2-3.5a.5.5 0 0 0-.6-.2l-2.5 1a7.4 7.4 0 0 0-1.7-1L14.4 2.4a.5.5 0 0 0-.5-.4h-4a.5.5 0 0 0-.5.4L9 5.1a7.4 7.4 0 0 0-1.7 1l-2.5-1a.5.5 0 0 0-.6.2l-2 3.5a.5.5 0 0 0 .1.6L4.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6a.5.5 0 0 0-.1.6l2 3.5a.5.5 0 0 0 .6.2l2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.7a.5.5 0 0 0 .5.4h4a.5.5 0 0 0 .5-.4l.4-2.7a7.4 7.4 0 0 0 1.7-1l2.5 1a.5.5 0 0 0 .6-.2l2-3.5a.5.5 0 0 0-.1-.6zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>';

// Regions where Xbox Cloud Gaming is available (Microsoft's 28 launch
// countries plus India, added November 2025), one entry per language the
// Xbox site offers there. The code picks the play.xbox.com address,
// e.g. en-gb -> https://play.xbox.com/en-gb/play. Names are in English so
// they show on any system's fonts.
const REGIONS = [
  ['en-us', 'United States (English)'], ['en-ca', 'Canada (English)'], ['fr-ca', 'Canada (French)'],
  ['es-mx', 'Mexico (Spanish)'], ['pt-br', 'Brazil (Portuguese)'], ['es-ar', 'Argentina (Spanish)'],
  ['en-gb', 'United Kingdom (English)'], ['en-ie', 'Ireland (English)'], ['fr-fr', 'France (French)'],
  ['de-de', 'Germany (German)'], ['de-at', 'Austria (German)'], ['de-ch', 'Switzerland (German)'],
  ['fr-ch', 'Switzerland (French)'], ['it-it', 'Italy (Italian)'], ['es-es', 'Spain (Spanish)'],
  ['pt-pt', 'Portugal (Portuguese)'], ['nl-nl', 'Netherlands (Dutch)'], ['nl-be', 'Belgium (Dutch)'],
  ['fr-be', 'Belgium (French)'], ['da-dk', 'Denmark (Danish)'], ['fi-fi', 'Finland (Finnish)'],
  ['nb-no', 'Norway (Norwegian)'], ['sv-se', 'Sweden (Swedish)'], ['pl-pl', 'Poland (Polish)'],
  ['cs-cz', 'Czech Republic (Czech)'], ['sk-sk', 'Slovakia (Slovak)'], ['hu-hu', 'Hungary (Hungarian)'],
  ['en-au', 'Australia (English)'], ['en-nz', 'New Zealand (English)'], ['ja-jp', 'Japan (Japanese)'],
  ['ko-kr', 'South Korea (Korean)'], ['en-in', 'India (English)']
];
const REGION_URL = code => `https://play.xbox.com/${code}/play`;
function currentRegion() {
  const m = cfg.start_url.match(/^https:\/\/play\.xbox\.com\/([a-z]{2}-[a-z]{2})\/play\/?$/i);
  const code = m && m[1].toLowerCase();
  return REGIONS.some(r => r[0] === code) ? code : 'custom';
}
function welcomeShown() { return cfg.show_exit_tip && !fs.existsSync(TIP_HIDDEN); }

// Shown each time the app opens, before xbox.com: how to exit, and it waits
// for a choice so that press can't also click the Xbox page.
function introHtml() {
  const L = cfg.language;
  const T = (k, v) => i18n.t(L, k, v);
  const holdText = i18n.secs(L, cfg.exit_hold_seconds);
  return `<!doctype html>
<html lang="${L}"><head><meta charset="utf-8"><title>Xbox Cloud Gaming</title>
<style>
  ${i18n.FONT_CSS}
  html,body{margin:0;height:100%;background:rgba(0,0,0,.62);color:#eee;font-family:${i18n.FONT_STACK}}
  body{display:flex;align-items:center;justify-content:center}
  @keyframes pop{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}
  .card{animation:pop .22s ease-out}
  .card{background:#1a1a1a;border:2px solid #2d2d2d;border-top:6px solid #107c10;border-radius:14px;
        padding:44px 64px;max-width:860px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.6)}
  h1{margin:0 0 6px;font-size:40px;font-weight:600;color:#fff;display:flex;align-items:center;justify-content:center;gap:16px}
  h1 img{height:64px;width:auto}
  .sub{margin:0 0 16px;font-size:20px;color:#9a9a9a}
  .best{display:inline-flex;align-items:center;gap:10px;margin:0 0 14px;padding:6px 20px 6px 14px;border-radius:999px;
        background:#13280f;border:2px solid #107c10;color:#7fd65a;font-size:19px;font-weight:600}
  .how{font-size:30px;line-height:1.5;margin:0 0 10px}
  .keys{display:flex;align-items:center;justify-content:center;gap:18px;margin:24px 0 10px;font-size:26px}
  .btn{display:inline-flex;align-items:center;justify-content:center;min-width:72px;height:72px;border-radius:36px;
       box-sizing:border-box;padding:0 6px;background:#2b2b2b;border:3px solid #6b6b6b;font-size:34px;color:#fff}
  .btn.word{font-size:17px;font-weight:700;letter-spacing:1px;padding:0 18px}
  .lbl{display:block;font-size:18px;color:#bdbdbd;margin-top:8px}
  .plus{font-size:40px;color:#8a8a8a;margin-bottom:26px}
  .dev{font-size:18px;color:#5dc21e;margin:6px 0 0;min-height:24px}
  .kb{font-size:22px;color:#cfcfcf;margin:18px 0 0}
  .kb kbd,.set kbd{display:inline-block;background:#2b2b2b;border:2px solid #6b6b6b;border-bottom-width:4px;border-radius:7px;
          padding:2px 12px;font:600 20px sans-serif;color:#fff}
  .note{font-size:20px;color:#9a9a9a;margin:0 0 26px}
  .row{display:flex;gap:22px;justify-content:center;flex-wrap:wrap}
  button{display:inline-flex;align-items:center;gap:14px;border-radius:10px;padding:16px 34px;font-size:24px;
         font-weight:600;cursor:pointer;font-family:inherit;outline:none}
  .go{background:#107c10;color:#fff;border:3px solid #107c10}
  .never{background:#262626;color:#ddd;border:3px solid #555}
  .settings{background:#262626;color:#ddd;border:3px solid #555}
  .settings svg{width:30px;height:30px}
  button:focus{outline:4px solid #fff;outline-offset:4px}
  .m{display:inline-flex;align-items:center;justify-content:center;min-width:38px;height:38px;border-radius:19px;
      box-sizing:border-box;padding:0 4px;background:#2b2b2b;border:2px solid #8a8a8a;color:#fff;font-size:12px;font-weight:700;letter-spacing:.5px}
  .m svg{width:24px;height:24px}
  .m.word{padding:0 10px}
  .set{font-size:20px;color:#cfcfcf;margin:6px 0 28px}
  .set b{color:#fff}
  .a,.y{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;
        font-weight:700;font-size:20px}
  .a{background:#fff;color:#107c10}
  .y{background:#d9a400;color:#1a1a1a}
  .hint{margin:22px 0 0;font-size:17px;color:#7d7d7d}
</style></head><body>
<div class="card" role="dialog" aria-labelledby="t">
  <h1 id="t"><img src="${APP_ICON_PNG}" alt="">Xbox Cloud Gaming</h1>
  <p class="sub">${T('before')}</p>
  <p class="best"><img src="${GAMEPAD_PNG}" alt="" width="30" height="30"> ${T('best')}</p>
  <p class="note">${T('anytime')}</p>
  <p class="how"><b>${T('hold')}</b></p>
  <div class="keys">
    <div><span class="btn word" id="k1g">SELECT</span><span class="lbl" id="k1l">Select</span></div>
    <div class="plus">+</div>
    <div><span class="btn word" id="k2g">START</span><span class="lbl" id="k2l">Start</span></div>
  </div>
  <p class="dev" id="dev">${T('pressAny')}</p>
  <p class="how">${T('toExit', { t: `<b>${holdText}</b>` })}</p>
  <p class="kb">${T('kbExit', { esc: '<kbd>Esc</kbd>', t: holdText })}</p>
  <p class="set">${T('back', { menu: '<b id="kml2">Start</b>', s: '<kbd>S</kbd>', t: i18n.secs(L, 1) })}</p>
  <div class="row">
    <button class="go" id="go" autofocus><span class="a" id="ka">A</span> ${T('go')}</button>
    <button class="never" id="never"><span class="y" id="ky">Y</span> ${T('never')}</button>
    <button class="settings" id="settings"><span class="m word" id="km">SELECT</span> ${T('settings')}</button>
  </div>
  <p class="hint" id="hint">${T('hintPad', { a: 'A', y: 'Y', menu: 'Select' })}</p>
</div>
<script>
// keyboard (including controllers Batocera maps to keys) and mouse
(function () {
  var go = document.getElementById('go'), never = document.getElementById('never'), settings = document.getElementById('settings');
  var buttons = [go, never, settings], sent = false;
  function act(path) {
    if (sent) return;
    sent = true; setTimeout(function () { sent = false; }, 3000);
    location.href = '${ACTION_PREFIX}' + path;
  }
  function choose(b) {
    if (b === never) act('continue?never=1');
    else if (b === settings) act('settings');
    else act('continue');
  }
  function focused() {
    if (buttons.indexOf(document.activeElement) < 0) go.focus();
    return document.activeElement;
  }
  function move(step) {
    var i = buttons.indexOf(focused());
    buttons[(i + step + buttons.length) % buttons.length].focus();
  }
  buttons.forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); choose(b); }); });
  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowUp' || (k === 'Tab' && e.shiftKey)) { e.preventDefault(); move(-1); }
    else if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'Tab') { e.preventDefault(); move(1); }
    else if (k === 'Enter' || k === 'NumpadEnter' || k === ' ' || k === 'Spacebar' || k === 'x' || k === 'X') {
      e.preventDefault(); choose(focused());
    } else if (k === 'y' || k === 'Y') { e.preventDefault(); choose(never); }
    // Backspace (or S) on a keyboard: Settings, like Select on a controller
    else if (k === 'Backspace' || k === 's' || k === 'S') { e.preventDefault(); choose(settings); }
  });
  window.addEventListener('load', function () { window.focus(); go.focus(); });
  go.focus();
})();
</script>
</body></html>`;
}

// The intro video. It covers the window while Xbox loads underneath. A, B,
// Menu, Enter or Space skip to its last frame (the logo).
function videoHtml() {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Xbox Cloud Gaming</title>
<style>
  html,body{margin:0;height:100%;background:#000;overflow:hidden;cursor:none}
  video{width:100%;height:100%;object-fit:cover;display:block}
  img{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;display:block}
</style></head><body>
<video id="v" autoplay${cfg.intro_muted ? ' muted' : ''} playsinline preload="auto"></video>
<script>
(function () {
  var v = document.getElementById('v'), done = false;
  // WebM first, the MP4 if that can't play (each one is tried before giving up)
  var files = ${JSON.stringify([INTRO_WEBM, INTRO_VIDEO].filter(f => fs.existsSync(f)).map(f => pathToFileURL(f).href))}, fi = 0, tried = [];
  v.src = files[0] || '';
  // Settings > Intro video sound
  v.muted = ${cfg.intro_muted ? 'true' : 'false'};
  v.volume = ${(cfg.intro_volume / 100).toFixed(2)};
  // why it ended goes in the log
  function finish(why) {
    if (done) return;
    done = true;
    location.href = '${ACTION_PREFIX}intro-done?why=' + encodeURIComponent(why || 'ended') + '&at=' + (v.currentTime || 0).toFixed(1);
  }
  function skip(why) {
    if (done) return;
    try { if (window.__introAudio) window.__introAudio.pause(); } catch (e) {}
    try { if (window.__introCtx) window.__introCtx.close(); } catch (e) {}
    try { if (!pic && v.duration) { v.pause(); v.currentTime = Math.max(0, v.duration - 0.05); } } catch (e) {}
    finish(why);
  }
  v.addEventListener('ended', function () { finish('played to the end'); });
  v.addEventListener('error', function () {
    tried.push((files[fi] || 'no file').split('/').pop() + ': ' + (v.error ? v.error.code + ' ' + (v.error.message || '') : '?'));
    if (++fi < files.length) { v.src = files[fi]; var r = v.play(); if (r && r.catch) r.catch(function () {}); return; }
    pictures();
  });
  // no video could be decoded: the animated picture, with the soundtrack
  var PIC = ${JSON.stringify(fs.existsSync(INTRO_FRAMES) ? pathToFileURL(INTRO_FRAMES).href : '')}, pic = false;
  function pictures() {
    if (!PIC) { finish('playback error (' + tried.join('; ') + ')'); return; }
    pic = true;
    v.removeAttribute('src'); v.style.display = 'none';
    var img = document.createElement('img');
    img.onerror = function () { finish('playback error (' + tried.join('; ') + '); the picture version failed too'); };
    img.onload = function () {
      // the soundtrack: decoded here and played straight to the speakers (Web
      // Audio, the way game sound goes), not through the media player, which
      // can fail the same way the video does; the media player only as a backup
      var sound = 'none';
      function viaPlayer(why) {
        var a = new Audio(), aud = ${JSON.stringify(fs.existsSync(INTRO_AUDIO) ? [pathToFileURL(INTRO_AUDIO).href] : [])}.concat(files), ai = 0;
        a.muted = v.muted; a.volume = v.volume;
        a.onerror = function () { if (++ai < aud.length) { a.src = aud[ai]; var r2 = a.play(); if (r2 && r2.catch) r2.catch(function () {}); } else sound = 'failed (' + why + '; player ' + ((a.error && a.error.code) || '?') + ')'; };
        a.src = aud[0] || '';
        var q = a.play(); if (q && q.catch) q.catch(function (e) { sound = 'failed (' + why + '; player ' + (e && e.name) + ')'; });
        window.__introAudio = a;
        sound = 'media player (' + why + ')';
      }
      var B64 = ${JSON.stringify(fs.existsSync(INTRO_AUDIO) ? fs.readFileSync(INTRO_AUDIO).toString('base64') : '')};
      if (v.muted) sound = 'muted';
      else if (!B64 || !(window.AudioContext || window.webkitAudioContext)) viaPlayer('no Web Audio');
      else {
        try {
          var ctx = new (window.AudioContext || window.webkitAudioContext)();
          window.__introCtx = ctx;
          var bin = atob(B64), buf = new Uint8Array(bin.length);
          for (var bi = 0; bi < bin.length; bi++) buf[bi] = bin.charCodeAt(bi);
          ctx.decodeAudioData(buf.buffer).then(function (ab) {
            var src = ctx.createBufferSource(), g = ctx.createGain();
            src.buffer = ab; g.gain.value = v.volume;
            src.connect(g); g.connect(ctx.destination);
            if (ctx.resume) ctx.resume();
            src.start();
            sound = 'Web Audio';
          }).catch(function (e) { viaPlayer('Web Audio: ' + (e && e.name)); });
        } catch (e) { viaPlayer('Web Audio: ' + (e && e.name)); }
      }
      setTimeout(function () {
        var c = window.__introCtx, a = window.__introAudio;
        var how = sound === 'Web Audio' && c ? 'Web Audio, ' + c.state + ', ' + c.currentTime.toFixed(1) + ' s played'
          : a ? sound + ', at ' + (a.currentTime || 0).toFixed(1) + ' s' : sound;
        finish('shown as pictures, the video could not be decoded (' + tried.join('; ') + '); sound: ' + how);
      }, 12100);
    };
    img.src = PIC;
    document.body.appendChild(img);
  }
  setTimeout(function () { finish('still not finished after 25 s'); }, 25000);           // never get stuck on the video
  // if playing with sound is refused, play it muted rather than skip it
  var p = v.play();
  // (a file that can't be played at all is left to the error handler: it tries the next one)
  if (p && p.catch) p.catch(function (e0) {
    if (pic || (e0 && e0.name !== 'NotAllowedError')) return;
    v.muted = true; var q = v.play();
    if (q && q.catch) q.catch(function (e) { if (!pic && e && e.name === 'NotAllowedError') finish('playing refused: ' + e.name); });
  });
  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === 'Enter' || k === 'NumpadEnter' || k === ' ' || k === 'x' || k === 'X' || k === 'F10') { e.preventDefault(); skip('skipped (' + (e.isTrusted ? 'key ' : 'controller, ') + k + ')'); }
  });
  window.addEventListener('mousedown', function () { skip('skipped (mouse)'); });
  window.addEventListener('load', function () { window.focus(); });
})();
</script>
</body></html>`;
}

function errorHtml() {
  const L = cfg.language;
  const T = k => i18n.t(L, k);
  return `<!doctype html>
<html lang="${L}"><head><meta charset="utf-8"><title>Xbox Cloud Gaming</title>
<style>
  ${i18n.FONT_CSS}
  html,body{margin:0;height:100%;background:#0e0e0e;color:#eee;font-family:${i18n.FONT_STACK}}
  body{display:flex;align-items:center;justify-content:center;text-align:center}
  h1{color:#5dc21e;font-weight:600;margin:0 0 16px}
  p{font-size:22px;line-height:1.5;margin:6px}
  button{margin-top:22px;background:#107c10;color:#fff;border:3px solid #107c10;border-radius:10px;padding:14px 40px;
         font-size:24px;font-weight:600;cursor:pointer;font-family:inherit;outline:none}
  button:focus{outline:4px solid #fff;outline-offset:4px}
</style></head><body><div>
  <h1>${T('errTitle')}</h1>
  <p>${T('errNet')}</p>
  <p>${T('errRetry')}</p>
  <p>${T('errExit')}</p>
  <button id="retry" autofocus>${T('errBtn')}</button>
</div>
<script>
(function () {
  var b = document.getElementById('retry');
  function retry() { location.href = '${ACTION_PREFIX}retry'; }
  b.addEventListener('click', function (e) { e.preventDefault(); retry(); });
  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === 'Enter' || k === 'NumpadEnter' || k === ' ' || k === 'x' || k === 'X') { e.preventDefault(); retry(); }
  });
  window.addEventListener('load', function () { window.focus(); b.focus(); });
})();
</script>
</body></html>`;
}

// ---------- settings screen ----------
// Opened from the welcome screen (returns there) or the F1 > Applications
// "Xbox Cloud Gaming Settings" shortcut (closes the app afterwards).
function settingsHtml() {
  const L = cfg.language;
  const custom = currentRegion() === 'custom';
  // the text for every language, so the screen changes language as you pick one
  const KEYS = ['settings', 'region', 'regionHelp', 'of', 'language', 'languageHelp', 'volume', 'volumeHelp', 'keys', 'keysHelp',
    'on', 'off', 'reloadT', 'reloadHelp', 'reloadBtn', 'save', 'cancel', 'sHint', 'sHintR', 'custom', 'auto',
    'intro', 'introHelp', 'introAlways', 'introDaily', 'introOff', 'signOutT', 'signOutHelp', 'signOutBtn', 'signOutConfirm',
    'winT', 'winHelp', 'version', 'resT', 'resAuto', 'res1080', 'resHq', 'res1440', 'resHelpAuto', 'resHelp1080', 'resHelpHq', 'resHelp1440',
    'secAcct', 'secGen', 'secStream', 'secPic', 'secPad', 'secBato', 'secHelp', 'autoH',
    'gpuT', 'gpuHelp', 'shT', 'shHelp', 'clT', 'clHelp', 'ctT', 'saT', 'brT', 'picHelp', 'shLow', 'shMed', 'shHigh', 'statsT', 'statsHelp', 'vibT', 'vibHelp', 'introSound', 'introSoundHelp', 'muted',
    'updT', 'updHelp', 'updBtn', 'updChecking', 'updNone', 'updGetting', 'updDone', 'updFail',
    'ctrlT', 'ctrlHelp', 'ctrlBtn', 'ctrlBack', 'soeT', 'soeHelp', 'profT', 'profHelp', 'profHelpNone', 'profBtn', 'glT', 'glOff', 'glAll', 'glPick', 'glHelpOff', 'glHelpAll', 'glHelpPick', 'glCount', 'gpT', 'gpOnly', 'glBusy', 'g3dT', 'g3dHelp', 'logsT', 'logsHelp', 'logsBtn', 'logsBusy', 'logsDone', 'logsFail', 'cacheT', 'cacheHelp', 'cacheBtn', 'cacheBusy', 'cacheDone',
    'c1a', 'c1b', 'c2a', 'c2b', 'c3a', 'c3b', 'c4a', 'c4b', 'c5a', 'c5b', 'c6a', 'c6b', 'c7a', 'c7b', 'c8a', 'c8b'];
  const T = {};
  for (const [code] of i18n.LANGS) {
    T[code] = Object.fromEntries(KEYS.map(k => [k, i18n.t(code, k)]));
    // how long to hold, for the Controls list
    T[code]._t = i18n.secs(code, cfg.exit_hold_seconds);
    T[code]._t1 = i18n.secs(code, 1);
  }
  const state = {
    codes: i18n.REGION_CODES, names: i18n.REGION_NAMES, custom: custom ? cfg.start_url : null,
    region: currentRegion(), langs: [['auto', '']].concat(i18n.LANGS), choice: cfg.languageChoice,
    detected: batoceraLanguage(), T, version: VERSION, hippos: ON_HIPPOS,
    volume: cfg.volume, vmute: cfg.muted, soe: cfg.sign_out_on_exit, highlight: cfg.keyboard_highlight, intro: cfg.introMode, windows: cfg.stream_as_windows,
    res: cfg.stream_resolution, sharpen: cfg.video_sharpen, clarity: cfg.clarity_boost, stats: cfg.stream_stats, vib: cfg.vibration, gpu: cfg.gpu_acceleration,
    pic: { ct: cfg.video_contrast, sa: cfg.video_saturation, br: cfg.video_brightness },
    ivol: cfg.intro_volume, imute: cfg.intro_muted,
    engine: process.versions.electron, appv: VERSION, upd,
    glist: cfg.game_list, g3d: !!cfg.game_list_3d, glCount: glState().mode === cfg.game_list ? (glState().count || 0) : 0, glBusy: !!glRun,
    game: pageGame(), gpicked: !!(pageGame() && pickedGames().some(g => g.id === pageGame().id)),
    reload: !SETTINGS_MODE,  // Reload dashboard only when the dashboard is open (not from the F1 shortcut)
    user: curProfile ? profileName(curProfile) : ''
  };
  const ICON_RELOAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';
  const ICON_PAD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7.5 6h9a5.5 5.5 0 0 1 5.3 7l-1.2 4.3a2.4 2.4 0 0 1-4.1 1L14.3 16H9.7l-2.2 2.3a2.4 2.4 0 0 1-4.1-1L2.2 13A5.5 5.5 0 0 1 7.5 6zM7 9v1.5H5.5v2H7V14h2v-1.5h1.5v-2H9V9H7zm8.5.2a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zm2 2.3a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z"/></svg>';
  const ICON_UPDATE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11 4h2v9.2l3.6-3.6L18 11l-6 6-6-6 1.4-1.4 3.6 3.6V4zM5 18h14v2H5z"/></svg>';
  const ICON_LOGS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V9h5.5L13 3.5zM7 12v2h10v-2H7zm0 4v2h7v-2H7z"/></svg>';
  const ICON_CACHE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2zM6 8h12l-1 13H7L6 8zm4 3v7h1.5v-7H10zm2.5 0v7H14v-7h-1.5z"/></svg>';
  const ICON_USER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 10c4 0 7 2 7 4.5V20H2v-1.5C2 16 5 14 9 14zm8.5-9.5a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4zM18 13c3 .3 5 1.9 5 4V19h-5v-.5c0-2-1-3.6-2.6-4.6.8-.6 1.6-.9 2.6-.9z"/></svg>';
  const ICON_SIGNOUT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 17l1.4-1.4L8.8 13H20v-2H8.8l2.6-2.6L10 7l-5 5 5 5zM4 21h8v-2H4V5h8V3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z"/></svg>';
  return `<!doctype html>
<html lang="${L}"><head><meta charset="utf-8"><title>Xbox Cloud Gaming Settings</title>
<style>
  ${i18n.FONT_CSS}
  html,body{margin:0;height:100%;background:rgba(0,0,0,.62);color:#eee;font-family:${i18n.FONT_STACK}}
  body{display:flex;align-items:center;justify-content:center}
  @keyframes pop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
  .card{background:#1a1a1a;border:2px solid #2d2d2d;border-top:6px solid #107c10;border-radius:14px;animation:pop .2s ease-out;
        padding:26px 48px 22px;width:960px;max-height:96vh;box-sizing:border-box;display:flex;flex-direction:column;
        box-shadow:0 20px 60px rgba(0,0,0,.6)}
  .list{overflow-y:auto;scrollbar-width:none;padding:2px}
  .list::-webkit-scrollbar{display:none}
  h1{margin:0 0 2px;font-size:32px;font-weight:600;color:#fff;display:flex;align-items:center;gap:14px}
  h1 svg{width:32px;height:32px;color:#5dc21e}
  .sub{margin:0 0 14px;font-size:16px;color:#9a9a9a}
  .row{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:9px 20px;margin:0 0 8px;
       border-radius:10px;background:#222;border:3px solid transparent;cursor:pointer}
  .row.on{border-color:#fff;background:#262f24}
  .sec{font-size:15px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#6fbf5f;margin:18px 4px 8px}
  .sec:first-child{margin-top:4px}
  .label{font-size:21px;font-weight:600}
  .help{font-size:14px;color:#9a9a9a;margin-top:2px;font-weight:400}
  .picker{display:flex;align-items:center;gap:12px}
  .arrow{width:38px;height:38px;border-radius:50%;border:2px solid #555;background:#2b2b2b;color:#fff;font-size:18px;
         display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;flex:none}
  .value{width:330px;text-align:center;font-size:19px;font-weight:600;color:#7fd65a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .count{font-size:12px;color:#7d7d7d;text-align:center}
  .bar{width:290px;height:14px;border-radius:7px;background:#3a3a3a;overflow:hidden}
  .bar i{display:block;height:100%;background:#107c10;transition:width .1s}
  .pct{min-width:60px;text-align:right;font-size:19px;font-weight:600;color:#7fd65a}
  .chip{display:inline-flex;align-items:center;gap:10px;padding:8px 20px;border-radius:20px;background:#2b2b2b;
        border:2px solid #555;font-size:18px;font-weight:600;color:#fff;white-space:nowrap}
  .chip svg{width:22px;height:22px}
  .row.on .chip{background:#107c10;border-color:#107c10}
  .chip.warn{background:#a4262c !important;border-color:#a4262c !important}
  .toggle{width:84px;height:40px;border-radius:20px;background:#444;position:relative;flex:none;transition:background .15s}
  .toggle.dim{opacity:.35}
  .toggle::after{content:'';position:absolute;top:5px;left:5px;width:30px;height:30px;border-radius:50%;background:#ddd;transition:left .15s}
  .toggle.yes{background:#107c10}
  .toggle.yes::after{left:49px;background:#fff}
  .toggle.mute.yes{background:#a4262c}
  .bar.off i{background:#555}
  .state{font-size:16px;color:#bdbdbd;min-width:42px;text-align:right}
  .buttons{display:flex;gap:20px;justify-content:center;margin-top:12px}
  button{border-radius:10px;padding:11px 44px;font-size:22px;font-weight:600;cursor:pointer;font-family:inherit;outline:none}
  .save{background:#107c10;color:#fff;border:3px solid #107c10}
  .cancel{background:#262626;color:#ddd;border:3px solid #555}
  button.on{outline:4px solid #fff;outline-offset:4px}
  .hint{margin:12px 0 0;font-size:14px;color:#7d7d7d;text-align:center}
  .chip.go{background:#107c10;border-color:#5dc21e}
  .cpanel{display:none;flex-direction:column;min-height:0}
  .card.copen .list,.card.copen .buttons,.card.copen #hint{display:none}
  .card.copen .cpanel{display:flex}
  .clist{overflow-y:auto;scrollbar-width:none}
  .clist::-webkit-scrollbar{display:none}
  .crow{display:flex;gap:26px;align-items:baseline;padding:11px 20px;margin:0 0 8px;border-radius:10px;background:#222}
  .crow .k{width:300px;flex:none;font-size:19px;font-weight:600;color:#fff}
  .crow .d{font-size:17px;color:#cfcfcf;line-height:1.35}
  .cback{display:flex;justify-content:center;margin-top:12px}
  .cback button{background:#262626;color:#ddd;border:3px solid #555}
</style></head><body>
<div class="card" role="dialog" aria-labelledby="t">
  <h1 id="t">${GEAR_SVG} <span id="title" data-k="settings"></span></h1>
  <p class="sub"><span id="crumb">Xbox Cloud Gaming</span></p>
  <div class="list" id="list">
  <div class="sec" data-k="secAcct"></div>
  <div class="row" id="row-user" style="display:${state.reload ? 'flex' : 'none'}">
    <div><div class="label" data-k="profT"></div><div class="help" id="user-help"></div></div>
    <span class="chip">${ICON_USER} <span data-k="profBtn"></span></span>
  </div>
  <div class="row" id="row-signout">
    <div><div class="label" data-k="signOutT"></div><div class="help" data-k="signOutHelp"></div></div>
    <span class="chip" id="signout-chip">${ICON_SIGNOUT} <span id="signout"></span></span>
  </div>
  <div class="row" id="row-soe">
    <div><div class="label" data-k="soeT"></div><div class="help" data-k="soeHelp"></div></div>
    <div class="picker"><span class="state" id="soe-state"></span><span class="toggle" id="soe"></span></div>
  </div>
  <div class="sec" data-k="secGen"></div>
  <div class="row" id="row-region">
    <div><div class="label" data-k="region"></div><div class="help" data-k="regionHelp"></div></div>
    <div><div class="picker"><span class="arrow" id="prev">&#9664;</span><span class="value" id="region"></span><span class="arrow" id="next">&#9654;</span></div>
    <div class="count" id="count"></div></div>
  </div>
  <div class="row" id="row-language">
    <div><div class="label" data-k="language"></div><div class="help" data-k="languageHelp"></div></div>
    <div><div class="picker"><span class="arrow" id="lprev">&#9664;</span><span class="value" id="language"></span><span class="arrow" id="lnext">&#9654;</span></div>
    <div class="count" id="lcount"></div></div>
  </div>
  <div class="row" id="row-volume">
    <div><div class="label" data-k="volume"></div><div class="help" data-k="volumeHelp"></div></div>
    <div class="picker"><span class="arrow" id="vdown">&minus;</span><span class="bar"><i id="vbar"></i></span><span class="arrow" id="vup">+</span><span class="pct" id="vpct" style="min-width:96px"></span>
    <span class="toggle" id="vmute" style="margin-left:6px"></span></div>
  </div>
  <div class="row" id="row-highlight">
    <div><div class="label" data-k="keys"></div><div class="help" data-k="keysHelp"></div></div>
    <div class="picker"><span class="state" id="highlight-state"></span><span class="toggle" id="highlight"></span></div>
  </div>
  <div class="row" id="row-intro">
    <div><div class="label" data-k="intro"></div><div class="help" data-k="introHelp"></div></div>
    <div class="picker"><span class="arrow" id="iprev">&#9664;</span><span class="value" id="intro" style="width:220px"></span><span class="arrow" id="inext">&#9654;</span></div>
  </div>
  <div class="row" id="row-isound">
    <div><div class="label" data-k="introSound"></div><div class="help" data-k="introSoundHelp"></div></div>
    <div class="picker"><span class="arrow" id="idown">&minus;</span><span class="bar" style="width:200px"><i id="ibar"></i></span><span class="arrow" id="iup">+</span><span class="pct" id="ipct" style="min-width:96px"></span>
    <span class="toggle" id="imute" style="margin-left:6px"></span></div>
  </div>
  <div class="sec" data-k="secStream"></div>
  <div class="row" id="row-res">
    <div><div class="label" data-k="resT"></div><div class="help" id="res-help"></div></div>
    <div class="picker"><span class="arrow" id="rsprev">&#9664;</span><span class="value" id="res" style="width:220px"></span><span class="arrow" id="rsnext">&#9654;</span></div>
  </div>
  <div class="row" id="row-windows">
    <div><div class="label" data-k="winT"></div><div class="help" data-k="winHelp"></div></div>
    <div class="picker"><span class="state" id="windows-state"></span><span class="toggle" id="windows"></span></div>
  </div>
  <div class="row" id="row-gpu">
    <div><div class="label" data-k="gpuT"></div><div class="help" data-k="gpuHelp"></div></div>
    <div class="picker"><span class="state" id="gpu-state"></span><span class="toggle" id="gpu"></span></div>
  </div>
  <div class="row" id="row-stats">
    <div><div class="label" data-k="statsT"></div><div class="help" data-k="statsHelp"></div></div>
    <div class="picker"><span class="state" id="stats-state"></span><span class="toggle" id="stats"></span></div>
  </div>
  <div class="sec" data-k="secPic"></div>
  <div class="row" id="row-sharpen">
    <div><div class="label" data-k="shT"></div><div class="help" data-k="shHelp"></div></div>
    <div class="picker"><span class="arrow" id="shprev">&#9664;</span><span class="value" id="sharpen" style="width:220px"></span><span class="arrow" id="shnext">&#9654;</span></div>
  </div>
  <div class="row" id="row-clarity">
    <div><div class="label" data-k="clT"></div><div class="help" data-k="clHelp"></div></div>
    <div class="picker"><span class="state" id="clarity-state"></span><span class="toggle" id="clarity"></span></div>
  </div>
  <div class="row" id="row-ct">
    <div><div class="label" data-k="ctT"></div><div class="help" data-k="picHelp"></div></div>
    <div class="picker"><span class="arrow" id="ctdown">&minus;</span><span class="bar" style="width:200px"><i id="ctbar"></i></span><span class="arrow" id="ctup">+</span><span class="pct" id="ctpct" style="min-width:96px"></span></div>
  </div>
  <div class="row" id="row-sa">
    <div><div class="label" data-k="saT"></div><div class="help" data-k="picHelp"></div></div>
    <div class="picker"><span class="arrow" id="sadown">&minus;</span><span class="bar" style="width:200px"><i id="sabar"></i></span><span class="arrow" id="saup">+</span><span class="pct" id="sapct" style="min-width:96px"></span></div>
  </div>
  <div class="row" id="row-br">
    <div><div class="label" data-k="brT"></div><div class="help" data-k="picHelp"></div></div>
    <div class="picker"><span class="arrow" id="brdown">&minus;</span><span class="bar" style="width:200px"><i id="brbar"></i></span><span class="arrow" id="brup">+</span><span class="pct" id="brpct" style="min-width:96px"></span></div>
  </div>
  <div class="sec" data-k="secPad"></div>
  <div class="row" id="row-controls">
    <div><div class="label" data-k="ctrlT"></div><div class="help" data-k="ctrlHelp"></div></div>
    <span class="chip">${ICON_PAD} <span data-k="ctrlBtn"></span></span>
  </div>
  <div class="row" id="row-vib">
    <div><div class="label" data-k="vibT"></div><div class="help" data-k="vibHelp"></div></div>
    <div class="picker"><span class="arrow" id="vbdown">&minus;</span><span class="bar" style="width:200px"><i id="vibbar"></i></span><span class="arrow" id="vbup">+</span><span class="pct" id="vibpct" style="min-width:96px"></span></div>
  </div>
  <div class="sec" data-k="secBato"></div>
  <div class="row" id="row-glist">
    <div><div class="label" data-k="glT"></div><div class="help" id="gl-help"></div></div>
    <div class="picker"><span class="arrow" id="gprev">&#9664;</span><span class="value" id="glist" style="width:260px"></span><span class="arrow" id="gnext">&#9654;</span></div>
  </div>
  <div class="row" id="row-gpick" style="display:none">
    <div><div class="label" data-k="gpT"></div><div class="help" id="gp-help"></div></div>
    <div class="picker"><span class="state" id="gpick-state"></span><span class="toggle" id="gpick"></span></div>
  </div>
  <div class="row" id="row-g3d" style="display:none">
    <div><div class="label" data-k="g3dT"></div><div class="help" data-k="g3dHelp"></div></div>
    <div class="picker"><span class="state" id="g3d-state"></span><span class="toggle" id="g3d"></span></div>
  </div>
  <div class="sec" data-k="secHelp"></div>
  <div class="row" id="row-reload" style="display:${state.reload ? 'flex' : 'none'}">
    <div><div class="label" data-k="reloadT"></div><div class="help" data-k="reloadHelp"></div></div>
    <span class="chip">${ICON_RELOAD} <span data-k="reloadBtn"></span></span>
  </div>
  <div class="row" id="row-cache">
    <div><div class="label" data-k="cacheT"></div><div class="help" data-k="cacheHelp"></div></div>
    <span class="chip">${ICON_CACHE} <span id="cache"></span></span>
  </div>
  <div class="row" id="row-logs">
    <div><div class="label" data-k="logsT"></div><div class="help" id="logs-help"></div></div>
    <span class="chip">${ICON_LOGS} <span id="logs"></span></span>
  </div>
  <div class="row" id="row-update">
    <div><div class="label" data-k="updT"></div><div class="help" id="upd-help"></div></div>
    <span class="chip" id="upd-chip">${ICON_UPDATE} <span id="upd"></span></span>
  </div>
  </div>
  <div class="cpanel" id="controls">
    <div class="clist" id="clist"></div>
    <div class="cback"><button class="on" id="cback" data-k="ctrlBack"></button></div>
  </div>
  <div class="buttons"><button class="save" id="save" data-k="save"></button><button class="cancel" id="cancel" data-k="cancel"></button></div>
  <p class="hint" id="hint"></p>
</div>
<script>
(function () {
  var S = ${JSON.stringify(state).replace(/</g, '\\u003c')};
  // the region list: an address that isn't one of the regions shows first, as "Custom"
  var regions = (S.custom ? ['custom'] : []).concat(S.codes);
  var ri = Math.max(0, regions.indexOf(S.region));
  var li = Math.max(0, S.langs.findIndex(function (l) { return l[0] === S.choice; }));
  var INTRO = ['always', 'daily', 'off'], ii = Math.max(0, INTRO.indexOf(S.intro));
  var GL = ['off', 'all', 'picked'], gi = Math.max(0, GL.indexOf(S.glist));
  // the stream options
  var RES = ['auto', '1080p', '1080p-hq', '1440p'], rsi = Math.max(0, RES.indexOf(S.res));
  var SH = ['off', 'low', 'medium', 'high'], shi = Math.max(0, SH.indexOf(S.sharpen));
  // a child's profile doesn't get the rows that look after the whole machine
  // the game list's own rows only show while it's on: "This game in
  // Batocera's list" with Games I pick (on a game's page), 3D game boxes with
  // either choice; they come and go as the choice above them changes
  var rows = [], LAST = 0;
  function buildRows() {
    // the same order as on screen, section by section
    rows = (S.reload ? ['row-user'] : []).concat(['row-signout', 'row-soe'])
      .concat(['row-region', 'row-language', 'row-volume', 'row-highlight', 'row-intro', 'row-isound'])
      .concat(['row-res', 'row-windows', 'row-gpu', 'row-stats'])
      .concat(['row-sharpen', 'row-clarity', 'row-ct', 'row-sa', 'row-br'])
      .concat(['row-controls', 'row-vib'])
      .concat(['row-glist'].concat(S.game && GL[gi] === 'picked' ? ['row-gpick'] : []).concat(GL[gi] !== 'off' ? ['row-g3d'] : []))
      .concat(S.reload ? ['row-reload'] : []).concat(['row-cache', 'row-logs', 'row-update', 'buttons']);
    LAST = rows.length - 1;
    ['row-gpick', 'row-g3d'].forEach(function (id) { document.getElementById(id).style.display = rows.indexOf(id) >= 0 ? 'flex' : 'none'; });
  }
  var copen = false;   // the Controls list is showing
  var row = 0, btn = 0, sent = false, confirmUntil = 0, confirmTimer = null;
  function cur() { return rows[row]; }
  // the language the screen is shown in: the one picked, or Batocera's for "Same as Batocera"
  function ui() { return S.langs[li][0] === 'auto' ? S.detected : S.langs[li][0]; }
  function autonym(code) { var f = S.langs.filter(function (l) { return l[0] === code; })[0]; return f ? f[1] : code; }
  // a short beep at the chosen volume, so you can hear the level
  var actx = null;
  function beep(level) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = 660; g.gain.value = 0.25 * (level === undefined ? S.volume : level) / 100;
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + 0.09);
    } catch (e) { /* no sound device */ }
  }
  var $ = function (id) { return document.getElementById(id); };
  buildRows();
  // opened over a game's page with Games I pick: straight to "This game in Batocera's list"
  if (S.game && S.glist === 'picked' && rows.indexOf('row-gpick') >= 0) row = rows.indexOf('row-gpick');
  function tx(k, vars) {
    var s = S.T[ui()][k];
    if (vars) s = s.replace(/\\{(\\w+)\\}/g, function (m, n) { return n in vars ? vars[n] : m; });
    return s;
  }
  function regionName(code) {
    if (code === 'custom') return tx('custom', { url: S.custom });
    return S.names[ui()][S.codes.indexOf(code)];
  }
  function confirming() { return Date.now() < confirmUntil; }
  // the names of the controller's View and Menu buttons
  function padNames() {
    var id = '';
    try { var ps = navigator.getGamepads(); for (var i = 0; i < ps.length; i++) if (ps[i]) { id = ps[i].id; break; } } catch (e) {}
    id = id.toLowerCase();
    if (/054c|sony|playstation|dualshock|dualsense/.test(id)) return { view: 'Share', menu: 'Options' };
    return { view: 'View', menu: 'Menu' };
  }
  function renderControls() {
    var n = padNames(), T = S.T[ui()];
    var vars = { view: n.view, menu: n.menu, t: T._t, t1: T._t1 };
    var list = $('clist');
    list.textContent = '';
    for (var i = 1; i <= 8; i++) {
      var r = document.createElement('div'); r.className = 'crow';
      var k = document.createElement('div'); k.className = 'k'; k.textContent = tx('c' + i + 'a', vars);
      var d = document.createElement('div'); d.className = 'd'; d.textContent = tx('c' + i + 'b', vars);
      r.appendChild(k); r.appendChild(d); list.appendChild(r);
    }
  }
  function updText() {
    var u = S.upd || { state: 'idle' };
    if (u.state === 'checking') return tx('updChecking');
    if (u.state === 'none') return tx('updNone');
    if (u.state === 'getting') return tx('updGetting', { p: u.p || 0 });
    if (u.state === 'done') return tx('updDone');
    if (u.state === 'fail') return tx('updFail');
    return tx('updBtn');
  }
  function render() {
    document.documentElement.lang = ui();
    Array.prototype.forEach.call(document.querySelectorAll('[data-k]'), function (el) { el.textContent = tx(el.getAttribute('data-k')); });
    // on the Controls page: "Controls" as the title, under "Settings"
    $('title').textContent = tx(copen ? 'ctrlT' : 'settings');
    $('crumb').textContent = (copen ? 'Xbox Cloud Gaming \u203a ' + tx('settings') : 'Xbox Cloud Gaming') + (S.user ? ' \u00b7 ' + S.user : '');
    $('user-help').textContent = S.user ? tx('profHelp', { name: S.user }) : tx('profHelpNone');
    $('cache').textContent = S.cache === 'busy' ? tx('cacheBusy') : S.cache ? tx('cacheDone', { mb: S.cache }) : tx('cacheBtn');
    var uv = S.upd && S.upd.state === 'done' ? S.upd : null;
    $('upd-help').textContent = tx('updHelp', { a: (uv && uv.a) || S.appv, e: (uv && uv.e) || S.engine });
    $('logs').textContent = S.logs === 'busy' ? tx('logsBusy') : S.logs === 'fail' ? tx('logsFail') : S.logs ? '\u2713' : tx('logsBtn');
    $('logs-help').textContent = S.logs && S.logs !== 'busy' && S.logs !== 'fail' ? tx('logsDone', { file: S.logs }) : tx('logsHelp');
    $('upd').textContent = updText();
    $('upd-chip').className = 'chip' + (S.upd && (S.upd.state === 'getting' || S.upd.state === 'done') ? ' go' : '');
    document.querySelector('.card').className = 'card' + (copen ? ' copen' : '');
    if (copen) renderControls();
    $('region').textContent = regionName(regions[ri]);
    $('count').textContent = tx('of', { i: ri + 1, n: regions.length });
    $('language').textContent = S.langs[li][0] === 'auto' ? tx(S.hippos ? 'autoH' : 'auto', { lang: autonym(S.detected) }) : S.langs[li][1];
    $('lcount').textContent = tx('of', { i: li + 1, n: S.langs.length });
    $('vbar').style.width = S.volume + '%';
    $('vbar').parentNode.className = 'bar' + (S.vmute ? ' off' : '');
    $('vpct').textContent = S.vmute ? tx('muted') : S.volume + '%';
    $('vmute').className = 'toggle mute' + (S.vmute ? ' yes' : '');
    $('highlight').className = 'toggle' + (S.highlight ? ' yes' : '');
    $('highlight-state').textContent = S.highlight ? tx('on') : tx('off');
    $('soe').className = 'toggle' + (S.soe ? ' yes' : '');
    $('soe-state').textContent = S.soe ? tx('on') : tx('off');
    $('glist').textContent = tx({ off: 'glOff', all: 'glAll', picked: 'glPick' }[GL[gi]]);
    $('gl-help').textContent = S.glBusy ? tx('glBusy') : tx({ off: 'glHelpOff', all: 'glHelpAll', picked: 'glHelpPick' }[GL[gi]]) +
      (GL[gi] === S.glist && S.glist !== 'off' && S.glCount ? ' \u00b7 ' + tx('glCount', { n: S.glCount }) : '');
    if (S.game) {
      var canPick = GL[gi] === 'picked';
      $('gpick').className = 'toggle' + (S.gpicked && canPick ? ' yes' : '') + (canPick ? '' : ' dim');
      $('gpick-state').textContent = canPick ? (S.gpicked ? tx('on') : tx('off')) : '';
      $('gp-help').textContent = canPick ? S.game.title : tx('gpOnly');
    }
    $('g3d').className = 'toggle' + (S.g3d ? ' yes' : '');
    $('g3d-state').textContent = S.g3d ? tx('on') : tx('off');
    $('intro').textContent = tx({ always: 'introAlways', daily: 'introDaily', off: 'introOff' }[INTRO[ii]]);
    $('ibar').style.width = S.ivol + '%';
    $('ibar').parentNode.className = 'bar' + (S.imute ? ' off' : '');
    $('ipct').textContent = S.imute ? tx('muted') : S.ivol + '%';
    $('imute').className = 'toggle mute' + (S.imute ? ' yes' : '');
    $('windows').className = 'toggle' + (S.windows ? ' yes' : '');
    $('windows-state').textContent = S.windows ? tx('on') : tx('off');
    $('res').textContent = tx({ auto: 'resAuto', '1080p': 'res1080', '1080p-hq': 'resHq', '1440p': 'res1440' }[RES[rsi]]);
    $('res-help').textContent = tx({ auto: 'resHelpAuto', '1080p': 'resHelp1080', '1080p-hq': 'resHelpHq', '1440p': 'resHelp1440' }[RES[rsi]]);
    $('sharpen').textContent = tx({ off: 'off', low: 'shLow', medium: 'shMed', high: 'shHigh' }[SH[shi]]);
    $('clarity').className = 'toggle' + (S.clarity ? ' yes' : '');
    $('clarity-state').textContent = S.clarity ? tx('on') : tx('off');
    ['ct', 'sa', 'br'].forEach(function (k) {
      $(k + 'bar').style.width = S.pic[k] - 50 + '%';
      $(k + 'pct').textContent = S.pic[k] + '%';
    });
    $('gpu').className = 'toggle' + (S.gpu ? ' yes' : '');
    $('gpu-state').textContent = S.gpu ? tx('on') : tx('off');
    $('stats').className = 'toggle' + (S.stats ? ' yes' : '');
    $('stats-state').textContent = S.stats ? tx('on') : tx('off');
    $('vibbar').style.width = S.vib + '%';
    $('vibbar').parentNode.className = 'bar' + (S.vib ? '' : ' off');
    $('vibpct').textContent = S.vib ? S.vib + '%' : tx('off');
    $('signout').textContent = confirming() ? tx('signOutConfirm') : tx('signOutBtn');
    $('signout-chip').className = 'chip' + (confirming() ? ' warn' : '');
    $('hint').textContent = tx('sHint') + (S.reload ? tx('sHintR') : '');
    rows.forEach(function (id, i) { if (id !== 'buttons') $(id).className = 'row' + (i === row ? ' on' : ''); });
    $('save').className = 'save' + (row === LAST && btn === 0 ? ' on' : '');
    $('cancel').className = 'cancel' + (row === LAST && btn === 1 ? ' on' : '');
    if (cur() !== 'buttons') {
      try {
        // the first row of a section brings its heading into view too
        var el = $(cur()), prev = el.previousElementSibling;
        if (prev && prev.className === 'sec') prev.scrollIntoView({ block: 'nearest' });
        el.scrollIntoView({ block: 'nearest' });
      } catch (e) {}
    }
  }
  function go(path) {
    if (sent) return;
    sent = true; setTimeout(function () { sent = false; }, 3000);
    location.href = '${ACTION_PREFIX}' + path;
  }
  function save() {
    go('settings-save?region=' + encodeURIComponent(regions[ri]) + '&lang=' + encodeURIComponent(S.langs[li][0]) +
       '&volume=' + S.volume + '&highlight=' + (S.highlight ? 1 : 0) + '&intro=' + INTRO[ii] + '&windows=' + (S.windows ? 1 : 0) +
       '&res=' + RES[rsi] + '&sharpen=' + SH[shi] + '&clarity=' + (S.clarity ? 1 : 0) + '&ct=' + S.pic.ct + '&sa=' + S.pic.sa + '&br=' + S.pic.br + '&gpu=' + (S.gpu ? 1 : 0) + '&stats=' + (S.stats ? 1 : 0) + '&vib=' + S.vib +
       '&ivol=' + S.ivol + '&imute=' + (S.imute ? 1 : 0) + '&vmute=' + (S.vmute ? 1 : 0) + '&soe=' + (S.soe ? 1 : 0) + '&glist=' + GL[gi] + '&g3d=' + (S.g3d ? 1 : 0) +
         (S.game ? '&gid=' + S.game.id + '&gslug=' + encodeURIComponent(S.game.slug) + '&gpick=' + (S.gpicked ? 1 : 0) : ''));
  }
  function cancel() { go('settings-cancel'); }
  // Updates: one press checks the app and the engine and gets whatever is
  // newer by itself; it's used the next time the app opens
  function update() {
    var st = (S.upd || {}).state || 'idle';
    if (st !== 'idle' && st !== 'none' && st !== 'fail') return;
    S.upd = { state: 'checking', p: 0 };
    render();
    location.href = '${ACTION_PREFIX}settings-update-check';
  }
  window.__updateStatus = function (u) { S.upd = u; render(); };
  // Clear cache: the stored copies of web pages, pictures and scripts (not the sign-in)
  function clearCache() {
    if (S.cache === 'busy') return;
    S.cache = 'busy'; render();
    location.href = '${ACTION_PREFIX}settings-clear-cache';
  }
  window.__cacheStatus = function (mb) { S.cache = mb; render(); };
  function saveLogs() {
    if (S.logs === 'busy') return;
    S.logs = 'busy'; render();
    location.href = '${ACTION_PREFIX}settings-logs';
  }
  window.__logsStatus = function (f) { S.logs = f || 'fail'; render(); };
  function openControls() { copen = true; render(); try { $('clist').scrollTop = 0; } catch (e) {} }
  function closeControls() { copen = false; render(); }
  function reload() { if (S.reload) go('settings-reload'); }
  // sign out needs a second press within 4 seconds
  function signOut() {
    if (confirming()) { go('settings-signout'); return; }
    confirmUntil = Date.now() + 4000;
    clearTimeout(confirmTimer); confirmTimer = setTimeout(render, 4100);
    render();
  }
  function change(step) {
    var r = cur();
    if (r === 'row-region') ri = (ri + step + regions.length) % regions.length;
    else if (r === 'row-language') li = (li + step + S.langs.length) % S.langs.length;
    else if (r === 'row-volume') {
      var v = Math.min(100, Math.max(0, Math.round((S.volume + step * 10) / 10) * 10));
      if (v !== S.volume || S.vmute) { S.volume = v; S.vmute = false; beep(); }
    }
    else if (r === 'row-highlight') S.highlight = !S.highlight;
    else if (r === 'row-soe') S.soe = !S.soe;
    else if (r === 'row-g3d') S.g3d = !S.g3d;
    else if (r === 'row-glist') { gi = (gi + step + GL.length) % GL.length; buildRows(); row = rows.indexOf('row-glist'); }
    else if (r === 'row-gpick') { if (GL[gi] === 'picked') S.gpicked = !S.gpicked; }
    else if (r === 'row-intro') ii = (ii + step + INTRO.length) % INTRO.length;
    else if (r === 'row-isound') {
      var iv = Math.min(100, Math.max(0, Math.round((S.ivol + step * 10) / 10) * 10));
      if (iv !== S.ivol) { S.ivol = iv; S.imute = false; beep(S.ivol); }
    }
    else if (r === 'row-windows') S.windows = !S.windows;
    else if (r === 'row-res') rsi = (rsi + step + RES.length) % RES.length;
    else if (r === 'row-sharpen') shi = (shi + step + SH.length) % SH.length;
    else if (r === 'row-stats') S.stats = !S.stats;
    else if (r === 'row-gpu') S.gpu = !S.gpu;
    else if (r === 'row-clarity') S.clarity = !S.clarity;
    else if (r === 'row-ct' || r === 'row-sa' || r === 'row-br') { var pk = r.slice(4); S.pic[pk] = Math.min(150, Math.max(50, S.pic[pk] + step * 5)); }
    else if (r === 'row-vib') S.vib = Math.min(100, Math.max(0, S.vib + step * 25));
    else if (r === 'buttons') btn = btn === 0 ? 1 : 0;
    else return;
    render();
  }
  function select() {
    var r = cur();
    if (r === 'buttons') { btn === 0 ? save() : cancel(); return; }
    if (r === 'row-volume') { S.vmute = !S.vmute; render(); if (!S.vmute) beep(); return; } // A / Enter: mute or unmute
    if (r === 'row-reload') { reload(); return; }
    if (r === 'row-signout') { signOut(); return; }
    if (r === 'row-controls') { openControls(); return; }
    if (r === 'row-user') { location.href = '${ACTION_PREFIX}settings-profiles'; return; }
    if (r === 'row-cache') { clearCache(); return; }
    if (r === 'row-logs') { saveLogs(); return; }
    if (r === 'row-update') { update(); return; }
    if (r === 'row-isound') { S.imute = !S.imute; render(); return; }   // A / Enter: mute or unmute
    if (r === 'row-ct' || r === 'row-sa' || r === 'row-br') { S.pic[r.slice(4)] = 100; render(); return; }   // A / Enter: back to 100%
    change(1);
  }
  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if (copen) {
      // the Controls list: up / down scroll it, anything else goes back
      e.preventDefault();
      if (k === 'ArrowUp') $('clist').scrollTop -= 90;
      else if (k === 'ArrowDown') $('clist').scrollTop += 90;
      else if (k === 'Escape' || k === 'Backspace' || k === 'Enter' || k === 'NumpadEnter' || k === ' ' || k === 'x' || k === 'X' || k === 'F10') closeControls();
      return;
    }
    if (k === 'ArrowUp' || (k === 'Tab' && e.shiftKey)) { e.preventDefault(); row = (row + LAST) % rows.length; render(); }
    else if (k === 'ArrowDown' || k === 'Tab') { e.preventDefault(); row = (row + 1) % rows.length; render(); }
    else if (k === 'ArrowLeft') { e.preventDefault(); change(-1); }
    else if (k === 'ArrowRight') { e.preventDefault(); change(1); }
    else if (k === 'Enter' || k === 'NumpadEnter' || k === ' ' || k === 'x' || k === 'X') { e.preventDefault(); select(); }
    else if (k === 'Escape' || k === 'Backspace') { e.preventDefault(); cancel(); }
    else if (k === 'r' || k === 'R') { e.preventDefault(); reload(); }
    else if (k === 'F10' || k === 's' || k === 'S') { e.preventDefault(); save(); } // F10 = the controller's Menu button (sent by the app)
  });
  // mouse
  function rowOf(id) { return rows.indexOf(id); }
  function arrow(id, r, step) { $(id).addEventListener('click', function (e) { e.stopPropagation(); row = rowOf(r); change(step); }); }
  arrow('prev', 'row-region', -1); arrow('next', 'row-region', 1);
  arrow('lprev', 'row-language', -1); arrow('lnext', 'row-language', 1);
  arrow('vdown', 'row-volume', -1); arrow('vup', 'row-volume', 1);
  arrow('iprev', 'row-intro', -1); arrow('inext', 'row-intro', 1);
  arrow('gprev', 'row-glist', -1); arrow('gnext', 'row-glist', 1);
  arrow('idown', 'row-isound', -1); arrow('iup', 'row-isound', 1);
  arrow('rsprev', 'row-res', -1); arrow('rsnext', 'row-res', 1);
  arrow('shprev', 'row-sharpen', -1); arrow('shnext', 'row-sharpen', 1);
  arrow('vbdown', 'row-vib', -1); arrow('vbup', 'row-vib', 1);
  ['ct', 'sa', 'br'].forEach(function (k) { arrow(k + 'down', 'row-' + k, -1); arrow(k + 'up', 'row-' + k, 1); });
  $('vmute').addEventListener('click', function (e) { e.stopPropagation(); row = rowOf('row-volume'); S.vmute = !S.vmute; render(); if (!S.vmute) beep(); });
  $('imute').addEventListener('click', function (e) { e.stopPropagation(); row = rowOf('row-isound'); S.imute = !S.imute; render(); });
  $('row-isound').addEventListener('click', function () { row = rowOf('row-isound'); render(); });
  ['row-region', 'row-language', 'row-volume', 'row-intro', 'row-glist', 'row-res', 'row-sharpen', 'row-vib', 'row-ct', 'row-sa', 'row-br'].forEach(function (id) {
    $(id).addEventListener('click', function () { row = rowOf(id); render(); });
  });
  ['row-highlight', 'row-windows', 'row-gpu', 'row-clarity', 'row-stats', 'row-soe', 'row-gpick', 'row-g3d'].forEach(function (id) {
    $(id).addEventListener('click', function () { row = rowOf(id); change(1); });
  });
  $('row-reload').addEventListener('click', function () { row = rowOf('row-reload'); render(); reload(); });
  $('row-signout').addEventListener('click', function () { row = rowOf('row-signout'); signOut(); });
  $('row-cache').addEventListener('click', function () { row = rowOf('row-cache'); render(); clearCache(); });
  $('row-logs').addEventListener('click', function () { row = rowOf('row-logs'); render(); saveLogs(); });
  $('row-user').addEventListener('click', function () { row = rowOf('row-user'); render(); location.href = '${ACTION_PREFIX}settings-profiles'; });
  $('row-controls').addEventListener('click', function () { row = rowOf('row-controls'); openControls(); });
  $('row-update').addEventListener('click', function () { row = rowOf('row-update'); render(); update(); });
  $('cback').addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); closeControls(); });
  $('save').addEventListener('click', function (e) { e.preventDefault(); save(); });
  $('cancel').addEventListener('click', function (e) { e.preventDefault(); cancel(); });
  window.addEventListener('load', function () { window.focus(); });
  render();
})();
</script>
</body></html>`;
}

// where to go after the settings screen: back to the welcome screen, or
// close the app (when it was opened from the F1 shortcut)
let settingsReturn = 'welcome';
let settingsWc = null;
function openSettings(wc, returnTo) {
  settingsReturn = returnTo;
  settingsWc = wc;
  log(`settings opened (${returnTo === 'exit' ? 'from the F1 shortcut' : returnTo === 'dashboard' ? 'from the dashboard' : 'from the welcome screen'})`);
  showAppPage(wc, 'xcloud-settings.html', settingsHtml());
}
function leaveSettings(wc) {
  if (settingsReturn === 'exit') { fastExit('settings closed'); return; }
  // opened from the dashboard (Backspace): straight back to it
  if (settingsReturn === 'dashboard' && isOverlay(wc)) { closeOverlay(); return; }
  showAppPage(wc, 'xcloud-intro.html', introHtml());
}

// Save the settings screen's choices to config.json, keeping every other setting in it.
function saveSettings(region, volume, highlight, language, intro, asWindows, introVol, introMute, volMute, signOutOnExit, stream) {
  let obj = {};
  try {
    obj = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  } catch (e) {
    if (fs.existsSync(CONFIG)) {
      try { fs.copyFileSync(CONFIG, CONFIG + '.bak'); log('config.json had a mistake; kept a copy as config.json.bak'); } catch (e2) { /* ignore */ }
    }
    obj = {};
  }
  if (region !== 'custom' && REGIONS.some(r => r[0] === region)) {
    obj.start_url = REGION_URL(region);
    cfg.start_url = obj.start_url;
  }
  if (Number.isFinite(volume)) {
    cfg.volume = Math.round(Math.min(100, Math.max(0, volume)));
    obj.volume = cfg.volume;
  }
  if (typeof signOutOnExit === 'boolean') {
    cfg.sign_out_on_exit = signOutOnExit;
    obj.sign_out_on_exit = signOutOnExit;
  }
  if (typeof volMute === 'boolean') {
    cfg.muted = volMute;
    obj.muted = volMute;
  }
  obj.keyboard_highlight = highlight;
  cfg.keyboard_highlight = highlight;
  if (['always', 'daily', 'off'].includes(intro)) {
    cfg.introMode = intro;
    obj.play_intro = intro === 'always' ? true : intro === 'daily' ? 'daily' : false;
  }
  if (Number.isFinite(introVol)) {
    cfg.intro_volume = Math.round(Math.min(100, Math.max(0, introVol)));
    obj.intro_volume = cfg.intro_volume;
  }
  if (typeof introMute === 'boolean') {
    cfg.intro_muted = introMute;
    obj.intro_muted = introMute;
  }
  if (typeof asWindows === 'boolean') {
    cfg.stream_as_windows = asWindows;
    obj.stream_as_windows = asWindows;
  }
  // the stream options
  stream = stream || {};
  if (STREAM_RES.includes(stream.res)) obj.stream_resolution = cfg.stream_resolution = stream.res;
  if (SHARPEN.includes(stream.sharpen)) obj.video_sharpen = cfg.video_sharpen = stream.sharpen;
  for (const [k, q] of [['video_contrast', 'ct'], ['video_saturation', 'sa'], ['video_brightness', 'br']]) {
    if (Number.isFinite(stream[q])) obj[k] = cfg[k] = pictureLevel(stream[q]);
  }
  // GPU acceleration belongs to the machine (it's set as the engine starts):
  // it always goes in config.json, with or without a profile
  let gpuChanged = false;
  if (typeof stream.gpu === 'boolean') {
    gpuChanged = stream.gpu !== cfg.gpu_acceleration;
    obj.gpu_acceleration = cfg.gpu_acceleration = stream.gpu;
  }
  if (typeof stream.clarity === 'boolean') obj.clarity_boost = cfg.clarity_boost = stream.clarity;
  if (typeof stream.stats === 'boolean') obj.stream_stats = cfg.stream_stats = stream.stats;
  if (VIBRATION.includes(stream.vib)) obj.vibration = cfg.vibration = stream.vib;
  if (language === 'auto' || (language && i18n.STRINGS[language])) {
    cfg.languageChoice = language;
    cfg.language = language === 'auto' ? batoceraLanguage() : language;
    obj.language = language;
  }
  try {
    if (curProfile) {
      // a profile keeps its own choices; config.json stays as it is
      profiles.saveSettings(curProfile.id, {
        start_url: cfg.start_url, language: cfg.languageChoice, volume: cfg.volume, muted: cfg.muted,
        keyboard_highlight: cfg.keyboard_highlight, play_intro: cfg.introMode === 'always' ? true : cfg.introMode === 'daily' ? 'daily' : false,
        intro_volume: cfg.intro_volume, intro_muted: cfg.intro_muted, stream_as_windows: cfg.stream_as_windows, sign_out_on_exit: cfg.sign_out_on_exit,
        stream_resolution: cfg.stream_resolution, video_sharpen: cfg.video_sharpen, clarity_boost: cfg.clarity_boost,
        video_contrast: cfg.video_contrast, video_saturation: cfg.video_saturation, video_brightness: cfg.video_brightness, stream_stats: cfg.stream_stats, vibration: cfg.vibration
      });
      if (gpuChanged) {
        let base = {};
        try { base = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch (e) { /* none or broken: start fresh */ }
        base.gpu_acceleration = cfg.gpu_acceleration;
        fs.writeFileSync(CONFIG, JSON.stringify(base, null, 2) + '\n');
      }
    } else fs.writeFileSync(CONFIG, JSON.stringify(obj, null, 2) + '\n');
    if (gpuChanged) log(`GPU acceleration turned ${cfg.gpu_acceleration ? 'on' : 'off'}: it applies the next time the app opens`);
    log(`settings saved${curProfile ? ` for ${profileName(curProfile)}` : ''}: region ${currentRegion()}, language ${cfg.languageChoice === 'auto' ? `same as Batocera (${cfg.language})` : cfg.language}, intro ${cfg.introMode} (sound ${cfg.intro_muted ? 'muted' : cfg.intro_volume + '%'}), stream as Windows ${cfg.stream_as_windows ? 'on' : 'off'}, resolution ${cfg.stream_resolution}, sharpening ${cfg.video_sharpen}, clarity boost ${cfg.clarity_boost ? 'on' : 'off'}, picture ${cfg.video_contrast}/${cfg.video_saturation}/${cfg.video_brightness}%, stream stats ${cfg.stream_stats ? 'on' : 'off'}, vibration ${cfg.vibration}%, volume ${cfg.volume}%${cfg.muted ? ' (muted)' : ''}, key highlights ${highlight ? 'on' : 'off'}`);
  } catch (e) {
    log(`could not save settings: ${e.message}`);
  }
}

// "Use EmulationStation controller mapping" is for the whole machine (config.json),
// whoever's profile is playing

// ---------- profile screens: who's playing, PIN pad, "set up profiles?" ----------
const PAGE_CSS = `
  html,body{margin:0;height:100%;background:rgba(0,0,0,.72);color:#eee;font-family:${i18n.FONT_STACK}}
  body{display:flex;align-items:center;justify-content:center}
  @keyframes pop{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}
  @keyframes shake{0%,100%{transform:none}20%,60%{transform:translateX(-12px)}40%,80%{transform:translateX(12px)}}
  .card{animation:pop .22s ease-out;background:#1a1a1a;border:2px solid #2d2d2d;border-top:6px solid #107c10;border-radius:14px;
        padding:40px 56px;max-width:1100px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.6)}
  h1{margin:0 0 8px;font-size:38px;font-weight:600;color:#fff}
  .sub{margin:0 0 26px;font-size:20px;color:#9a9a9a}
  .hint{margin:26px 0 0;font-size:17px;color:#8a8a8a;min-height:22px}
  .hint.warn{color:#f0a030}
  button{font-family:inherit;cursor:pointer;outline:none}
`;
const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3H9z"/></svg>';
function profileName(p) { return (p && p.name) || i18n.t(cfg.language, 'pfNew'); }

function profilesHtml() {
  const L = cfg.language;
  const T = (k, v) => i18n.t(L, k, v);
  const tiles = profiles.list.map(p => ({
    id: p.id, name: profileName(p), color: p.color || '#107c10', lock: needsPinNow(p),
    current: curProfile && p.id === curProfile.id, signedIn: !!p.xuid, pic: gamerpicData(p)
  }));
  const S = { tiles, addLock: profiles.hasPin, T: { remove: T('pfRemove'), hint: T('pfHint'), notSignedIn: T('pfSignIn') } };
  return `<!doctype html>
<html lang="${L}"><head><meta charset="utf-8"><title>Xbox Cloud Gaming</title>
<style>
  ${i18n.FONT_CSS}${PAGE_CSS}
  .tiles{display:flex;flex-wrap:wrap;gap:26px;justify-content:center;max-width:1000px;margin-top:30px}
  .tile{width:190px;padding:22px 10px 18px;border-radius:16px;background:#242424;border:4px solid transparent;color:#eee}
  .tile.on{border-color:#fff;background:#2e2e2e;transform:scale(1.05)}
  .tile{transition:transform .12s}
  .pic{width:110px;height:110px;border-radius:50%;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;
       font-size:52px;font-weight:700;color:#fff;position:relative}
  .pic.add{background:#2b2b2b;border:3px dashed #777;color:#bbb;box-sizing:border-box}
  .pic img.gp{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block}
  .lock{position:absolute;right:-4px;bottom:-4px;width:38px;height:38px;border-radius:50%;background:#1a1a1a;border:2px solid #777;
        display:flex;align-items:center;justify-content:center;color:#ddd}
  .lock svg{width:20px;height:20px}
  .nm{font-size:22px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tag{margin-top:6px;font-size:14px;color:#9a9a9a;min-height:18px}
</style></head><body>
<div class="card">
  <h1>${T('pfTitle')}</h1>
  <div class="tiles" id="tiles"></div>
  <p class="hint" id="hint"></p>
</div>
<script>
(function () {
  var S = ${JSON.stringify(S)};
  var P = '${ACTION_PREFIX}';
  var box = document.getElementById('tiles'), hint = document.getElementById('hint');
  var items = S.tiles.concat([{ add: true }]);
  var cur = Math.max(0, S.tiles.findIndex(function (t) { return t.current; }));
  var confirmId = '', confirmUntil = 0, sent = false;
  function go(path) { if (sent) return; sent = true; setTimeout(function () { sent = false; }, 2500); location.href = P + path; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function render() {
    box.textContent = '';
    items.forEach(function (t, i) {
      var b = el('button', 'tile' + (i === cur ? ' on' : ''));
      var pic = el('div', 'pic' + (t.add ? ' add' : ''), t.add || t.pic ? (t.add ? '+' : '') : (t.name || '?').trim().charAt(0).toUpperCase());
      if (t.pic) { var im = el('img', 'gp'); im.src = t.pic; im.alt = ''; pic.appendChild(im); }
      if (!t.add) pic.style.background = t.color;
      if (t.add ? S.addLock : t.lock) { var l = el('span', 'lock'); l.innerHTML = '${LOCK_SVG}'; pic.appendChild(l); }
      b.appendChild(pic);
      b.appendChild(el('div', 'nm', t.add ? '${T('pfAdd').replace(/'/g, "\\'")}' : t.name));
      b.appendChild(el('div', 'tag', t.add || t.signedIn ? '' : S.T.notSignedIn));
      b.addEventListener('click', function () { cur = i; render(); choose(); });
      box.appendChild(b);
    });
    var t = items[cur];
    if (confirmId && Date.now() < confirmUntil && t && t.id === confirmId) { hint.textContent = S.T.remove.replace('{name}', t.name); hint.className = 'hint warn'; }
    else { hint.textContent = S.T.hint; hint.className = 'hint'; }
  }
  function choose() { var t = items[cur]; if (t.add) go('profile-add'); else go('profile-pick?id=' + encodeURIComponent(t.id)); }
  function remove() {
    var t = items[cur];
    if (!t || t.add) return;
    if (confirmId === t.id && Date.now() < confirmUntil) { go('profile-remove?id=' + encodeURIComponent(t.id)); return; }
    confirmId = t.id; confirmUntil = Date.now() + 4000; render(); setTimeout(render, 4100);
  }
  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowDown') { cur = (cur + 1) % items.length; confirmId = ''; render(); }
    else if (k === 'ArrowLeft' || k === 'ArrowUp') { cur = (cur - 1 + items.length) % items.length; confirmId = ''; render(); }
    else if (k === 'Enter' || k === ' ' || k === 'NumpadEnter') choose();
    else if (k === 'y' || k === 'Y' || k === 'Delete') remove();
    else if (k === 'Escape' || k === 'Backspace') go('profiles-back');
    else return;
    e.preventDefault();
  });
  render();
})();
</script></body></html>`;
}

// the PIN pad. kind: 'create' (new PIN, typed twice), or what it unlocks
function pinHtml(pend) {
  const L = cfg.language;
  const T = (k, v) => i18n.t(L, k, v);
  const p = pend.id ? profiles.byId(pend.id) : null;
  const create = pend.kind === 'create';
  const title = create ? T('pinCreate') : T('pinTitle');
  const sub = create ? T('pinCreateHelp') : pend.kind === 'add' || pend.kind === 'addperson' ? T('pinForAdd') : pend.kind === 'remove' ? T('pinForRemove', { name: profileName(p) })
    : pend.kind === 'settings' ? T('pinForSettings') : T('pinFor', { name: profileName(p) });
  const S = { create, T: { again: T('pinAgain'), mismatch: T('pinMismatch'), wrong: T('pinWrong'), hint: create ? T('pinHintCreate') : T('pinHint'), forgot: create ? '' : T('pinForgot') } };
  return `<!doctype html>
<html lang="${L}"><head><meta charset="utf-8"><title>Xbox Cloud Gaming</title>
<style>
  ${i18n.FONT_CSS}${PAGE_CSS}
  .card{min-width:520px}
  .dots{display:flex;gap:22px;justify-content:center;margin:0 0 28px}
  .dot{width:26px;height:26px;border-radius:50%;border:3px solid #888;box-sizing:border-box}
  .dot.full{background:#fff;border-color:#fff}
  .dots.bad{animation:shake .4s}
  .pad{display:grid;grid-template-columns:repeat(3,96px);gap:14px;justify-content:center}
  .key{height:76px;border-radius:12px;background:#2b2b2b;border:3px solid #555;color:#fff;font-size:30px;font-weight:600}
  .key.small{font-size:19px}
  .key.ok{background:#107c10;border-color:#107c10}
  .key.on{outline:4px solid #fff;outline-offset:3px}
  .msg{min-height:26px;margin:-12px 0 16px;font-size:19px;color:#f0a030}
  .forgot{margin:14px 0 0;font-size:15px;color:#6f6f6f}
</style></head><body>
<div class="card">
  <h1>${title}</h1>
  <p class="sub" id="sub">${sub.replace(/</g, '&lt;')}</p>
  <div class="dots" id="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
  <div class="msg" id="msg"></div>
  <div class="pad" id="pad"></div>
  <p class="hint" id="hint"></p>
  <p class="forgot" id="forgot"></p>
</div>
<script>
(function () {
  var S = ${JSON.stringify(S)};
  var P = '${ACTION_PREFIX}';
  var KEYS = ['1','2','3','4','5','6','7','8','9','del','0','ok'];
  var LBL = { del: '${T('pinDel').replace(/'/g, "\\'")}', ok: '${T('pinOk').replace(/'/g, "\\'")}' };
  var code = '', first = '', cur = 0, sent = false;
  var dots = document.getElementById('dots'), msg = document.getElementById('msg'), pad = document.getElementById('pad');
  document.getElementById('hint').textContent = S.T.hint;
  document.getElementById('forgot').textContent = S.T.forgot;
  function go(path) { if (sent) return; sent = true; setTimeout(function () { sent = false; }, 2500); location.href = P + path; }
  function render() {
    Array.prototype.forEach.call(dots.children, function (d, i) { d.className = 'dot' + (i < code.length ? ' full' : ''); });
    pad.textContent = '';
    KEYS.forEach(function (k, i) {
      var b = document.createElement('button');
      b.className = 'key' + (LBL[k] ? ' small' : '') + (k === 'ok' ? ' ok' : '') + (i === cur ? ' on' : '');
      b.textContent = LBL[k] || k;
      b.addEventListener('click', function () { cur = i; press(k); });
      pad.appendChild(b);
    });
  }
  function bad(text) {
    msg.textContent = text; code = '';
    dots.classList.remove('bad'); void dots.offsetWidth; dots.classList.add('bad');
    render();
  }
  function submit() {
    if (code.length < 4) return;
    if (!S.create) { go('pin-check?code=' + code); return; }
    if (!first) { first = code; code = ''; msg.textContent = S.T.again; render(); return; }
    if (first !== code) { first = ''; bad(S.T.mismatch); return; }
    go('pin-create?code=' + code);
  }
  function press(k) {
    if (k === 'del') { code = code.slice(0, -1); render(); return; }
    if (k === 'ok') { submit(); return; }
    if (code.length < 4) { code += k; if (!S.create || first) msg.textContent = msg.textContent === S.T.again ? S.T.again : ''; render(); }
    if (code.length === 4) setTimeout(submit, 120);
  }
  window.__pinWrong = function () { sent = false; bad(S.T.wrong); };
  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if (/^[0-9]$/.test(k)) press(k);
    else if (k === 'Backspace') press('del');
    else if (k === 'Enter' || k === ' ' || k === 'NumpadEnter') press(KEYS[cur]);
    else if (k === 'ArrowRight') cur = cur % 3 === 2 ? cur - 2 : cur + 1;
    else if (k === 'ArrowLeft') cur = cur % 3 === 0 ? cur + 2 : cur - 1;
    else if (k === 'ArrowDown') cur = (cur + 3) % 12;
    else if (k === 'ArrowUp') cur = (cur + 9) % 12;
    else if (k === 'x' || k === 'X') press('del');
    else if (k === 'Escape') { go('pin-cancel'); return; }
    else return;
    e.preventDefault();
    render();
  });
  render();
})();
</script></body></html>`;
}

// "Set up profiles?" when a different person signs in
function promptHtml(person) {
  const L = cfg.language;
  const T = (k, v) => i18n.t(L, k, v);
  // words like "sign-in" don't split across lines
  const q = T('setupQ', { name: (person && person.name) || T('pfNew') }).replace(/(\w)-(\w)/g, '$1\u2011$2');
  return `<!doctype html>
<html lang="${L}"><head><meta charset="utf-8"><title>Xbox Cloud Gaming</title>
<style>
  ${i18n.FONT_CSS}${PAGE_CSS}
  .card{max-width:860px}
  .q{font-size:26px;line-height:1.45;margin:0 0 32px;color:#eee}
  .row{display:flex;gap:20px;justify-content:center;flex-wrap:wrap}
  .b{border-radius:10px;padding:16px 30px;font-size:22px;font-weight:600;background:#262626;color:#ddd;border:3px solid #555}
  .b.yes{background:#107c10;color:#fff;border-color:#107c10}
  .b.on{outline:4px solid #fff;outline-offset:4px}
</style></head><body>
<div class="card">
  <h1>${T('setupT')}</h1>
  <p class="q">${q.replace(/</g, '&lt;')}</p>
  <div class="row" id="row">
    <button class="b yes" data-a="yes">${T('setupYes')}</button>
    <button class="b" data-a="no">${T('setupNo')}</button>
    <button class="b" data-a="never">${T('setupNever')}</button>
  </div>
</div>
<script>
(function () {
  var P = '${ACTION_PREFIX}';
  var bs = Array.prototype.slice.call(document.querySelectorAll('.b')), cur = 0, sent = false;
  function go(a) { if (sent) return; sent = true; location.href = P + 'setup-answer?a=' + a; }
  function render() { bs.forEach(function (b, i) { b.classList.toggle('on', i === cur); }); }
  bs.forEach(function (b, i) { b.addEventListener('click', function () { cur = i; go(b.getAttribute('data-a')); }); });
  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowDown') cur = (cur + 1) % bs.length;
    else if (k === 'ArrowLeft' || k === 'ArrowUp') cur = (cur + bs.length - 1) % bs.length;
    else if (k === 'Enter' || k === ' ' || k === 'NumpadEnter') { go(bs[cur].getAttribute('data-a')); return; }
    else if (k === 'Escape' || k === 'Backspace') { go('no'); return; }
    else return;
    e.preventDefault(); render();
  });
  render();
})();
</script></body></html>`;
}

// ---- gamerpics ----
// When someone signs in, the app asks Xbox's profile service for their
// gamerpic (with their own sign-in) and keeps it with the profile, so
// "Who's playing?" can show it. If that doesn't work, it copies the
// picture the dashboard shows in its top corner straight off the screen.
// If neither finds one, the tile keeps the first letter of the gamertag.
const PICS = path.join(HOME, 'profile-pics');
function gamerpicFile(p) { return path.join(PICS, p.id + '.png'); }
function gamerpicData(p) {
  try { return 'data:image/png;base64,' + fs.readFileSync(gamerpicFile(p)).toString('base64'); } catch (e) { return ''; }
}
const FIND_GAMERPIC = `(function () {
  var name = __NAME__;
  function box(e) { var r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
  function ok(b) { return b.w >= 20 && b.w <= 220 && Math.abs(b.w - b.h) <= 4 && b.y < 220 && b.y >= 0; }
  var best = null, score = 0;
  var els = document.querySelectorAll('img, [style*="background-image"]');
  for (var i = 0; i < els.length; i++) {
    var e = els[i];
    var src = e.tagName === 'IMG' ? (e.currentSrc || e.src || '') : (e.style.backgroundImage || '');
    if (!/xboxlive\.com|gamerpic|dlassets/i.test(src)) continue;
    var b = box(e);
    if (!ok(b)) continue;
    var label = (e.alt || '') + ' ' + (e.getAttribute('aria-label') || '') + ' ' + ((e.closest('button,a,[aria-label]') || e).getAttribute('aria-label') || '');
    var s = 1 + (name && label.toLowerCase().indexOf(name.toLowerCase()) >= 0 ? 5 : 0) + (/gamerpic|avatar|profile/i.test(label + ' ' + e.className) ? 2 : 0) + (b.x > window.innerWidth / 2 ? 1 : 0);
    if (s > score) { score = s; best = b; }
  }
  return best ? JSON.stringify(best) : '';
})()`;
const gamerpicTried = new Set();
let gamerpicAuth = null;
// ask Xbox's profile service (profile.xboxlive.com) for the signed-in
// person's gamerpic, with their own sign-in, then fetch the picture
function fetchGamerpic() {
  const p = curProfile, auth = gamerpicAuth;
  if (!p || !p.xuid || !auth || auth.xuid !== p.xuid) return;
  const key = p.id + ':' + p.xuid;
  if (gamerpicTried.has(key)) return;
  gamerpicTried.add(key);
  const ses = curSession();
  const url = `https://profile.xboxlive.com/users/xuid(${p.xuid})/profile/settings?settings=GameDisplayPicRaw`;
  ses.fetch(url, { headers: { Authorization: `XBL3.0 x=${auth.uhs};${auth.token}`, 'x-xbl-contract-version': '2', Accept: 'application/json', 'Accept-Language': 'en-US' } })
    .then(r => { if (!r.ok) throw new Error(`profile service answered ${r.status}`); return r.json(); })
    .then(j => {
      const u = j && j.profileUsers && j.profileUsers[0];
      const set = u && (u.settings || []).find(x => x.id === 'GameDisplayPicRaw');
      if (!set || !/^https:\/\/[a-z0-9.-]*xboxlive\.com\//i.test(set.value || '')) throw new Error('no gamerpic in the answer');
      const pic = set.value + (set.value.includes('?') ? '&' : '?') + 'w=128&h=128';
      return ses.fetch(pic);
    })
    .then(r => { if (!r.ok) throw new Error(`gamerpic download answered ${r.status}`); return r.arrayBuffer(); })
    .then(buf => {
      const img = nativeImage.createFromBuffer(Buffer.from(buf));
      if (!img || img.isEmpty()) throw new Error('the gamerpic could not be read');
      fs.mkdirSync(PICS, { recursive: true });
      fs.writeFileSync(gamerpicFile(p), img.resize({ width: 128, height: 128, quality: 'best' }).toPNG());
      log(`gamerpic saved for ${p.name || p.id} (from Xbox's profile service)`);
    })
    .catch(e => {
      // the dashboard's own picture is copied instead (below)
      gamerpicTried.delete(key);
      gamerpicService.add(key);
      log(`gamerpic: ${e.message}; will copy the dashboard's picture instead`);
    });
}
const gamerpicService = new Set();   // profiles the service couldn't answer for
function grabGamerpic(wc) {
  const p = curProfile;
  if (!p || !p.xuid || !wc || wc.isDestroyed() || !mainWin || wc !== mainWin.webContents) return;
  let host = '';
  try { host = new URL(wc.getURL()).hostname; } catch (e) { return; }
  if (!/^play\.xbox\.com$/i.test(host)) return;
  // only when Xbox's profile service didn't give the picture (or no
  // sign-in answer was seen yet this time)
  const key = p.id + ':' + p.xuid;
  if (gamerpicTried.has(key)) return;
  if (!gamerpicService.has(key) && gamerpicAuth && gamerpicAuth.xuid === p.xuid) return;
  wc.executeJavaScript(FIND_GAMERPIC.replace('__NAME__', JSON.stringify(p.name || ''))).then(json => {
    if (!json) return;
    const b = JSON.parse(json);
    const rect = { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.w), height: Math.round(b.h) };
    return wc.capturePage(rect).then(img => {
      if (!img || img.isEmpty()) return;
      if (curProfile !== p) return;    // switched profile meanwhile
      fs.mkdirSync(PICS, { recursive: true });
      fs.writeFileSync(gamerpicFile(p), img.resize({ width: 128, height: 128, quality: 'best' }).toPNG());
      gamerpicTried.add(key);
      log(`gamerpic saved for ${p.name || p.id} (copied from the dashboard)`);
    });
  }).catch(e => log(`gamerpic: ${e.message}`));
}

// ---- profile screens: what they do ----
let pickerReturn = 'start';      // 'start' (after the welcome screen) or 'settings'
let pickerDone = false;          // the profile screen was shown at start already
let pinPending = null;           // what the PIN pad unlocks
let unlockedId = '';             // the adult profile unlocked with the PIN this time
let promptQueue = [];
let promptCur = null;
// adult profiles (any profile that isn't a child's or a teen's) are behind the PIN
function needsPin(p) { return !!p && profiles.hasPin && !isMinor(p); }
// a child or teen plays here and there's no PIN yet: one has to be made
// before an adult's profile opens
function pinMissing(p) { return !!p && !isMinor(p) && minorsHere() && !profiles.hasPin; }
function needsPinNow(p) { return needsPin(p) && unlockedId !== p.id; }
function startPickerDue() { return !pickerDone && !SETTINGS_MODE && profiles.count >= 2; }
function showPicker(wc, ret) {
  pickerReturn = ret;
  if (ret === 'start') pickerDone = true;
  log('profile screen shown');
  showAppPage(wc, 'xcloud-profiles.html', profilesHtml());
}
function showPin(wc, pend) {
  pinPending = pend;
  showAppPage(wc, 'xcloud-pin.html', pinHtml(pend));
}
function queuePrompt(item) {
  if (SETTINGS_MODE) return;
  promptQueue.push(item);
  tryPrompt();
}
function tryPrompt() {
  if (promptCur || !promptQueue.length || overlay || exiting || !mainWin) return;
  promptCur = promptQueue.shift();
  openOverlay('prompt');
}
function closePrompt() {
  promptCur = null;
  closeOverlay();
}
function finishPicker(wc) {
  if (isOverlay(wc)) closeOverlay();
}
function pickProfile(wc, p) {
  if (!p) { showPicker(wc, pickerReturn); return; }
  if (pinMissing(p)) {
    log(`${profileName(p)} is an adult's profile and a child's or teen's profile is set up: a PIN has to be made first`);
    showPin(wc, { kind: 'create', then: p.id });
    return;
  }
  if (needsPinNow(p)) { showPin(wc, { kind: 'pick', id: p.id }); return; }
  if (!curProfile || p.id !== curProfile.id) switchTo(p, 'picked');
  else {
    profiles.setLast(p.id);
    log(`profile: ${profileName(p)} (picked)`);
    // a game from Batocera's list waits for "who's playing?": open it now
    if (GAME_ID && !gameDone && mainWin) { siteReady = false; openStart(mainWin.webContents); }
  }
  finishPicker(wc);
}
function addProfile(wc) {
  if (!profiles.active) profiles.start({});        // whoever is in the original storage now
  const p = profiles.add({});
  log('profiles: added a new profile; it signs in now');
  switchTo(p, 'new profile');
  finishPicker(wc);
}
function removeProfile(wc, id) {
  const p = profiles.byId(id);
  if (!p) { showPicker(wc, pickerReturn); return; }
  const ses = sessionFor(p);
  try { fs.unlinkSync(gamerpicFile(p)); } catch (e) { /* none */ }
  profiles.remove(id);
  log(`profiles: removed ${profileName(p)}`);
  ses.clearStorageData().catch(() => {});
  if (curProfile && curProfile.id === id) {
    const next = profiles.last();
    switchTo(next, 'the profile in use was removed');
  }
  if (profiles.count) showPicker(wc, pickerReturn);
  else finishPicker(wc);
}
// actions from the profile screens; true when handled
function profileAction(wc, action, q) {
  if (action === 'profile-pick') { pickProfile(wc, profiles.byId(q.get('id'))); return true; }
  // with a child's or teen's profile here and no PIN yet, adding or removing
  // a profile needs one made first (like opening an adult's profile)
  if (action === 'profile-add') {
    if (profiles.hasPin) showPin(wc, { kind: 'add' });
    else if (minorsHere()) { log('adding a profile: a child\'s or teen\'s profile is set up and there is no PIN yet: one has to be made first'); showPin(wc, { kind: 'create', next: { kind: 'add' } }); }
    else addProfile(wc);
    return true;
  }
  if (action === 'profile-remove') {
    if (profiles.hasPin) showPin(wc, { kind: 'remove', id: q.get('id') });
    else if (minorsHere()) { log('removing a profile: a child\'s or teen\'s profile is set up and there is no PIN yet: one has to be made first'); showPin(wc, { kind: 'create', next: { kind: 'remove', id: q.get('id') } }); }
    else removeProfile(wc, q.get('id'));
    return true;
  }
  if (action === 'profiles-back') {
    if (pickerReturn === 'settings') { openSettings(wc, settingsReturn); return true; }
    // at start, a locked profile can't just be kept: pick (with the PIN) instead
    if (needsPinNow(curProfile) || pinMissing(curProfile)) { showPicker(wc, 'start'); return true; }
    // a game from Batocera's list waits for "who's playing?": open it now
    if (GAME_ID && !gameDone && mainWin) { siteReady = false; openStart(mainWin.webContents); }
    finishPicker(wc);
    return true;
  }
  if (action === 'pin-check') {
    const pend = pinPending;
    if (!pend) return true;
    if (!profiles.checkPin(q.get('code') || '')) {
      log('PIN: wrong');
      wc.executeJavaScript('window.__pinWrong && window.__pinWrong()').catch(() => {});
      return true;
    }
    pinPending = null;
    log('PIN: correct');
    if (pend.kind === 'pick') { unlockedId = pend.id; pickProfile(wc, profiles.byId(pend.id)); }
    else if (pend.kind === 'add') addProfile(wc);
    else if (pend.kind === 'remove') removeProfile(wc, pend.id);
    else if (pend.kind === 'settings') { unlockedId = pend.id; openSettings(wc, 'exit'); }
    else if (pend.kind === 'move') { unlockedId = pend.id; closePrompt(); moveSignIn(profiles.byId(pend.id), pend.person); }
    else if (pend.kind === 'addperson') { closePrompt(); setupAnswer('yes', pend.person, true); }
    return true;
  }
  if (action === 'pin-create') {
    const code = String(q.get('code') || '');
    const pend = pinPending;
    pinPending = null;
    if (/^\d{4}$/.test(code) && profiles.setPin(code)) {
      log('PIN created for adult profiles');
      // made while opening an adult's profile: that profile opens now
      if (pend && pend.then) { unlockedId = pend.then; pickProfile(wc, profiles.byId(pend.then)); return true; }
      // made while adding or removing a profile: that goes ahead now
      if (pend && pend.next && pend.next.kind === 'add') { addProfile(wc); return true; }
      if (pend && pend.next && pend.next.kind === 'remove') { removeProfile(wc, pend.next.id); return true; }
      if (curProfile && !isMinor(curProfile)) unlockedId = curProfile.id;
    }
    closePrompt();
    return true;
  }
  if (action === 'pin-cancel') {
    const pend = pinPending;
    pinPending = null;
    if (pend && pend.kind === 'settings') { fastExit('PIN not entered'); return true; }
    if (pend && pend.kind === 'create') {
      // a child or teen plays here: the PIN can't be put off
      if (pend.then || pend.next) { log('PIN not made: back to "who\'s playing?"'); showPicker(wc, pickerReturn); return true; }
      if (minorsHere()) { showPin(wc, pend); return true; }
      closePrompt();
      return true;
    }
    if (pend && (pend.kind === 'move' || pend.kind === 'addperson')) { closePrompt(); undoAdultSignIn(pend.person); return true; }
    showPicker(wc, pickerReturn);
    return true;
  }
  if (action === 'picktip') {
    if (q.get('a') === 'never') {
      try { fs.writeFileSync(PICK_TIP_HIDDEN, `"Games I pick" how-to hidden on ${new Date().toISOString()}. Delete this file to see it again.\n`); } catch (e) { /* ignore */ }
      log('"Games I pick" how-to: "Don\'t show this again"');
    } else log('"Games I pick" how-to: OK');
    closePrompt();
    return true;
  }
  if (action === 'setup-answer') {
    const cur = promptCur;
    setupAnswer(q.get('a'), cur && cur.person);
    closePrompt();
    return true;
  }
  if (action === 'settings-profiles') { showPicker(wc, 'settings'); return true; }
  return false;
}

// ---------- the layer on top of the Xbox page ----------
// The intro video, the welcome screen and Settings show in a see-through
// layer over the Xbox page, so Xbox keeps loading (and stays loaded)
// underneath. While it's up, the Xbox page can't see the controller, so a
// button pressed on the welcome screen can't also click something on Xbox.
let overlay = null;
let siteReady = false;          // the Xbox page (or the "can't connect" page) has loaded
let siteWaiters = [];
function whenSiteReady(fn, maxMs) {
  if (siteReady) { fn(); return; }
  let called = false;
  const once = () => { if (!called) { called = true; fn(); } };
  siteWaiters.push(once);
  setTimeout(once, maxMs);
}
function markSiteReady() {
  siteReady = true;
  const w = siteWaiters; siteWaiters = [];
  w.forEach(fn => fn());
}

// stop (or let go of) the Xbox page's view of the controller; it's let go
// only once every button is released, so the press that closed the
// welcome screen doesn't reach Xbox
//
// It also puts controllers the browser doesn't recognise into the standard
// Xbox layout. Chromium only knows the layout of controllers on its own list;
// any other (a Steam Deck's controls, many third-party pads) reaches the site
// in the raw Linux order: left stick, LEFT TRIGGER, right stick, right
// trigger, d-pad. Xbox Cloud Gaming then reads the right stick's left/right
// as up/down, ignores its up/down, and the left trigger swings the camera.
const PAD_FIX = `(function(){
  var lows = {};
  function trig(key, v) {
    // triggers rest at -1 (range -1..1) or at 0 (range 0..1)
    if (lows[key] === undefined || v < lows[key]) lows[key] = v;
    var x = lows[key] < -0.5 ? (v + 1) / 2 : v;
    return x < 0.02 ? 0 : x > 1 ? 1 : x;
  }
  function btn(v) { return { pressed: v > 0.15, touched: v > 0.15, value: v }; }
  window.__xcloudFixPad = function (p) {
    if (!p) return p;
    if (window.__xcloudPadFix === false) return p;
    if (p.mapping === 'standard' || p.axes.length < 6) return p;
    var a = p.axes, rb = p.buttons, key = p.index + ':' + p.id;
    var lt = trig(key + 'l', a[2]), rt = trig(key + 'r', a[5]);
    var b = [];
    function raw(i) { var x = rb[i]; return x ? { pressed: x.pressed, touched: x.touched, value: x.value } : btn(0); }
    if (rb.length >= 13) {
      // A B X Y LB RB LT RT View Menu L3 R3 (Guide) ... already in order
      for (var i = 0; i < 12; i++) b.push(raw(i));
      b[6] = btn(Math.max(lt, rb[6].value)); b[7] = btn(Math.max(rt, rb[7].value));
    } else {
      // A B X Y LB RB View Menu Guide L3 R3 (the xpad order)
      b = [raw(0), raw(1), raw(2), raw(3), raw(4), raw(5), btn(lt), btn(rt), raw(6), raw(7), raw(9), raw(10)];
    }
    // d-pad: buttons 12-15, from the d-pad axes when it has no buttons of its own
    var hx = a.length >= 8 ? a[6] : 0, hy = a.length >= 8 ? a[7] : 0;
    var hasDpadButtons = rb.length >= 17;
    b.push(hasDpadButtons ? raw(13) : btn(hy < -0.5 ? 1 : 0));
    b.push(hasDpadButtons ? raw(14) : btn(hy > 0.5 ? 1 : 0));
    b.push(hasDpadButtons ? raw(15) : btn(hx < -0.5 ? 1 : 0));
    b.push(hasDpadButtons ? raw(16) : btn(hx > 0.5 ? 1 : 0));
    b.push(rb.length >= 13 ? raw(12) : raw(8));   // Guide
    return {
      id: p.id, index: p.index, connected: p.connected, timestamp: p.timestamp,
      mapping: 'standard', axes: [a[0], a[1], a[3], a[4]], buttons: b,
      vibrationActuator: p.vibrationActuator, hapticActuators: p.hapticActuators
    };
  };
  // Xbox Cloud Gaming officially takes Xbox and PlayStation controllers only.
  // A Steam controller (the Steam Deck's controls, the Steam Controller) is
  // shown to it as an Xbox controller: buttons in the Xbox layout (the fix
  // above, for one the browser doesn't know), Xbox's name, rumble passed
  // through. The app's own screens still see (and name) the real controller.
  // (Remove this if Microsoft starts supporting them.)
  var XBOX_ID = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
  function steam(id) { return /Vendor: *28de|^28de-|steam deck|steam controller|valve/i.test(String(id || '')); }
  window.__xcloudShowPad = function (p) {
    if (!p) return p;
    var f = window.__xcloudFixPad(p);
    if (!f || f.mapping !== 'standard' || !steam(f.id)) return f;
    var bs = [];
    for (var i = 0; i < 17; i++) { var x = f.buttons[i]; bs.push(x ? { pressed: x.pressed, touched: x.touched, value: x.value } : { pressed: false, touched: false, value: 0 }); }
    return {
      id: XBOX_ID, index: f.index, connected: f.connected, timestamp: f.timestamp,
      mapping: 'standard', axes: Array.prototype.slice.call(f.axes, 0, 4), buttons: bs,
      vibrationActuator: f.vibrationActuator || p.vibrationActuator, hapticActuators: f.hapticActuators || p.hapticActuators
    };
  };
  window.__xcloudShownAsXbox = function (p) { return !!p && steam(p.id); };
})();`;
// Microsoft's sign-in and account pages read the controller themselves (their
// newer design has controller navigation). On those pages the app already
// moves, types and presses with the controller, so both reacting at once sent
// you to "Forgot your username?" while typing on the on-screen keyboard.
// Every page except the dashboard (play.xbox.com) is kept from seeing it.
const NO_PAD = `(function(){
  if (window.__xcloudNoPad) return;
  window.__xcloudNoPad = 1;
  var none = function () { return [null, null, null, null]; };
  try { Object.defineProperty(Navigator.prototype, 'getGamepads', { value: none, configurable: true, writable: true }); } catch (e) {}
  try { Object.defineProperty(navigator, 'getGamepads', { value: none, configurable: true, writable: true }); } catch (e) {}
  var add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (t) {
    if (t === 'gamepadconnected' || t === 'gamepaddisconnected') return;
    return add.apply(this, arguments);
  };
  try { Object.defineProperty(window, 'ongamepadconnected', { get: function () { return null; }, set: function () {}, configurable: true }); } catch (e) {}
})();`;
const PAD_EVENTS = `(function(){
  if (window.__xcloudPadEvents) return;
  window.__xcloudPadEvents = 1;
  // "controller connected" messages carry the controller too: the page gets
  // it the way getGamepads shows it (a Steam controller as an Xbox one).
  var GP = { gamepadconnected: 1, gamepaddisconnected: 1 };
  function show(p) { try { return window.__xcloudShowPad ? window.__xcloudShowPad(p) : p; } catch (e) { return p; } }
  function wrapEvent(e) {
    // (a stand-in target: the real event's own fields can't be changed through a Proxy of it)
    return new Proxy(Object.create(Object.getPrototypeOf(e)), { get: function (_, k) {
      if (k === 'gamepad') return show(e.gamepad);
      var v = e[k]; return typeof v === 'function' ? v.bind(e) : v;
    } });
  }
  var wrapped = new WeakMap();
  function wrapperOf(fn, make) {
    if (!fn || (typeof fn !== 'function' && typeof fn.handleEvent !== 'function')) return fn;
    var w = wrapped.get(fn);
    if (!w && make) {
      w = function (e) { var x = wrapEvent(e); return typeof fn === 'function' ? fn.call(this, x) : fn.handleEvent(x); };
      wrapped.set(fn, w);
    }
    return w || fn;
  }
  var add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (t, fn) {
    if (GP[t] && this === window) { var a = Array.prototype.slice.call(arguments); a[1] = wrapperOf(fn, true); return add.apply(this, a); }
    return add.apply(this, arguments);
  };
  EventTarget.prototype.removeEventListener = function (t, fn) {
    if (GP[t] && this === window) { var a = Array.prototype.slice.call(arguments); a[1] = wrapperOf(fn, false); return rem.apply(this, a); }
    return rem.apply(this, arguments);
  };
  ['ongamepadconnected', 'ongamepaddisconnected'].forEach(function (name) {
    var h = null, t = name.slice(2);
    function run(e) { if (h) h.call(window, wrapEvent(e)); }
    try {
      Object.defineProperty(window, name, { configurable: true,
        get: function () { return h; },
        set: function (f) { if (h) rem.call(window, t, run); h = typeof f === 'function' ? f : null; if (h) add.call(window, t, run); } });
    } catch (e) { /* left as it is */ }
  });
})();`;
const dashHost = u => { try { return /^play\.xbox\.com$/i.test(new URL(u).hostname); } catch (e) { return false; } };
const PAD_GATE = `(function(){
  if (!window.__xcloudPadGate) {
    window.__xcloudPadGate = 1;
    ${PAD_FIX}
    ${PAD_EVENTS}
    var real = Navigator.prototype.getGamepads;
    // Xbox learns about a controller from the "gamepadconnected" event, which
    // the browser sends only once. If that happened while an app screen was
    // up (the controller hidden), Xbox found nothing and says "Controller not
    // detected" for good. So each time the controller is handed back, and
    // once after the page has loaded, it's announced to the page again.
    var blockedNow = false;
    function announce(why) {
      if (blockedNow) return;
      var n = 0;
      try {
        Array.prototype.slice.call(real.call(navigator)).forEach(function (p) {
          if (!p || !p.connected) return;
          var ev;
          try { ev = new GamepadEvent('gamepadconnected', { gamepad: p }); }
          catch (e) { ev = new Event('gamepadconnected'); Object.defineProperty(ev, 'gamepad', { value: p }); }
          window.__xcloudAnnouncing = true;
          try { window.dispatchEvent(ev); } finally { window.__xcloudAnnouncing = false; }
          n++;
        });
      } catch (e) { /* none */ }
      if (n) window.__xcloudAnnounced = (window.__xcloudAnnounced || 0) + 1, window.__xcloudAnnouncedWhy = why;
    }
    // "release": handed back once every button is let go. That's checked here
    // too, not only when Xbox asks for the controller: Xbox may have stopped
    // asking while it saw none, and would never get it back.
    function anyHeld() {
      try {
        var ps = real.call(navigator);
        for (var i = 0; i < ps.length; i++) { var p = ps[i]; if (p) for (var b = 0; b < p.buttons.length; b++) if (p.buttons[b].pressed) return true; }
      } catch (e) { /* none */ }
      return false;
    }
    function whenLetGo(name) {
      var t = setInterval(function () {
        if (window[name] !== 'release') { clearInterval(t); return; }
        if (!anyHeld()) { clearInterval(t); window[name] = false; }
      }, 50);
    }
    Object.defineProperty(window, '__xcloudPadsBlocked', {
      configurable: true,
      get: function () { return blockedNow; },
      set: function (v) { var was = blockedNow; blockedNow = v; if (v === 'release') whenLetGo('__xcloudPadsBlocked'); if (was && !v) setTimeout(function () { announce('handed back'); }, 0); }
    });
    // the same when the app's on-screen keyboard on the dashboard lets go of
    // it (Xbox saw no controller while typing, and would think it was gone)
    var oskNow = false;
    Object.defineProperty(window, '__xcloudOsk', {
      configurable: true,
      get: function () { return oskNow; },
      set: function (v) { var was = oskNow; oskNow = v; if (v === 'release') whenLetGo('__xcloudOsk'); if (was && !v) setTimeout(function () { announce('keyboard closed'); }, 0); }
    });
    window.__xcloudAnnounce = announce;
    function afterLoad() { setTimeout(function () { announce('page loaded'); }, 2500); }
    if (document.readyState === 'complete') afterLoad(); else window.addEventListener('load', afterLoad);
    // what the controllers really are, before the gate (for the app's checks)
    window.__xcloudPadInfo = function () {
      var all = [];
      try { all = Array.prototype.slice.call(real.call(navigator)).filter(function (p) { return p && p.connected; }); } catch (e) { /* none */ }
      return { real: all.map(function (p) { return p.id; }), blocked: window.__xcloudPadsBlocked || false, announced: window.__xcloudAnnounced || 0, why: window.__xcloudAnnouncedWhy || '', focus: document.hasFocus(), visible: document.visibilityState };
    };
    Navigator.prototype.getGamepads = function () {
      var pads = Array.prototype.map.call(real.call(this), function (p) { return window.__xcloudShowPad(p); });
      if (window.__xcloudPadsBlocked === 'release') {
        var held = false;
        for (var i = 0; i < pads.length; i++) { var p = pads[i]; if (p) for (var b = 0; b < p.buttons.length; b++) if (p.buttons[b].pressed) held = true; }
        if (!held) window.__xcloudPadsBlocked = false;
      }
      // the app's keyboard is open on the dashboard: the controller types
      if (window.__xcloudOsk === 'release') {
        var held2 = false;
        for (var j = 0; j < pads.length; j++) { var q = pads[j]; if (q) for (var c = 0; c < q.buttons.length; c++) if (q.buttons[c].pressed) held2 = true; }
        if (!held2) window.__xcloudOsk = false;
      }
      return window.__xcloudPadsBlocked || window.__xcloudOsk ? [null, null, null, null] : pads;
    };
  }
})();`;
// Safety net: with no app screen up, the Xbox page must see the controller.
// Every 2 seconds: still hidden (a hand-back that was missed) -> handed back;
// "held" for more than 8 seconds (a button that reads as always pressed) ->
// handed back anyway. What the page sees is logged when it changes.
let padWatchLast = '', padReleaseSince = 0, padAnnounced = 0;
function padWatch() {
  const wc = mainWin && mainWin.webContents;
  if (!wc || wc.isDestroyed() || SETTINGS_MODE) return;
  let host = '';
  try { host = new URL(wc.getURL()).hostname; } catch (e) { return; }
  if (!/xbox\.com$/i.test(host)) return;
  wc.executeJavaScript('window.__xcloudPadInfo ? window.__xcloudPadInfo() : null').then(info => {
    if (!info) return;
    const state = `${info.real.length ? info.real.join(', ') : 'none'} | hidden from Xbox: ${info.blocked} | page focused: ${info.focus} | ${info.visible}`;
    if (state !== padWatchLast) { padWatchLast = state; log(`controllers on the Xbox page: ${state}${overlay ? ' (an app screen is up)' : ''}`); }
    if (info.announced > padAnnounced) log(`controller announced to the Xbox page again (${info.why})`);
    padAnnounced = info.announced;
    if (overlay) { padReleaseSince = 0; return; }
    if (info.blocked === true) {
      log('controller was still hidden from Xbox with no app screen up: handing it back');
      wc.executeJavaScript("window.__xcloudPadsBlocked = 'release';").catch(() => {});
      padReleaseSince = Date.now();
    } else if (info.blocked === 'release') {
      if (!padReleaseSince) padReleaseSince = Date.now();
      else if (Date.now() - padReleaseSince > 8000) {
        log('a controller button reads as held down: handing the controller to Xbox anyway');
        wc.executeJavaScript('window.__xcloudPadsBlocked = false;').catch(() => {});
        padReleaseSince = 0;
      }
    } else padReleaseSince = 0;
    if (!info.focus && !overlay && info.real.length) { try { mainWin.focus(); wc.focus(); } catch (e) { /* ignore */ } }
  }).catch(() => { /* page between loads */ });
}
function setPadsBlocked(blocked) {
  const wc = mainWin && mainWin.webContents;
  if (!wc) return;
  const state = blocked ? 'true' : "'release'";
  wc.executeJavaScript(`${PAD_GATE} window.__xcloudPadsBlocked = ${state};`).catch(() => { /* page between loads */ });
  try { wc.send('xcloud-overlay', blocked); } catch (e) { /* ignore */ }
}

function fitOverlay() {
  if (!overlay || !mainWin) return;
  const b = mainWin.getContentBounds();
  overlay.setBounds({ x: 0, y: 0, width: b.width, height: b.height });
}
function openOverlay(what) {
  if (!mainWin) return;
  if (!overlay) {
    overlay = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        autoplayPolicy: 'no-user-gesture-required'
      }
    });
    overlay.setBackgroundColor('#00000000');
    mainWin.contentView.addChildView(overlay);
    fitOverlay();
    guard(overlay.webContents, true);
    overlay.webContents.once('did-finish-load', () => {
      if (mainWin && !mainWin.isVisible()) { mainWin.show(); mainWin.focus(); }
      try { overlay && overlay.webContents.focus(); } catch (e) { /* ignore */ }
    });
  }
  setPadsBlocked(true);
  const wc = overlay.webContents;
  if (what === 'video') showAppPage(wc, 'xcloud-video.html', videoHtml());
  else if (what === 'settings') openSettings(wc, 'dashboard');
  else if (what === 'profiles') showPicker(wc, 'start');
  else if (what === 'prompt' && promptCur && promptCur.kind === 'pinsetup') showPin(wc, { kind: 'create' });
  else if (what === 'prompt' && promptCur && promptCur.kind === 'movepin') showPin(wc, promptCur.pend);
  else if (what === 'prompt' && promptCur && promptCur.kind === 'picktip') showAppPage(wc, 'xcloud-picktip.html', pickTipHtml());
  else if (what === 'prompt' && promptCur) showAppPage(wc, 'xcloud-prompt.html', promptHtml(promptCur.person));
  else showAppPage(wc, 'xcloud-intro.html', introHtml());
}
function closeOverlay() {
  if (!overlay) return;
  gameDone = true;   // the game picked in Batocera's list has been opened
  const v = overlay;
  overlay = null;
  const finish = () => {
    try { mainWin && mainWin.contentView.removeChildView(v); } catch (e) { /* ignore */ }
    try { v.webContents.close(); } catch (e) { /* ignore */ }
    setPadsBlocked(false);
    try { if (mainWin) { mainWin.focus(); mainWin.webContents.focus(); } } catch (e) { /* ignore */ }
    // anything waiting to ask (set up profiles, create a PIN)
    setTimeout(tryPrompt, 400);
  };
  // a quick fade, then it's gone
  v.webContents.executeJavaScript("document.documentElement.style.transition='opacity .25s';document.documentElement.style.opacity='0';")
    .catch(() => {});
  setTimeout(finish, 260);
}
function isOverlay(wc) { return !!overlay && wc === overlay.webContents; }

// the video finished (or was skipped): once Xbox has loaded, pop up the
// welcome screen, or just reveal Xbox
let introDone = false;
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function introDue() {
  if (cfg.introMode === 'off') return false;
  if (cfg.introMode === 'always') return true;
  try { return fs.readFileSync(INTRO_LAST, 'utf8').trim() !== today(); } catch (e) { return true; }
}
function afterIntro() {
  if (introDone) return;
  introDone = true;
  log('intro video finished');
  whenSiteReady(() => {
    if (!overlay) return;
    if (welcomeShown()) openOverlay('welcome');
    else if (startPickerDue()) showPicker(overlay.webContents, 'start');
    else closeOverlay();
  }, 8000);
}

function showAppPage(wc, name, html) {
  const file = path.join(app.getPath('userData'), name);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
  } catch (e) {
    log(`could not write ${file}: ${e.message}`);
  }
  wc.loadFile(file).catch(() => { /* a newer navigation replaced it */ });
}

let loadStarted = 0;
function openStart(wc, homeOnly) {
  loadStarted = Date.now();
  // opened from a game in Batocera's list: that game, until the person is on
  // Xbox (homeOnly: the dashboard for now, while "who's playing?" is up)
  const url = GAME_ID && !gameDone && !homeOnly ? gameUrl(GAME_ID) : cfg.start_url;
  if (url !== cfg.start_url) { log(`opening the game picked in Batocera's list: ${url}`); adsLaunch = { id: GAME_ID, until: Date.now() + 60000, tries: 0 }; }
  wc.loadURL(url).catch(() => { /* errors are handled by did-fail-load */ });
}

// A game picked in Batocera's list that is free with ads: Xbox sends the
// launch link back to the game's page, where "Play with ads" has to be
// pressed. Only then (the picked game's page, within a minute of opening it,
// with that button on it) the button is pressed for the person. Any other
// game launches straight through and this does nothing.
let adsLaunch = null;
const ADS_CLICK_JS = `(function(){
  var re = /play\\s+with\\s+ads|with\\s+ads/i;
  var els = document.querySelectorAll('button, a, [role="button"]');
  for (var i = 0; i < els.length; i++) {
    var e = els[i], t = (e.innerText || e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '');
    if (re.test(t) && e.offsetParent !== null && !e.disabled) { e.click(); return t.trim().replace(/\\s+/g, ' ').slice(0, 60); }
  }
  return '';
})()`;
function checkAdsLaunch(wc, url) {
  if (!adsLaunch || Date.now() > adsLaunch.until) { adsLaunch = null; return; }
  if (/\/launch\//.test(url || '')) return;            // still launching normally
  const g = gameFromUrl(url);
  if (!g || g.id !== adsLaunch.id) return;             // not the picked game's page
  const want = adsLaunch;
  log(`launch of ${want.id} came back to its game page: looking for "Play with ads"`);
  const look = () => {
    if (adsLaunch !== want || wc.isDestroyed()) return;
    if (++want.tries > 20) { log(`no "Play with ads" button on ${want.id}'s page; left for the person`); adsLaunch = null; return; }
    wc.executeJavaScript(ADS_CLICK_JS).then(hit => {
      if (hit) { log(`pressed "${hit}" for ${want.id}`); adsLaunch = null; }
      else setTimeout(look, 500);
    }, () => setTimeout(look, 500));
  };
  setTimeout(look, 800);
}

// "Got it, continue" / "Don't show this again", from any input
let lastContinue = 0;
function doContinue(wc, never, how) {
  const now = Date.now();
  if (now - lastContinue < 1500) return; // the same choice arriving two ways
  lastContinue = now;
  if (never) {
    try {
      fs.writeFileSync(TIP_HIDDEN, `Exit tip hidden on ${new Date().toISOString()}. Delete this file to see it again.\n`);
      log(`start screen: "Don't show this again" (${how}); it won't be shown again`);
    } catch (e) {
      log(`could not save "don't show again": ${e.message}`);
    }
  } else {
    log(`start screen: "Got it, continue" (${how})`);
    // "Got it" means keep showing it at start, even if it was hidden before
    // (the screen can still be opened by holding Menu while playing)
    if (fs.existsSync(TIP_HIDDEN)) {
      try { fs.unlinkSync(TIP_HIDDEN); log('start screen will show at start again'); } catch (e) { /* ignore */ }
    }
  }
  // more than one profile: who's playing? (once, after the welcome screen at start)
  if (isOverlay(wc) && startPickerDue()) showPicker(wc, 'start');
  else if (isOverlay(wc)) closeOverlay();
  else openStart(wc);
}

// actions from the app's own screens (https://xcloud.invalid/...)
function handleAction(wc, url) {
  let u;
  try { u = new URL(url); } catch (e) { return; }
  const action = u.pathname.replace(/^\/+/, '');
  if (profileAction(wc, action, u.searchParams)) return;
  if (action === 'continue') doContinue(wc, u.searchParams.get('never') === '1', 'keyboard/mouse');
  else if (action === 'retry') { log('retry from the "can\'t connect" screen'); openStart(wc); }
  else if (action === 'intro-done') { log(`intro video: ${u.searchParams.get('why') || 'ended'} (at ${u.searchParams.get('at') || '?'} s)`); afterIntro(); }
  else if (action === 'settings') openSettings(wc, 'welcome');
  else if (action === 'settings-save') {
    const q = u.searchParams;
    const before = cfg.start_url, beforeUA = cleanUserAgent();
    saveSettings(String(q.get('region') || ''), q.has('volume') ? Number(q.get('volume')) : NaN, q.get('highlight') === '1', String(q.get('lang') || ''),
      String(q.get('intro') || ''), q.has('windows') ? q.get('windows') === '1' : undefined,
      q.has('ivol') ? Number(q.get('ivol')) : NaN, q.has('imute') ? q.get('imute') === '1' : undefined,
      q.has('vmute') ? q.get('vmute') === '1' : undefined, q.has('soe') ? q.get('soe') === '1' : undefined,
      { res: q.get('res'), gpu: q.has('gpu') ? q.get('gpu') === '1' : undefined, sharpen: q.get('sharpen'), clarity: q.has('clarity') ? q.get('clarity') === '1' : undefined,
        ct: q.has('ct') ? Number(q.get('ct')) : NaN, sa: q.has('sa') ? Number(q.get('sa')) : NaN, br: q.has('br') ? Number(q.get('br')) : NaN, stats: q.has('stats') ? q.get('stats') === '1' : undefined, vib: q.has('vib') ? Number(q.get('vib')) : undefined });
    // the stream options change on the dashboard straight away (the resolution from the next game)
    applyStreamOptions(mainWin && mainWin.webContents);
    if (q.has('glist')) saveGameList(q);
    // the new volume (or mute) takes effect straight away
    for (const w of BrowserWindow.getAllWindows ? BrowserWindow.getAllWindows() : []) {
      try { w.webContents.send('xcloud-volume', appVolume()); } catch (e) { /* ignore */ }
    }
    const uaChanged = cleanUserAgent() !== beforeUA;
    if (uaChanged) applyUserAgent();
    // the Xbox page's keyboard and messages switch language straight away
    try { mainWin && mainWin.webContents.send('xcloud-lang', preloadText()); } catch (e) { /* ignore */ }
    if ((cfg.start_url !== before || uaChanged) && !SETTINGS_MODE && mainWin) { siteReady = false; openStart(mainWin.webContents); }
    leaveSettings(wc);
  }
  else if (action === 'settings-cancel') { log('settings closed without saving'); leaveSettings(wc); }
  else if (action === 'settings-signout') {
    log('signed out of Xbox from Settings');
    ageGroupSeen = '';
    if (curProfile) profiles.update(curProfile, { xuid: '', age: '' });
    identitySeen = '';
    const ses = curSession();
    Promise.resolve()
      .then(() => ses.clearStorageData())
      .then(() => ses.clearCache())
      .catch(e => log(`sign out: ${e.message}`))
      .then(() => {
        if (SETTINGS_MODE || !mainWin) { fastExit('signed out'); return; }
        siteReady = false;
        openStart(mainWin.webContents);
        if (isOverlay(wc)) closeOverlay(); else leaveSettings(wc);
      });
  }
  else if (action === 'settings-reload') {
    if (SETTINGS_MODE || !mainWin) { leaveSettings(wc); return; }
    log('dashboard reloaded from Settings');
    siteReady = false;
    openStart(mainWin.webContents);
    if (isOverlay(wc)) closeOverlay(); else leaveSettings(wc);
  }
  else if (action === 'settings-clear-cache') clearAppCache(wc);
  else if (action === 'settings-logs') saveSupportLogs(wc);
  else if (action === 'settings-update-check') checkForUpdates();
  else if (action === 'quit') fastExit('app screen');
}

// ---------- Clear cache ----------
// Stored copies of pages, pictures and scripts, the graphics (shader) cache
// and compiled-script cache. Sign-in (cookies, saved site data) is kept.
function clearAppCache(wc) {
  const ses = curSession();
  let bytes = 0;
  Promise.resolve()
    .then(() => (ses.getCacheSize ? ses.getCacheSize() : 0)).then(n => { bytes = Number(n) || 0; })
    .then(() => ses.clearCache())
    .then(() => ses.clearStorageData({ storages: ['shadercache'] }))
    .then(() => (ses.clearCodeCaches ? ses.clearCodeCaches({}) : null))
    .catch(e => log(`clear cache: ${e.message}`))
    .then(() => {
      const mb = Math.max(1, Math.round(bytes / (1024 * 1024)));
      log(`cache cleared (${mb} MB)`);
      if (wc && !wc.isDestroyed()) wc.executeJavaScript(`window.__cacheStatus && window.__cacheStatus(${mb})`).catch(() => {});
    });
}

// ---------- Batocera game list ----------
// Settings > Batocera game list: the cloud games themselves in Batocera's
// Xbox Cloud list (all of them, or the ones picked here), each with its art
// and description, done by Sync-GameList.py. Picking one there opens the app
// with --xcloud-game=<its Microsoft Store ID>.
const GAME_ID = ((process.argv.find(a => a.startsWith('--xcloud-game=')) || '').split('=')[1] || '').toUpperCase();
let gameDone = !/^[0-9A-Z]{12}$/.test(GAME_ID);
const SYNC_GAMELIST = path.join(HOME, 'Sync-GameList.py');
const GL_STATE = path.join(HOME, 'gamelist-state.json');
const PICKED_FILE = path.join(HOME, 'picked-games.json');
function glState() { try { return JSON.parse(fs.readFileSync(GL_STATE, 'utf8')) || {}; } catch (e) { return {}; } }
function pickedGames() {
  try { const a = JSON.parse(fs.readFileSync(PICKED_FILE, 'utf8')); return Array.isArray(a) ? a.filter(g => g && g.id) : []; } catch (e) { return []; }
}
const slugify = t => String(t || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'game';
function gameUrl(id) {
  const known = (glState().games || {})[id];
  const picked = pickedGames().find(g => g.id === id);
  const slug = picked && picked.slug && !NOT_A_NAME.test(picked.slug) ? picked.slug : slugify(known && known.title);
  const base = currentRegion() === 'custom' ? 'https://www.xbox.com/en-US/play' : cfg.start_url.replace(/\/+$/, '');
  return `${base}/launch/${slug}/${id}`;
}
// the game whose page the dashboard is showing (for "This game in Batocera's list")
function pageGame() {
  let u = '';
  try { u = mainWin && !SETTINGS_MODE ? mainWin.webContents.getURL() : ''; } catch (e) { /* closed */ }
  return gameFromUrl(u);
}
// a game's page on Xbox: .../games/<name>/<Store ID> (also .../launch/...,
// and .../games/<Store ID> without the name)
function gameFromUrl(u, pageTitle) {
  const m = /\/(?:games|launch)\/([^/?#]+)\/([0-9A-Za-z]{12})(?:[/?#]|$)/.exec(u || '') || /\/games\/()([0-9A-Za-z]{12})(?:[/?#]|$)/.exec(u || '') ||
    // any other Xbox address with a Store ID in it (12 letters and digits, at least one digit)
    /\/([^/?#]+)\/((?=[0-9A-Za-z]*[0-9])[0-9A-Za-z]{12})(?:[/?#]|$)/.exec(u || '');
  if (!m) return null;
  return pageGameFrom(m[1] || '', m[2].toUpperCase(), pageTitle);
}
// words in Xbox addresses that aren't a game's name ("/launch/stream/<ID>")
const NOT_A_NAME = /^(stream|launch|play|games?|details|store|products?|p|en-[a-z]{2}|[a-z]{2}-[a-z]{2})$/i;
function pageGameFrom(slug, id, pageTitle) {
  const known = (glState().games || {})[id];
  if (NOT_A_NAME.test(slug || '')) slug = '';
  let title = known && known.title ? known.title : '';
  if (!title && pageTitle) title = pageTitle;
  if (!title && slug) { try { title = decodeURIComponent(slug).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); } catch (e) { title = slug; } }
  if (!slug && title) slug = slugify(title);
  return { id, slug: slug || 'game', title: title || id };
}
function regionCode() { const r = currentRegion(); return r === 'custom' ? 'en-us' : r; }
function mainToast(key, vars, ms) {
  const wc = mainWin && mainWin.webContents;
  try { if (wc) wc.send('xcloud-toast', i18n.t(cfg.language, key, vars), ms || 5000); } catch (e) { /* ignore */ }
}
let glRun = null, glAgain = null;
// ---- 3D game boxes drawn by the app (when Batocera's Python has no Pillow) ----
const boxTried = new Set();
// the age-rating tile on a 3D box: the same as gamebox3d.py's (the app's own
// design, not a rating board's logo). label as Sync-GameList.py stores it:
// "ESRB T", "PEGI 12", ...
function boxTile(age, label) {
  if (typeof age !== 'number' || !label) return null;
  const [system, ...rest] = String(label).split(' ');
  const value = rest.join(' ');
  let top, bottom;
  if (system === 'ESRB') { top = value === 'E' || value === 'EC' ? 'ALL' : `${age}+`; bottom = value.replace(/\+$/, ''); }
  else { top = age <= 0 ? 'ALL' : `${age}+`; bottom = label.length <= 8 ? label : value; }
  const tiers = [[6, '#3B6D11', '#C0DD97'], [10, '#185FA5', '#B5D4F4'], [13, '#854F0B', '#FAC775'], [16, '#993C1D', '#F0997B'], [17, '#A32D2D', '#F7C1C1']];
  const [, color, rule] = tiers.find(t => age <= t[0]) || [0, '#791F1F', '#F7C1C1'];
  return { top, bottom, color, rule };
}
function boxHtml(coverUrl, logoUrl, title, altUrl, rating) {
  const tile = rating ? boxTile(rating.age, rating.label) : null;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:transparent;overflow:hidden}
  body{width:700px;height:1000px;display:flex;align-items:center;justify-content:center;font-family:"DejaVu Sans","Noto Sans",Arial,sans-serif}
  .scene{perspective:2200px;perspective-origin:30% 50%}
  .box{position:relative;width:560px;height:840px;transform-style:preserve-3d;transform:rotateY(24deg);transform-origin:0 50%}
  .front{position:absolute;inset:0;background:#060606;border-radius:14px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
  .head{position:absolute;left:0;right:0;top:0;height:76px;display:flex;align-items:center;gap:13px;padding:0 0 0 30px;background:linear-gradient(#1e241e,#060606)}
  .head img{width:54px;height:54px;object-fit:contain}
  .head span{color:#fff;font-weight:700;font-size:27px;letter-spacing:.5px;white-space:nowrap}
  .line{position:absolute;left:0;right:0;top:76px;height:5px;background:#107c10;box-shadow:0 0 14px 4px rgba(64,190,40,.55),inset 0 2px 0 rgba(120,230,90,.9)}
  #art{position:absolute;left:10px;top:81px;width:540px;height:749px;object-fit:cover;background:#000}
  .gloss{position:absolute;inset:0;background:linear-gradient(100deg,rgba(255,255,255,.13) 0%,rgba(255,255,255,0) 45%);pointer-events:none}
  .tile{position:absolute;right:19px;bottom:29px;min-width:91px;box-sizing:border-box;padding:12px 14px 11px;border-radius:15px;border:4px solid #fff;color:#fff;text-align:center;line-height:1;box-shadow:3px 6px 14px rgba(0,0,0,.45)}
  .tile b{display:block;font-size:40px;font-weight:700}
  .tile i{display:block;height:3px;margin:10px 0}
  .tile span{display:block;font-size:28px;font-weight:700;color:#faf8f0}
  .tile span.long{font-size:21px}
  .spine{position:absolute;left:-52px;top:0;width:52px;height:840px;border-radius:9px;overflow:hidden;transform-origin:100% 50%;transform:rotateY(-90deg);background:linear-gradient(90deg,#040404,#1a1a1a 45%,#050505)}
  .spine img{position:absolute;left:9px;top:20px;width:34px;height:34px;object-fit:contain}
  .spine .t{position:absolute;left:0;right:0;top:84px;bottom:24px;writing-mode:vertical-rl;color:#fff;font-weight:700;font-size:24px;letter-spacing:7px;line-height:52px;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style></head><body>
<div class="scene"><div class="box">
  <div class="spine" id="spine"><img id="lg2" alt=""><div class="t">${esc(title)}</div></div>
  <div class="front" id="front"><div class="head"><img id="lg1" alt=""><span>XBOX CLOUD GAMING</span></div>
    <div class="line"></div><img id="art" alt="">${tile ? `<div class="tile" style="background:${tile.color}"><b>${esc(tile.top)}</b><i style="background:${tile.rule}"></i><span${tile.bottom.length > 4 ? ' class="long"' : ''}>${esc(tile.bottom)}</span></div>` : ''}<div class="gloss"></div></div>
</div></div>
<script>
// ready once the pictures are in (the cover from the saved file, or Microsoft's
// copy if that can't be read): the area the case covers, for the capture
window.__ready = new Promise(function (resolve) {
  var art = document.getElementById('art'), srcs = ${JSON.stringify([coverUrl, altUrl].filter(Boolean))}, si = 0, left = 2;
  function done() {
    if (--left) return;
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      var a = document.getElementById('front').getBoundingClientRect(), b = document.getElementById('spine').getBoundingClientRect();
      var x = Math.floor(Math.min(a.left, b.left)) - 4, y = Math.floor(Math.min(a.top, b.top)) - 4;
      var r = Math.ceil(Math.max(a.right, b.right)) + 4, btm = Math.ceil(Math.max(a.bottom, b.bottom)) + 6;
      resolve({ x: Math.max(0, x), y: Math.max(0, y), width: Math.min(700, r) - Math.max(0, x), height: Math.min(1000, btm) - Math.max(0, y), cover: art.naturalWidth > 0, used: si });
    }); });
  }
  art.onload = function () { (art.decode ? art.decode() : Promise.resolve()).catch(function () {}).then(done); };
  art.onerror = function () { if (++si < srcs.length) art.src = srcs[si]; else done(); };
  art.src = srcs[0] || '';
  var n = 0;
  ['lg1', 'lg2'].forEach(function (id) { var im = document.getElementById(id); im.onload = im.onerror = function () { if (++n === 2) done(); }; im.src = ${JSON.stringify(logoUrl)}; });
});
</script></body></html>`;
}
async function drawBoxes(list) {
  let made = 0, win = null;
  try {
    win = new BrowserWindow({ show: false, width: 700, height: 1000, frame: false, transparent: true, backgroundColor: '#00000000',
      webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    const wc = win.webContents;
    let lastPaint = null;
    wc.on('paint', (e, dirty, image) => { lastPaint = image; });
    try { wc.setFrameRate(30); } catch (e) { /* ignore */ }
    const page = path.join(app.getPath('userData'), 'xcloud-box.html');
    const logo = pathToFileURL(path.join(HOME, 'xcloud-icon.png')).href;
    for (const g of list) {
      try {
        if (!g || !(g.cover || g.url) || !g.out || !/^[0-9A-Z]{12}-box3d\.png$/.test(path.basename(g.out))) continue;
        const alt = /^https:\/\/[a-z0-9.-]*s-microsoft\.com\//i.test(String(g.url || '')) ? String(g.url) : '';
        fs.writeFileSync(page, boxHtml(g.cover ? pathToFileURL(g.cover).href : '', logo, String(g.title || ''), alt, { age: g.age, label: g.label }));
        await wc.loadFile(page);
        const r = await Promise.race([wc.executeJavaScript('window.__ready'), new Promise((res, rej) => setTimeout(() => rej(new Error('timed out')), 8000))]);
        if (!r.cover) throw new Error("the cover picture couldn't be read (the saved file or Microsoft's copy); the flat box art stays");
        if (r.used) log(`3D box for ${g.title}: the saved cover couldn't be read, Microsoft's copy was used`);
        await new Promise(res => setTimeout(res, 150));
        let img = await wc.capturePage(r).catch(() => null);
        if ((!img || img.isEmpty()) && lastPaint && !lastPaint.isEmpty()) img = lastPaint.crop(r);
        if (!img || img.isEmpty()) throw new Error('nothing was drawn');
        img = img.resize({ width: 500, quality: 'best' });
        const tmp = g.out + '.tmp.png';
        fs.writeFileSync(tmp, img.toPNG());
        fs.renameSync(tmp, g.out);
        made++;
      } catch (e) { log(`3D box for ${g && g.title}: ${e.message}`); }
    }
  } catch (e) { log(`3D game boxes: ${e.message}`); }
  try { if (win) win.destroy(); } catch (e) { /* ignore */ }
  return made;
}
function runGameList(mode, why, tell) {
  if (glRun) { glAgain = [mode, why, tell]; return; }
  const { spawn } = require('child_process');
  log(`Batocera game list: updating to "${mode}" (${why})`);
  let out = '';
  try {
    // its own process group, so it carries on (and finishes the list) if the
    // app is closed before it's done; it then writes to the app's log itself
    glRun = spawn('python3', [SYNC_GAMELIST, mode, '--market', regionCode()], { env: Object.assign({}, process.env, { XCLOUD_HOME: HOME, XCLOUD_APP_LOG: LOG }), stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  } catch (e) { glRun = null; log(`Batocera game list: ${e.message}`); if (tell) mainToast('glFail'); return; }
  let seen = 0;
  glRun.stdout.on('data', d => {
    out += d;
    // as it goes: the games listed (pictures still coming), or waiting for an earlier run
    const lines = out.split('\n');
    for (; seen < lines.length - 1; seen++) {
      let m; try { m = JSON.parse(lines[seen]); } catch (e) { continue; }
      if (m.stage === 'listed') log(`Batocera game list: ${m.count} games listed; their pictures are still coming (this carries on if the app is closed)`);
      else if (m.stage === 'waiting') log('Batocera game list: waiting for the update already running to finish');
    }
  });
  glRun.stderr.on('data', d => { out += d; });
  glRun.on('error', e => { out += `{"error": ${JSON.stringify(e.message)}}\n`; });
  glRun.on('close', code => {
    glRun = null;
    let last = {}, need = [];
    for (const line of out.trim().split('\n').reverse()) { try { last = JSON.parse(line); break; } catch (e) { /* not JSON */ } }
    // what it warned about goes in the log; 3D boxes it couldn't draw itself, the app draws
    for (const line of out.trim().split('\n')) {
      let m; try { m = JSON.parse(line); } catch (e) { continue; }
      if (m && m.warning) log(`Batocera game list: ${m.warning}`);
      if (m && Array.isArray(m.need_boxes)) need = need.concat(m.need_boxes);
    }
    if (last.done && need.length && mode !== 'off' && cfg.game_list_3d && !boxTried.has(need.map(n => n.id).sort().join())) {
      boxTried.add(need.map(n => n.id).sort().join());
      drawBoxes(need).then(made => {
        log(`Batocera game list: drew ${made} of ${need.length} 3D game boxes`);
        if (made) runGameList(mode, '3D game boxes drawn', false);
      });
    }
    if (last.done) {
      log(`Batocera game list: ${last.mode === 'off' ? "back to just the app's entry" : `${last.count} games`}; it shows once you're back in Batocera`);
      if (tell) mainToast(last.mode === 'off' ? 'glOffDone' : 'glDone', { n: last.count }, 6000);
    } else {
      log(`Batocera game list: couldn't update (${last.error || out.trim().split('\n').pop() || 'exit ' + code})`);
      if (tell) mainToast('glFail', null, 6000);
    }
    if (glAgain) { const a = glAgain; glAgain = null; runGameList(...a); }
  });
}
// Games I pick on: once a game is launching (not on its store page), a hint
// at the bottom, once per game each time the app is open, saying how to add
// it to the list (or take it out)
const pickHinted = new Set();
function pickHint(wc, url) {
  if (cfg.game_list !== 'picked' || SETTINGS_MODE || overlay) return;
  if (!/\/launch\//.test(url || '')) return;
  const first = gameFromUrl(url);
  if (!first || pickHinted.has(first.id)) return;
  pickHinted.add(first.id);
  // a moment later, once the page has settled (and has the game's name as its title)
  setTimeout(() => {
    try {
      if (wc.isDestroyed() || overlay) return;
      let pageTitle = String(wc.getTitle() || '').split(/\s+[|\u2013\u2014-]\s+/)[0].trim();
      if (/^(xbox|microsoft)\b/i.test(pageTitle) || /^https?:/i.test(pageTitle)) pageTitle = '';
      const g = gameFromUrl(url, pageTitle) || first;
      const key = pickedGames().some(x => x.id === g.id) ? 'gpHintRemove' : 'gpHintAdd';
      wc.send('xcloud-toast', i18n.t(cfg.language, key, { game: g.title }), 6000);
    } catch (e) { /* ignore */ }
  }, 1500);
}
// "Games I pick" just turned on: a short how-to (OK / Don't show this again).
// From the F1 Settings shortcut (no dashboard), it waits for the next start.
const PICK_TIP_HIDDEN = path.join(HOME, 'pick-tip-hidden');
const PICK_TIP_DUE = path.join(HOME, 'pick-tip-due');
function pickTipDue() {
  if (fs.existsSync(PICK_TIP_HIDDEN)) return;
  if (SETTINGS_MODE) { try { fs.writeFileSync(PICK_TIP_DUE, 'x'); } catch (e) { /* ignore */ } return; }
  queuePrompt({ kind: 'picktip' });
}
function pickTipHtml() {
  const L = cfg.language;
  const T = k => i18n.t(L, k).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!doctype html>
<html lang="${L}"><head><meta charset="utf-8"><title>Xbox Cloud Gaming</title>
<style>
  ${i18n.FONT_CSS}${PAGE_CSS}
  .card{max-width:980px;text-align:left}
  h1{text-align:center;margin-bottom:26px}
  ol{margin:0 0 34px;padding:0;list-style:none;counter-reset:s}
  li{counter-increment:s;display:flex;gap:18px;align-items:flex-start;font-size:24px;line-height:1.4;color:#eee;margin:0 0 18px}
  li:before{content:counter(s);flex:none;width:40px;height:40px;border-radius:50%;background:#107c10;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center}
  .row{display:flex;gap:20px;justify-content:center}
  .b{border-radius:10px;padding:16px 34px;font-size:22px;font-weight:600;background:#262626;color:#ddd;border:3px solid #555}
  .b.yes{background:#107c10;color:#fff;border-color:#107c10}
  .b.on{outline:4px solid #fff;outline-offset:4px}
</style></head><body>
<div class="card">
  <h1>${T('ptT')}</h1>
  <ol><li>${T('ptS1')}</li><li>${T('ptS2')}</li><li>${T('ptS3')}</li><li>${T('ptS4')}</li></ol>
  <div class="row">
    <button class="b yes" data-a="ok">${T('pinOk')}</button>
    <button class="b" data-a="never">${T('never')}</button>
  </div>
</div>
<script>
(function () {
  var P = '${ACTION_PREFIX}';
  var bs = Array.prototype.slice.call(document.querySelectorAll('.b')), cur = 0, sent = false;
  function go(a) { if (sent) return; sent = true; location.href = P + 'picktip?a=' + a; }
  function render() { bs.forEach(function (b, i) { b.classList.toggle('on', i === cur); }); }
  bs.forEach(function (b, i) { b.addEventListener('click', function () { cur = i; go(b.getAttribute('data-a')); }); });
  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowUp') cur = (cur + 1) % bs.length;
    else if (k === 'Enter' || k === ' ' || k === 'NumpadEnter') { go(bs[cur].getAttribute('data-a')); return; }
    else if (k === 'y' || k === 'Y') { go('never'); return; }
    else if (k === 'Escape' || k === 'Backspace') { go('ok'); return; }
    else return;
    e.preventDefault(); render();
  });
  render();
})();
</script></body></html>`;
}
// Settings saved: the choice is for the whole machine (config.json)
function saveGameList(q) {
  const mode = String(q.get('glist') || '');
  if (!['off', 'all', 'picked'].includes(mode)) return;
  if (mode === 'picked' && cfg.game_list !== 'picked') pickTipDue();
  let pickChanged = false;
  const id = String(q.get('gid') || '').toUpperCase();
  if (/^[0-9A-Z]{12}$/.test(id) && q.has('gpick') && mode === 'picked') {
    const list = pickedGames(), has = list.some(g => g.id === id), want = q.get('gpick') === '1';
    if (want !== has) {
      const next = want ? list.concat([{ id, slug: String(q.get('gslug') || '').slice(0, 120) }]) : list.filter(g => g.id !== id);
      try { fs.writeFileSync(PICKED_FILE, JSON.stringify(next, null, 2) + '\n'); pickChanged = true; } catch (e) { log(`could not save the picked games: ${e.message}`); }
      log(`Batocera game list: ${want ? 'added' : 'removed'} ${id}`);
    }
  }
  const box3d = q.get('g3d') === '1', boxChanged = q.has('g3d') && box3d !== !!cfg.game_list_3d;
  if (mode !== cfg.game_list || boxChanged) {
    cfg.game_list = mode;
    if (boxChanged) { cfg.game_list_3d = box3d; log(`Batocera game list: 3D game boxes ${box3d ? 'on' : 'off'}`); }
    let obj = {};
    try { obj = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch (e) { obj = {}; }
    obj.game_list = mode;
    obj.game_list_3d = !!cfg.game_list_3d;
    try { fs.writeFileSync(CONFIG, JSON.stringify(obj, null, 2) + '\n'); } catch (e) { log(`could not save settings: ${e.message}`); }
    if (mode === 'off' && !(mode !== glState().mode)) return;   // boxes changed with no games listed: nothing to redo
  } else if (!(mode === 'picked' && pickChanged)) return;
  mainToast('glBusy', null, 4000);
  runGameList(mode, 'Settings', true);
}

// ---------- Save logs for help ----------
// One zip in Batocera's share folder with what's needed to sort out a
// problem: the logs, the settings, the controller setup and a short summary.
// Gamertags and Xbox user numbers are replaced, nothing about the sign-in
// itself is included.
const SHARE = process.env.XCLOUD_SHARE || '/userdata';
let CRC_TABLE = null;
function crc32(buf) {
  if (zlib.crc32) return zlib.crc32(buf);
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c; }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function makeZip(files) {   // [{name, data: Buffer}] -> Buffer
  const parts = [], central = [];
  let off = 0;
  const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff,
    dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'), raw = f.data, comp = zlib.deflateRawSync(raw), crc = crc32(raw);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt16LE(dt, 10); h.writeUInt16LE(dd, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18);
    h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(dt, 12); c.writeUInt16LE(dd, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20);
    c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    parts.push(h, name, comp); central.push(c, name);
    off += h.length + name.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat(parts.concat([cd, end]));
}
// Batocera's version, from its own file ("42 2025/08/20 12:00"): "Batocera 42 (2025/08/20)"
// HippOS (a Debian-based gaming system built like Batocera) runs this too
function batoceraVersion() {
  if (ON_HIPPOS) {
    let v = '';
    try { v = fs.readFileSync(HIPPOS_VERSION_FILE, 'utf8').trim().split('\n')[0]; } catch (e) { v = ''; }
    return v ? `HippOS ${v}` : 'HippOS version unknown';
  }
  let t = '';
  try { t = fs.readFileSync(process.env.XCLOUD_BATOCERA_VERSION || '/usr/share/batocera/batocera.version', 'utf8').trim().split('\n')[0]; } catch (e) { return 'Batocera version unknown'; }
  const m = /^(\S+)(?:\s+(\S+))?/.exec(t);
  return m ? `Batocera ${m[1]}${m[2] ? ` (${m[2]})` : ''}` : 'Batocera version unknown';
}
function readText(f, max) {
  try {
    const st = fs.statSync(f);
    const n = Math.min(st.size, max || 512 * 1024), fd = fs.openSync(f, 'r'), b = Buffer.alloc(n);
    fs.readSync(fd, b, 0, n, st.size - n); fs.closeSync(fd);
    return b.toString('utf8');
  } catch (e) { return null; }
}
function saveSupportLogs(wc) {
  const done = f => { if (wc && !wc.isDestroyed()) wc.executeJavaScript(`window.__logsStatus && window.__logsStatus(${JSON.stringify(f)})`).catch(() => {}); };
  try {
    // gamertags: the profiles' names and any name the logs mention
    const names = new Map();
    profiles.list.forEach((p, i) => { if (p.name) names.set(p.name, `Profile ${i + 1}`); });
    const logs = { 'xcloud-app.log': readText(LOG), 'xcloud.log': readText(path.join(path.dirname(LOG), 'xcloud.log')),
      'xcloud-install.log': readText(path.join(path.dirname(LOG), 'xcloud-install.log')),
      'xcloud-update.log': readText(path.join(path.dirname(LOG), 'xcloud-update.log')) };
    const NAME_RES = [/signed in: (.+?) \(/g, /gamerpic saved for (.+?) \(/g, /profile: (.+?) \(/g, /first profile: (.+)$/gm,
      /profiles: (?:added|removed) (.+)$/gm, /^\S+ (.+?) has a profile already/gm, /settings saved for (.+?):/g];
    let other = 0;
    for (const t of Object.values(logs)) {
      if (!t) continue;
      for (const re of NAME_RES) for (const m of t.matchAll(re)) {
        const n = m[1].trim();
        if (n && n !== '?' && n !== 'none' && !/^p\d+$/.test(n) && !names.has(n)) names.set(n, `Player ${++other}`);
      }
    }
    const order = [...names.keys()].sort((a, b) => b.length - a.length);
    const scrub = t => {
      for (const n of order) t = t.split(n).join(names.get(n));
      return t.replace(/\b2\d{15}\b/g, '[xuid]').replace(/(XBL3\.0 x=|Authorization:?\s*)\S+/gi, '$1[removed]');
    };
    const files = [];
    const add = (name, text) => { if (text != null) files.push({ name, data: Buffer.from(text, 'utf8') }); };
    for (const [n, t] of Object.entries(logs)) add(n, t == null ? null : scrub(t));
    add('config.json', readText(CONFIG));
    if (profiles.active) {
      add('profiles.json', JSON.stringify({ pin: profiles.hasPin,
        profiles: profiles.list.map((p, i) => ({ id: p.id, name: `Profile ${i + 1}`, age: p.age, signedIn: !!p.xuid })) }, null, 2) + '\n');
      for (const p of profiles.list) add(`profile-settings/${p.id}.json`, readText(path.join(HOME, 'profile-settings', p.id + '.json')));
    }
    const bv = readText('/usr/share/batocera/batocera.version');
    const pads = [];
    try {
      for (const d of fs.readdirSync(POWER_DIR)) {
        const r = n => (readText(path.join(POWER_DIR, d, n)) || '').trim();
        if (r('scope') === 'Device') pads.push(`${d}: ${r('capacity') ? r('capacity') + '%' : r('capacity_level') || '?'} ${r('status')}`);
      }
    } catch (e) { /* none */ }
    add('about.txt', [
      `Xbox Cloud Gaming ${VERSION}`, `Saved ${new Date().toString()}`,
      `Browser engine: Electron ${process.versions.electron} (Chromium ${process.versions.chrome}), ${process.arch}`,
      `Batocera: ${bv ? bv.trim() : 'unknown'}`, `Language: ${cfg.language}`,
      `Profiles: ${profiles.count}`,
      `Controller batteries: ${pads.join('; ') || 'none reported'}`, ''].join('\n'));
    const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
    const name = `xcloud-logs-${stamp}.zip`;
    fs.writeFileSync(path.join(SHARE, name), makeZip(files));
    log(`logs saved for help: ${path.join(SHARE, name)} (${files.length} files)`);
    done(name);
  } catch (e) {
    log(`could not save the logs: ${e.message}`);
    done('');
  }
}

// ---------- controller batteries ----------
// Linux lists a wireless controller's battery in /sys/class/power_supply
// (scope "Device"). A message shows on screen when it gets low (15%, again
// at 5%), so the controller doesn't just die in the middle of a game.
const POWER_DIR = process.env.XCLOUD_POWER_SUPPLY || '/sys/class/power_supply';
const batteryWarned = {};
function checkPadBatteries() {
  let dirs = [];
  try { dirs = fs.readdirSync(POWER_DIR); } catch (e) { return; }
  for (const d of dirs) {
    const r = n => { try { return fs.readFileSync(path.join(POWER_DIR, d, n), 'utf8').trim(); } catch (e) { return ''; } };
    if (r('scope') !== 'Device') continue;
    if (/^(Charging|Full)$/i.test(r('status'))) { delete batteryWarned[d]; continue; }
    const cap = parseInt(r('capacity'), 10), lvl = r('capacity_level');
    const level = Number.isFinite(cap) ? (cap <= 5 ? 2 : cap <= 15 ? 1 : 0) : /critical/i.test(lvl) ? 2 : /low/i.test(lvl) ? 1 : 0;
    if (!level) { delete batteryWarned[d]; continue; }
    if ((batteryWarned[d] || 0) >= level) continue;
    batteryWarned[d] = level;
    log(`controller battery low: ${d} ${Number.isFinite(cap) ? cap + '%' : lvl}`);
    const wc = mainWin && mainWin.webContents;
    const msg = Number.isFinite(cap) ? i18n.t(cfg.language, 'padLow', { n: cap }) : i18n.t(cfg.language, 'padLowX');
    try { if (wc) wc.send('xcloud-toast', msg, 6000); } catch (e) { /* ignore */ }
  }
}

// ---------- Updates: the app (GitHub Releases) and the browser engine ----------
// One press of Settings > Updates checks both and gets whatever is newer, by
// itself:
//  - the app: the newest Release of the app's GitHub repository (only
//    published Releases, never work in progress). Its zip is downloaded,
//    unpacked and checked into update-staged/; the next time the app
//    closes, Launch-XboxCloudGaming.sh runs that version's installer in the
//    background (xcloud-apply-update.sh), which keeps config.json, the
//    profiles, sign-ins, PIN and picked games, and also brings the newest
//    engine. So the new version is the one used the next time it opens.
//  - the engine (Electron), when only it is newer: Build-Runtime.py --stage
//    downloads it next to the one in use (checked against Electron's
//    published checksums); Run-App.sh switches to it the next time.
// Anything that fails leaves the app as it was; every step is in the log.
const UPDATE_REPO = process.env.XCLOUD_REPO || 'rmach89/xcloud-batocera-hippos';
const RELEASES_URL = process.env.XCLOUD_RELEASES_URL || `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;
const UPDATE_STAGED = path.join(HOME, 'update-staged');
let upd = { state: 'idle' };
function updStatus(st) {
  upd = st;
  const wc = settingsWc;
  if (!wc || wc.isDestroyed()) return;
  wc.executeJavaScript(`window.__updateStatus && window.__updateStatus(${JSON.stringify(st)})`).catch(() => { /* Settings closed */ });
}
function verNum(v) { return String(v || '').replace(/^v/, '').split(/[.-]/).slice(0, 3).map(n => parseInt(n, 10) || 0); }
function newer(a, b) {
  const x = verNum(a), y = verNum(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}
function runBuild(args, onLine, done) {
  const { spawn } = require('child_process');
  let child;
  try {
    child = spawn('python3', [BUILD_RUNTIME].concat(args), { env: Object.assign({}, process.env, { XCLOUD_HOME: HOME }), stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { done(1, e.message); return; }
  let buf = '', all = '';
  const take = d => {
    buf += d.toString(); all += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { onLine(line); } catch (e) { /* ignore */ } }
  };
  child.stdout.on('data', take);
  child.stderr.on('data', take);
  child.on('error', e => done(1, e.message));
  child.on('close', code => { if (buf) onLine(buf); done(code, all); });
}
function stagedAppVersion() {
  try { return fs.readFileSync(path.join(UPDATE_STAGED, 'ready'), 'utf8').trim(); } catch (e) { return ''; }
}
// the newest Release: { version, zip } (null with a reason when it can't be read)
function latestRelease() {
  return new Promise(resolve => {
    let req;
    try { req = net.request({ url: RELEASES_URL, method: 'GET' }); } catch (e) { resolve({ error: e.message }); return; }
    req.setHeader('Accept', 'application/vnd.github+json');
    req.setHeader('User-Agent', 'xcloud-batocera-hippos/' + VERSION);
    const timer = setTimeout(() => { try { req.abort(); } catch (e) { /* ignore */ } resolve({ error: 'timed out' }); }, 20000);
    req.on('response', res => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => {
        clearTimeout(timer);
        if (res.statusCode !== 200) { resolve({ error: res.statusCode === 404 ? 'no release published yet (HTTP 404)' : `HTTP ${res.statusCode}` }); return; }
        try {
          const r = JSON.parse(body);
          const version = String(r.tag_name || '').replace(/^[vV]/, '');
          const asset = (r.assets || []).find(a => /\.zip$/i.test(String(a.name || '')));
          if (!version || !asset) { resolve({ error: 'the newest release has no version tag or no zip' }); return; }
          resolve({ version, zip: asset.browser_download_url });
        } catch (e) { resolve({ error: 'GitHub\'s answer couldn\'t be read' }); }
      });
    });
    req.on('error', e => { clearTimeout(timer); resolve({ error: e.message }); });
    req.end();
  });
}
// download a file, with progress (0-100)
function download(url, dest, onPct) {
  return new Promise((resolve, reject) => {
    let req, out, got = 0, total = 0, last = -1;
    try { req = net.request({ url, method: 'GET', redirect: 'follow' }); } catch (e) { reject(e); return; }
    req.setHeader('User-Agent', 'xcloud-batocera-hippos/' + VERSION);
    req.on('response', res => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      total = Number(res.headers['content-length']) || 0;
      try { out = fs.createWriteStream(dest); } catch (e) { reject(e); return; }
      res.on('data', d => {
        out.write(d); got += d.length;
        const pct = total ? Math.floor(got * 100 / total) : 0;
        if (pct !== last) { last = pct; onPct(pct); }
      });
      res.on('end', () => out.end(() => (total && got < total ? reject(new Error(`cut off at ${Math.floor(got * 100 / total)}%`)) : resolve(got))));
      res.on('error', e => { try { out.end(); } catch (x) { /* ignore */ } reject(e); });
    });
    req.on('error', reject);
    req.end();
  });
}
function unzip(zip, dir) {
  const { execFileSync } = require('child_process');
  execFileSync('python3', ['-I', '-c', 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', zip, dir], { timeout: 120000 });
}
// download, unpack and check the newest app; ready for the next close
async function stageApp(rel, onPct) {
  const work = UPDATE_STAGED + '.new';
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const zip = path.join(work, 'update.zip');
  try {
    await download(rel.zip, zip, onPct);
  } catch (e) { fs.rmSync(work, { recursive: true, force: true }); throw new Error(`app download failed (${e.message})`); }
  try { unzip(zip, path.join(work, 'pkg')); } catch (e) { fs.rmSync(work, { recursive: true, force: true }); throw new Error('the zip couldn\'t be unpacked'); }
  fs.rmSync(zip, { force: true });
  // the package: install.sh next to system/add-ons/xcloud with the app in it, of the version the release says
  const find = (dir, depth) => {
    if (fs.existsSync(path.join(dir, 'install.sh'))) return dir;
    if (depth <= 0) return '';
    for (const n of fs.readdirSync(dir)) { const d = path.join(dir, n); if (fs.statSync(d).isDirectory()) { const f = find(d, depth - 1); if (f) return f; } }
    return '';
  };
  const root = find(path.join(work, 'pkg'), 2);
  let pv = '';
  try { pv = JSON.parse(fs.readFileSync(path.join(root, 'system/add-ons/xcloud/app-source/package.json'), 'utf8')).version; } catch (e) { pv = ''; }
  if (!root || !fs.existsSync(path.join(root, 'system/add-ons/xcloud/app.asar')) || pv !== rel.version) {
    fs.rmSync(work, { recursive: true, force: true });
    throw new Error(`the zip didn't look right (${!root ? 'no install.sh' : pv !== rel.version ? `it holds v${pv || '?'}, not v${rel.version}` : 'no app.asar'})`);
  }
  fs.writeFileSync(path.join(work, 'ready'), rel.version + '\n');
  fs.rmSync(UPDATE_STAGED, { recursive: true, force: true });
  fs.renameSync(work, UPDATE_STAGED);
}
function stageEngine(onPct) {
  return new Promise((resolve, reject) => {
    let staged = false;
    runBuild(['--stage'], line => {
      const m = line.match(/^\s*(\d+)%/);
      if (m) onPct(Number(m[1]));
      if (/^STAGED /.test(line)) staged = true;
    }, (code, out) => (code === 0 && staged ? resolve() : reject(new Error(`engine download failed (${String(out).trim().split('\n').pop() || code})`))));
  });
}
function engineCheck() {
  return new Promise(resolve => {
    let info = null;
    runBuild(['--check'], line => { if (/^\s*\{/.test(line)) { try { info = JSON.parse(line); } catch (e) { /* ignore */ } } },
      (code, out) => resolve(code === 0 && info && info.latest ? info : { error: String(out).trim().split('\n').pop() || `exit ${code}` }));
  });
}
async function checkForUpdates() {
  if (upd.state === 'checking' || upd.state === 'getting') return;
  const engine = 'v' + process.versions.electron;
  updStatus({ state: 'checking' });
  log(`updates: checking (app v${VERSION} on GitHub ${UPDATE_REPO}, engine ${engine} on Electron)`);
  const [rel, eng] = await Promise.all([latestRelease(), engineCheck()]);
  if (rel.error) log(`updates: couldn't reach GitHub (${rel.error})`);
  if (eng.error) log(`updates: couldn't check the engine (${eng.error})`);
  if (rel.error && eng.error) { log('updates: nothing changed'); updStatus({ state: 'fail' }); return; }
  const staged = stagedAppVersion();
  const appNew = !rel.error && newer(rel.version, VERSION) && !(staged && !newer(rel.version, staged)) ? rel : null;
  const engStaged = !eng.error && eng.staged && !newer(eng.latest, eng.staged) && newer(eng.staged, engine);
  const engNew = !eng.error && newer(eng.latest, engine) && !engStaged;
  if (!rel.error) log(`updates: app: this is v${VERSION}, newest v${rel.version}${staged ? `, v${staged} already downloaded` : ''}`);
  if (!eng.error) log(`updates: engine: this is ${engine}, newest ${eng.latest}${eng.staged ? `, ${eng.staged} already downloaded` : ''}`);
  if (!appNew && !engNew) {
    if ((staged && newer(staged, VERSION)) || engStaged) { log('updates: already downloaded; used the next time the app opens'); updStatus({ state: 'done', a: staged || VERSION, e: String(engStaged ? eng.staged : engine).replace(/^v/, '') }); return; }
    log('updates: up to date');
    updStatus({ state: rel.error || eng.error ? 'fail' : 'none' });
    return;
  }
  updStatus({ state: 'getting', p: 0 });
  try {
    if (appNew) {
      // the new app's installer brings the newest engine too
      log(`updates: app v${rel.version} found, downloading...`);
      await stageApp(rel, p => updStatus({ state: 'getting', p }));
      log(`updates: app v${rel.version} downloaded; it's installed when the app closes and used the next time it opens (settings, profiles and sign-ins are kept)`);
    } else {
      log(`updates: engine ${eng.latest} found, downloading...`);
      await stageEngine(p => updStatus({ state: 'getting', p }));
      log(`updates: engine ${eng.latest} downloaded; used the next time the app opens`);
    }
    updStatus({ state: 'done', a: appNew ? rel.version : VERSION, e: String(appNew ? process.versions.electron : eng.latest).replace(/^v/, '') });
  } catch (e) {
    log(`updates: ${e.message}: nothing changed`);
    updStatus({ state: 'fail' });
  }
}

// ---------- who is signed in (children mode and profiles) ----------
// Xbox's sign-in service tells the Xbox page who signed in: the gamertag,
// the account's ID and its age group (Adult, Teen or Child; from the age on
// the Microsoft account and Microsoft Family settings). The app reads that;
// it never sends anything anywhere.
let identitySeen = '';
let ageGroupSeen = '';
function seen(person, how) {
  // Xbox's answer for its own services also carries a sign-in token: used
  // (in memory only) to ask Xbox's profile service for the gamerpic
  if (person.xuid && person.token && person.uhs) gamerpicAuth = { xuid: person.xuid, uhs: person.uhs, token: person.token };
  const key = [person.xuid, person.name, person.age].join('|');
  if (!person.age && !person.xuid && !person.name) return;
  if (key === identitySeen) return;
  identitySeen = key;
  if (person.age && person.age !== ageGroupSeen) { ageGroupSeen = person.age; log(`account age group: ${person.age} (${how})`); }
  if (person.name || person.xuid) log(`signed in: ${person.name || '?'} (${how})`);

  if (!profiles.active) {
    if (person.xuid || person.name) {
      // the first person seen becomes the first profile (nothing changes for them)
      curProfile = profiles.start(person);
      log(`first profile: ${curProfile.name}`);
    } else return;   // only the age group is known so far
  } else if (curProfile) {
    const fresh = {};
    if (person.age) fresh.age = person.age;
    if (person.name) fresh.name = person.name;
    if (!curProfile.xuid || !person.xuid || person.xuid === curProfile.xuid) {
      // this profile's own person (or a new profile's first sign-in)
      if (person.xuid) fresh.xuid = person.xuid;
      profiles.update(curProfile, fresh);
    } else {
      otherPerson(person);
      return;
    }
  }
  afterIdentity();
}
// the age group may have changed what this profile is allowed, and an
// adult may need to be asked for a PIN
let pinAsked = false;
function afterIdentity() {
  fetchGamerpic();
  // a child or teen plays here now: whoever just signed in may be leaving
  // an adult's profile open
  if (isMinor(curProfile)) unlockedId = '';
  // asked as soon as a child's or teen's profile is set up (also on that
  // profile's first sign-in), while the adult setting it up is usually
  // still there, rather than later when a child could get to it first
  if (profiles.active && !pinAsked && curProfile && curProfile.age && minorsHere() && !profiles.hasPin) {
    pinAsked = true;
    log("a child's or teen's profile is set up and adult profiles have no PIN: asking for one now");
    queuePrompt({ kind: 'pinsetup' });
  }
}
// someone other than this profile's person signed in on it
function otherPerson(person) {
  const known = profiles.byXuid(person.xuid);
  if (known) {
    // an adult's account signed in on a child's profile: the PIN first
    if (isMinor(curProfile) && needsPin(known)) {
      log(`${person.name || person.xuid} (an adult's profile) signed in on ${profileName(curProfile)}'s restricted profile: asking for the PIN`);
      queuePrompt({ kind: 'movepin', pend: { kind: 'move', id: known.id, person } });
      return;
    }
    moveSignIn(known, person);
    return;
  }
  if (profiles.declined) { log('a different person signed in; profiles: "don\'t ask again" was chosen'); return; }
  queuePrompt({ kind: 'setup', person });
}
// a person with their own profile signed in here: this storage is now
// theirs; this profile starts fresh (signs in again next time)
function moveSignIn(known, person) {
  {
    log(`${person.name || person.xuid} has a profile already: moving this sign-in to it`);
    const mine = curProfile;
    const theirsOld = sessionFor(known);
    profiles.update(known, { part: mine.part, age: person.age || known.age, name: person.name || known.name });
    profiles.update(mine, { part: `xcloud-${mine.id}-${Date.now().toString(36)}`, xuid: '', age: '' });
    theirsOld.clearStorageData().catch(() => {});
    curProfile = known;
    profiles.setLast(known.id);
    Object.assign(cfg, loadConfig(known.id));
    afterIdentity();
  }
}
// The PIN wasn't given for an adult's sign-in on a child's profile: that
// sign-in is undone (this profile's storage is signed out), so the child
// signs in with their own account again.
function undoAdultSignIn(person) {
  log(`PIN not given: ${person && (person.name || person.xuid) || 'that'} sign-in on ${profileName(curProfile)}'s profile is signed out again`);
  identitySeen = '';
  curSession().clearStorageData().catch(() => {}).then(() => { if (mainWin) { siteReady = false; openStart(mainWin.webContents); } });
}
// answer to "Set up profiles?"
function setupAnswer(answer, person, pinOk) {
  if (answer === 'never') { profiles.declined = true; log('profiles: "Don\'t ask again"'); return; }
  if (answer !== 'yes' || !person) { log('profiles: "Not now"'); return; }
  // a new adult's profile made from a child's: the PIN first
  if (!pinOk && isMinor(curProfile) && profiles.hasPin && !isMinor(person)) {
    log(`a new adult's profile from ${profileName(curProfile)}'s restricted profile: asking for the PIN`);
    queuePrompt({ kind: 'movepin', pend: { kind: 'addperson', person } });
    return;
  }
  // the new person's sign-in is in this storage now; the profile that was
  // here starts fresh and signs in again the next time it's picked
  const mine = curProfile;
  const p = profiles.add(person);
  profiles.update(p, { part: mine.part });
  profiles.update(mine, { part: `xcloud-${mine.id}-${Date.now().toString(36)}`, xuid: '', age: '' });
  curProfile = p;
  profiles.setLast(p.id);
  Object.assign(cfg, loadConfig(p.id));
  log(`profiles: added ${p.name || p.id}`);
  afterIdentity();
}
// who signed in, from an answer of Xbox's sign-in service
function personFrom(body) {
  const out = {};
  try {
    const j = JSON.parse(body);
    const x = j && j.DisplayClaims && Array.isArray(j.DisplayClaims.xui) && j.DisplayClaims.xui[0];
    if (x) { out.age = x.agg || ''; out.name = x.gtg || ''; out.xuid = x.xid || ''; out.uhs = x.uhs || ''; out.token = j.Token || ''; }
  } catch (e) {
    const g = String(body).match(/"agg"\s*:\s*"(Adult|Teen|Child)"/);
    if (g) out.age = g[1];
  }
  if (!/^(Adult|Teen|Child)$/.test(out.age || '')) out.age = '';
  return out;
}
// read Xbox's sign-in answers (xsts.auth.xboxlive.com), through Chromium's
// own network view of the Xbox page
function watchAgeGroup(wc) {
  const dbg = wc.debugger;
  if (!dbg) return;
  try { dbg.attach('1.3'); } catch (e) { log(`sign-in check unavailable: ${e.message}`); return; }
  const wanted = new Set();
  dbg.on('message', (event, method, params) => {
    if (method === 'Network.responseReceived') {
      if (/^https:\/\/[a-z0-9.-]*xboxlive\.com\/.*authorize/i.test(params.response && params.response.url)) wanted.add(params.requestId);
    } else if (method === 'Network.loadingFinished' && wanted.has(params.requestId)) {
      wanted.delete(params.requestId);
      dbg.sendCommand('Network.getResponseBody', { requestId: params.requestId }).then(r => {
        if (!mainWin || wc !== mainWin.webContents) return; // a window being replaced
        const body = r.base64Encoded ? Buffer.from(r.body, 'base64').toString() : r.body;
        seen(personFrom(body), 'sign-in');
      }).catch(() => { /* the answer is gone already */ });
    }
  });
  dbg.on('detach', () => { /* closed */ });
  dbg.sendCommand('Network.enable', { maxResourceBufferSize: 1024 * 1024, maxTotalBufferSize: 8 * 1024 * 1024 })
    .catch(e => log(`sign-in check unavailable: ${e.message}`));
}
// also look in what the Xbox page keeps between visits (it signs in again
// from that without asking the sign-in service every time)
const AGE_SCAN = String.raw`(function(){try{var s='';for(var i=0;i<localStorage.length;i++){s+=localStorage.getItem(localStorage.key(i))||'';if(s.length>4e6)break;}
function f(re){var m=s.match(re);return m?m[1]:'';}
return JSON.stringify({age:f(/agg\\?"\s*:\s*\\?"(Adult|Teen|Child)/),name:f(/gtg\\?"\s*:\s*\\?"([^"\\]{1,40})/),xuid:f(/xid\\?"\s*:\s*\\?"(\d{5,20})/)});}catch(e){return '{}'}})()`;
function scanAgeGroup(wc) {
  if (!wc || wc.isDestroyed() || !mainWin || wc !== mainWin.webContents) return;
  let host = '';
  try { host = new URL(wc.getURL()).hostname; } catch (e) { return; }
  if (!/xbox\.com$/i.test(host)) return;
  wc.executeJavaScript(AGE_SCAN).then(j => { try { seen(JSON.parse(j), 'saved sign-in'); } catch (e) { /* ignore */ } }).catch(() => {});
}

function cleanUserAgent() {
  if (cfg.user_agent) return cfg.user_agent;
  // a plain Chrome user agent, without Electron or app names: Linux, or
  // Windows when "Stream as a Windows PC" is on
  const os = cfg.stream_as_windows ? 'Windows NT 10.0; Win64; x64' : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
}
function applyUserAgent() {
  const ua = cleanUserAgent();
  app.userAgentFallback = ua;
  try { curSession().setUserAgent(ua); } catch (e) { /* ignore */ }
  try { mainWin && mainWin.webContents.setUserAgent(ua); } catch (e) { /* ignore */ }
}

function blocked(wc, url, how) {
  log(`blocked (${how}): ${url}`);
  try { wc.send('xcloud-toast', i18n.t(cfg.language, 'blocked'), 2500); } catch (e) { /* ignore */ }
}

// Electron changed some event signatures over time; accept both styles.
function navUrl(event, arg) { return typeof arg === 'string' ? arg : (event && event.url) || ''; }

// Keyboard exit: hold Esc. Watched here (before the page sees the key), so it
// works even during a game; a quick tap of Esc still reaches the page.
let escTimer = null;
let escWarn = null;
function escReset() {
  clearTimeout(escTimer); clearTimeout(escWarn);
  escTimer = null; escWarn = null;
}
function watchEsc(wc) {
  wc.on('before-input-event', (event, input) => {
    if (input.key !== 'Escape') return;
    if (input.type === 'keyDown' && !input.isAutoRepeat && !escTimer) {
      const holdMs = Math.round(cfg.exit_hold_seconds * 1000);
      escWarn = setTimeout(() => { try { wc.send('xcloud-toast', i18n.t(cfg.language, 'holdEsc'), holdMs); } catch (e) { /* ignore */ } }, 400);
      escTimer = setTimeout(() => fastExit('keyboard, Esc held'), holdMs);
    } else if (input.type === 'keyUp') {
      escReset();
    }
  });
  wc.on('blur', escReset);
}

function guard(wc, isLayer) {
  watchEsc(wc);
  wc.on('dom-ready', () => {
    let u = '';
    try { u = wc.getURL(); } catch (e) { return; }
    if (!/^https:/i.test(u) || dashHost(u)) return;
    wc.executeJavaScript(NO_PAD).catch(() => { /* page between loads */ });
  });
  wc.on('will-navigate', (event, arg) => {
    const url = navUrl(event, arg);
    if (url.startsWith(ACTION_PREFIX)) { event.preventDefault(); handleAction(wc, url); return; }
    if (!isAllowed(url)) { event.preventDefault(); blocked(wc, url, 'link'); }
  });

  wc.on('will-redirect', (event, arg, isInPlace, isMainFrame) => {
    const url = navUrl(event, arg);
    const main = event && typeof event.isMainFrame === 'boolean' ? event.isMainFrame : isMainFrame !== false;
    if (main && !isAllowed(url)) { event.preventDefault(); blocked(wc, url, 'redirect'); }
  });

  // single-page-app route changes that leave the allowed area
  wc.on('did-navigate-in-page', (event, url, isMainFrame) => {
    if (isMainFrame !== false && !isAllowed(url)) {
      blocked(wc, url, 'in-page');
      wc.loadURL(cfg.start_url);
    }
  });

  wc.setWindowOpenHandler(({ url }) => {
    if (isAllowed(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          fullscreen: true,
          autoHideMenuBar: true,
          backgroundColor: '#000000',
          webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
          }
        }
      };
    }
    blocked(wc, url, 'new window');
    return { action: 'deny' };
  });

  wc.on('did-create-window', child => {
    child.setMenuBarVisibility(false);
    guard(child.webContents);
  });

  wc.on('did-fail-load', (event, code, desc, url, isMainFrame) => {
    // -3 is "aborted", which happens on every blocked navigation
    if (isMainFrame && code !== -3) {
      log(`load failed (${code} ${desc}): ${url}`);
      if (isLayer) { closeOverlay(); return; }
      showAppPage(wc, 'xcloud-error.html', errorHtml());
      markSiteReady();
    }
  });

  wc.on('render-process-gone', (event, details) => {
    if (isLayer) { log('app screen crashed; closing it'); closeOverlay(); return; }
    log(`page crashed (${details && details.reason}); reloading`);
    openStart(wc);
  });

  // make sure keyboard input goes to the page after each load
  wc.on('did-finish-load', () => {
    if (isLayer) { try { wc.focus(); } catch (e) { /* ignore */ } return; }
    // keyboard input goes to the layer on top while it's up
    try { (overlay ? overlay.webContents : wc).focus(); } catch (e) { /* ignore */ }
    if (overlay) setPadsBlocked(true); // a new page: keep it from seeing the controller
    let host = '';
    try { host = new URL(wc.getURL()).hostname; } catch (e) { /* ignore */ }
    if (/xbox\.com$/i.test(host)) {
      markSiteReady();
      setTimeout(() => scanAgeGroup(wc), 8000);
      // the gamerpic the dashboard shows, for the profile screen
      setTimeout(() => grabGamerpic(wc), 3000);
      setTimeout(() => grabGamerpic(wc), 20000);
    }
    if (loadStarted && /xbox\.com$/i.test(new URL(wc.getURL()).hostname)) {
      log(`Xbox page loaded in ${((Date.now() - loadStarted) / 1000).toFixed(1)} s${GPU_AT_START ? ' (GPU acceleration on)' : ''}`);
      loadStarted = 0;
    }
  });
}

function makeMainWin() {
  const part = profiles.partition(curProfile);
  const win = new BrowserWindow({
    fullscreen: true,
    kiosk: true,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    // shown straight away (black), so EmulationStation's screen is covered
    // the moment the app starts instead of when the first page has drawn
    show: true,
    title: 'Xbox Cloud Gaming',
    webPreferences: Object.assign({
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }, part ? { partition: part } : {})
  });
  guard(win.webContents);
  if (!SETTINGS_MODE) watchAgeGroup(win.webContents);
  // every Xbox page gets the controller wrapper (standard layout for any
  // controller, and the gate the welcome popup uses) as soon as it starts
  // a restricted profile: games started from the dashboard are checked too
  win.webContents.on('did-navigate-in-page', (e, url) => pickHint(win.webContents, url));
  win.webContents.on('did-navigate', (e, url) => pickHint(win.webContents, url));
  win.webContents.on('did-navigate', (e, url) => checkAdsLaunch(win.webContents, url));
  win.webContents.on('did-navigate-in-page', (e, url) => checkAdsLaunch(win.webContents, url));
  win.webContents.on('dom-ready', () => {
    const wc = win.webContents;
    if (/^file:/.test(wc.getURL())) return;
    wc.executeJavaScript(`${PAD_GATE} window.__xcloudPadFix = ${cfg.controller_fix !== false};` +
      (overlay ? ' window.__xcloudPadsBlocked = true;' : '')).catch(() => { /* page between loads */ });
    if (onXboxPlay(wc.getURL())) wc.executeJavaScript(streamScript()).catch(() => { /* page between loads */ });
  });
  // the stream options' own notes go to the app's log
  // (one parameter: newer engines warn when the old message arguments are asked for;
  // older engines only have them, hence arguments[2])
  win.webContents.on('console-message', function (e) {
    const m = String(e && typeof e.message === 'string' ? e.message : arguments[2] || '');
    if (m.startsWith('[xcloud] ')) log(m.slice(9, 309));
  });
  win.focus();
  win.once('ready-to-show', () => { win.show(); win.focus(); win.webContents.focus(); });
  // the window closed some other way (Alt+F4): the app's own exit, so the
  // sign-in is saved (and Sign out when closing still applies)
  win.on('close', e => { if (!exiting && mainWin === win) { e.preventDefault(); fastExit('window closed (Alt+F4)'); } });
  win.on('closed', () => { if (mainWin === win) mainWin = null; });
  win.on('resize', fitOverlay);
  return win;
}

// switch the dashboard to another profile: its own sign-in and settings
function switchTo(p, why) {
  log(`profile: ${p ? (p.name || p.id) : 'none'} (${why})`);
  curProfile = p || null;
  if (p) profiles.setLast(p.id);
  // a child's or teen's profile: the adults' profiles are locked again
  if (isMinor(p)) unlockedId = '';
  Object.assign(cfg, loadConfig(p && p.id));
  identitySeen = '';
  setupSession(curSession());
  const old = mainWin;
  const win = makeMainWin();
  mainWin = win;
  applyUserAgent();
  if (overlay && old && old !== win) {
    try { old.contentView.removeChildView(overlay); } catch (e) { /* ignore */ }
    try { win.contentView.addChildView(overlay); fitOverlay(); } catch (e) { /* ignore */ }
  }
  siteReady = false;
  openStart(win.webContents);
  if (old && old !== win) { try { old.destroy(); } catch (e) { /* ignore */ } }
  try { overlay && overlay.webContents.focus(); } catch (e) { /* ignore */ }
}

function createWindow() {
  Menu.setApplicationMenu(null);
  mainWin = makeMainWin();
  if (SETTINGS_MODE) {
    // adult profiles are behind the PIN, here too
    if (needsPin(curProfile)) showPin(mainWin.webContents, { kind: 'settings', id: curProfile.id });
    else openSettings(mainWin.webContents, 'exit');
    return;
  }
  // Xbox starts loading straight away, behind the intro video. A game from
  // Batocera's list with more than one profile: only the dashboard until
  // someone picks who's playing, so the game never starts in the wrong account
  openStart(mainWin.webContents, GAME_ID && startPickerDue());
  if (GAME_ID) {
    // a game picked in Batocera's list: straight into it (no intro or welcome
    // screen); only "who's playing?" first, when there's more than one profile
    introDone = true;
    if (startPickerDue()) whenSiteReady(() => { if (!overlay) openOverlay('profiles'); }, 8000);
    else gameDone = true;
    return;
  }
  if (introDue() && fs.existsSync(INTRO_VIDEO)) {
    try { fs.writeFileSync(INTRO_LAST, today() + '\n'); } catch (e) { /* ignore */ }
    openOverlay('video');
  }
  else {
    introDone = true;
    if (welcomeShown()) whenSiteReady(() => openOverlay('welcome'), 8000);
    else if (startPickerDue()) whenSiteReady(() => { if (!overlay) openOverlay('profiles'); }, 8000);
  }
}

function preloadText() {
  const L = cfg.language;
  const keys = ['hintPad', 'pressAny', 'controller', 'connected', 'holdExit', 'padGone', 'padBack', 'kShift', 'kSpace', 'kDel', 'kDone', 'kHide', 'kText', 'homeBtn', 'homeHint'];
  const text = Object.fromEntries(keys.map(k => [k, i18n.t(L, k)]));
  // the Japanese / Korean letters, for the keyboard and messages on the Xbox page
  return { lang: L, text, fontCss: L === 'ja' || L === 'ko' ? i18n.FONT_CSS : '', fontStack: i18n.FONT_STACK };
}
// the volume the Xbox page plays at: 0 when muted in Settings
function appVolume() { return cfg.muted ? 0 : cfg.volume; }
ipcMain.on('xcloud-config', event => {
  event.returnValue = { exitHoldMs: Math.round(cfg.exit_hold_seconds * 1000), keyHighlight: cfg.keyboard_highlight, padFix: cfg.controller_fix !== false, volume: appVolume(), i18n: preloadText(),
    stream: (() => { try { return onXboxPlay(event.sender.getURL()) ? streamScript() : ''; } catch (e) { return ''; } })() };
});
// the controller's Menu button on the welcome screen
ipcMain.on('xcloud-settings', event => openSettings(event.sender, 'welcome'));
// Backspace on the dashboard: Settings, over the dashboard
ipcMain.on('xcloud-settings-dash', () => {
  if (overlay || SETTINGS_MODE) return;
  log('settings opened with Backspace on the dashboard');
  openOverlay('settings');
});
// F8 on a game's page: the game goes into Batocera's list (Games I pick),
// or comes out of it if it's there already
let f8Last = 0;
ipcMain.on('xcloud-pick-toggle', (event, href, also, docTitle) => {
  if (overlay || SETTINGS_MODE || Date.now() - f8Last < 800) return;
  f8Last = Date.now();
  let url = String(href || '');
  try { if (!url) url = mainWin.webContents.getURL(); } catch (e) { /* closed */ }
  if (cfg.game_list !== 'picked') { log(`F8: the game list is "${cfg.game_list}", not Games I pick`); mainToast('f8Mode', null, 6000); return; }
  const tries = [url].concat(Array.isArray(also) ? also.map(String) : []);
  let g = null;
  // the page's own title, as the game's name when nothing better is known ("Fortnite | Xbox Cloud Gaming")
  let pageTitle = String(docTitle || '').split(/\s+[|\u2013\u2014-]\s+/)[0].trim();
  if (/^(xbox|play|cloud gaming)/i.test(pageTitle) || pageTitle.length > 80) pageTitle = '';
  for (const t of tries) { g = gameFromUrl(t, pageTitle); if (g) break; }
  if (!g) { log(`F8: no game on this page (${tries.join(' | ')})`); mainToast('f8NoGame', null, 5000); return; }
  const list = pickedGames(), has = list.some(x => x.id === g.id);
  const next = has ? list.filter(x => x.id !== g.id) : list.concat([{ id: g.id, slug: g.slug.slice(0, 120) }]);
  try { fs.writeFileSync(PICKED_FILE, JSON.stringify(next, null, 2) + '\n'); } catch (e) { log(`could not save the picked games: ${e.message}`); mainToast('glFail'); return; }
  log(`F8: ${has ? 'removed' : 'added'} ${g.title} (${g.id}) ${has ? 'from' : 'to'} Batocera's list`);
  mainToast(has ? 'f8Removed' : 'f8Added', { game: g.title }, 4000);
  runGameList('picked', 'F8', false);
});
// the app's on-screen keyboard opened / closed on the dashboard (search):
// Xbox doesn't see the controller while it's typing
ipcMain.on('xcloud-osk', (event, open) => {
  try { event.sender.executeJavaScript(`${PAD_GATE} window.__xcloudOsk = ${open ? 'true' : "'release'"};`).catch(() => {}); } catch (e) { /* ignore */ }
});
// the on-screen number pad: real key presses, so code boxes (one digit each)
// take the digit and move on to the next box as they do with a keyboard
ipcMain.on('xcloud-key', (event, key) => {
  const wc = event.sender;
  if (!wc || typeof wc.sendInputEvent !== 'function') return;
  try {
    if (key === 'Backspace') {
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' });
    } else if (/^[0-9]$/.test(String(key))) {
      wc.sendInputEvent({ type: 'keyDown', keyCode: key });
      wc.sendInputEvent({ type: 'char', keyCode: key });
      wc.sendInputEvent({ type: 'keyUp', keyCode: key });
    }
  } catch (e) { log(`on-screen number pad: ${e.message}`); }
});
// the controller in use, as any page last saw it: the profile and PIN
// screens show its button names before they've seen it themselves
let lastPadId = '';
ipcMain.on('xcloud-pad-seen', (event, id) => { if (typeof id === 'string' && id.length < 300) lastPadId = id; });
ipcMain.on('xcloud-last-pad', event => { event.returnValue = lastPadId; });
// Menu held while on Xbox: show the welcome screen
ipcMain.on('xcloud-welcome', () => {
  if (overlay) return;
  log('welcome screen opened (Menu held)');
  openOverlay('welcome');
});
// the controller skipped the intro video
ipcMain.on('xcloud-intro-done', () => afterIntro());
// "Home" on any page that isn't the dashboard (Game Pass sign-up, account
// pages, sign-in): back to Xbox Cloud Gaming
ipcMain.on('xcloud-home', event => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && mainWin && win !== mainWin) {
    log('home: closing a pop-up window');
    try { win.close(); } catch (e) { /* ignore */ }
    try { mainWin.focus(); mainWin.webContents.focus(); } catch (e) { /* ignore */ }
    return;
  }
  log('home: back to the dashboard');
  if (mainWin) openStart(mainWin.webContents);
});
ipcMain.on('xcloud-quit', () => fastExit('controller, exit buttons held'));
ipcMain.on('xcloud-retry', event => { log('retry from the "can\'t connect" screen (controller)'); openStart(event.sender); });
ipcMain.on('xcloud-continue', (event, opts) => doContinue(event.sender, !!(opts && opts.never), 'controller'));
ipcMain.on('xcloud-log', (event, msg) => log(String(msg).slice(0, 300)));

app.on('second-instance', () => {
  if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); }
});

app.whenReady().then(() => {
  setTimeout(logGpu, 5000);
  log(`starting Xbox Cloud Gaming ${VERSION} (${batoceraVersion()}, Electron ${process.versions.electron}, Chrome ${process.versions.chrome})`);
  // the version used last time: an update (from Settings > Updates, or a reinstall) is noted once
  try {
    const lastFile = path.join(HOME, 'last-version');
    let before = '';
    try { before = fs.readFileSync(lastFile, 'utf8').trim(); } catch (e) { /* first run */ }
    if (before && before !== VERSION) log(`updates: the app was updated from v${before} to v${VERSION}`);
    if (before !== VERSION) fs.writeFileSync(lastFile, VERSION + '\n');
  } catch (e) { /* ignore */ }
  // keep the screen awake: playing with only a controller doesn't count as
  // activity for the screen blanking, which watches the keyboard and mouse
  try { powerSaveBlocker.start('prevent-display-sleep'); } catch (e) { /* ignore */ }
  const nudge = () => execFile('xset', ['s', 'reset'], { env: Object.assign({}, process.env, { DISPLAY: process.env.DISPLAY || ':0.0' }) }, () => {});
  nudge();
  setInterval(nudge, 50 * 1000).unref();
  // controller batteries: once a minute
  if (!SETTINGS_MODE) setInterval(padWatch, Number(process.env.XCLOUD_PADWATCH_MS) || 2000).unref();
  if (!SETTINGS_MODE) setInterval(checkPadBatteries, Number(process.env.XCLOUD_BATTERY_MS) || 60 * 1000).unref();
  // "Games I pick" was turned on from the F1 Settings shortcut: the how-to now
  if (cfg.game_list === 'picked' && fs.existsSync(PICK_TIP_DUE)) {
    try { fs.unlinkSync(PICK_TIP_DUE); } catch (e) { /* ignore */ }
    if (!SETTINGS_MODE && !GAME_ID) whenSiteReady(() => pickTipDue(), 8000);
  }
  // Batocera's game list: kept up to date (Game Pass changes every couple of weeks)
  if (cfg.game_list !== 'off') {
    const gs = glState();
    // (also when 3D game boxes are on but aren't drawn yet, e.g. turned on from the F1 Settings shortcut)
    const boxesDue = cfg.game_list_3d && gs.count > 0 && !gs.box3d;
    if (gs.mode !== cfg.game_list || !gs.synced || Date.now() / 1000 - gs.synced > 3 * 86400 || boxesDue) setTimeout(() => runGameList(cfg.game_list, boxesDue ? '3D game boxes' : 'refresh', false), boxesDue ? 8000 : 20000);
  }
  setupSession(curSession());
  applyUserAgent();
  if (profiles.active) log(`profiles: ${profiles.list.map(p => p.name || p.id).join(', ')}; starting with ${curProfile ? (curProfile.name || curProfile.id) : '-'}`);

  createWindow();
});

app.on('window-all-closed', () => app.quit());
