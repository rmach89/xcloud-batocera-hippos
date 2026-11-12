'use strict';
// Profiles: each person who plays on this machine keeps their own Xbox
// sign-in (their own browser storage) and their own settings.
//
//   profiles.json            the list and who played last
//   profile-settings/<id>.json  each profile's own Settings choices
//   pin                      the PIN for adult profiles (salted SHA-256)
//   reset-pin                create this file (or delete "pin") to clear a
//                            forgotten PIN; the app removes it on start
//
// The first profile uses the browser storage the app always used, so whoever
// is already signed in stays signed in.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// the Settings choices that belong to each profile (everything else in
// config.json is shared by the whole machine)
const PROFILE_KEYS = ['start_url', 'language', 'volume', 'muted', 'keyboard_highlight', 'play_intro',
  'intro_volume', 'intro_muted', 'stream_as_windows', 'stream_resolution', 'video_sharpen', 'clarity_boost', 'video_contrast', 'video_saturation', 'video_brightness', 'stream_stats', 'vibration', 'sign_out_on_exit'];
const COLORS = ['#107c10', '#0e6aa8', '#a4262c', '#8764b8', '#ca5010', '#038387', '#c239b3', '#498205'];

function create(home, log) {
  const FILE = path.join(home, 'profiles.json');
  const SETTINGS_DIR = path.join(home, 'profile-settings');
  const PIN_FILE = path.join(home, 'pin');
  const RESET_FILE = path.join(home, 'reset-pin');
  let data = null;

  function load() {
    try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { data = null; }
    if (data && !Array.isArray(data.profiles)) data = null;
    if (data) data.profiles = data.profiles.filter(p => p && typeof p.id === 'string');
    return data;
  }
  function save() {
    if (!data) return;
    try { fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n'); } catch (e) { log(`could not save profiles: ${e.message}`); }
  }
  load();

  // a forgotten PIN: "reset-pin" created (or "pin" deleted) with Batocera's file manager
  if (fs.existsSync(RESET_FILE)) {
    try { fs.unlinkSync(PIN_FILE); } catch (e) { /* not there */ }
    try { fs.unlinkSync(RESET_FILE); } catch (e) { /* ignore */ }
    log('PIN cleared (reset-pin file found)');
  }

  const api = {
    get active() { return !!(data && data.profiles.length); },
    get list() { return data ? data.profiles : []; },
    get count() { return data ? data.profiles.length : 0; },
    get declined() { return !!(data && data.declined); },
    set declined(v) { if (data) { data.declined = !!v; save(); } },
    byId(id) { return api.list.find(p => p.id === id) || null; },
    byXuid(xuid) { return xuid ? api.list.find(p => p.xuid === xuid) || null : null; },
    last() { return data ? (api.byId(data.last) || data.profiles[0]) : null; },
    setLast(id) { if (data && api.byId(id)) { data.last = id; save(); } },
    // the browser storage ("partition") a profile uses; '' = the app's original one
    partition(p) { return p && p.part ? `persist:${p.part}` : ''; },
    newId() {
      let n = 1;
      while (api.byId('p' + n)) n++;
      return 'p' + n;
    },
    // the very first profile: whoever is signed in now, in the original storage
    start(person) {
      data = { last: 'p1', declined: false, profiles: [] };
      const p = { id: 'p1', name: person.name || 'Player 1', xuid: person.xuid || '', age: person.age || '', part: '', color: COLORS[0] };
      data.profiles.push(p);
      save();
      return p;
    },
    // a new, empty profile with its own storage (signs in when first opened)
    add(person) {
      if (!data) api.start({});
      const id = api.newId();
      const p = { id, name: (person && person.name) || '', xuid: (person && person.xuid) || '', age: (person && person.age) || '',
        part: `xcloud-${id}-${Date.now().toString(36)}`, color: COLORS[(data.profiles.length) % COLORS.length] };
      data.profiles.push(p);
      save();
      return p;
    },
    update(p, fields) { Object.assign(p, fields); save(); },
    remove(id) {
      if (!data) return null;
      const p = api.byId(id);
      if (!p) return null;
      data.profiles = data.profiles.filter(x => x.id !== id);
      try { fs.unlinkSync(path.join(SETTINGS_DIR, id + '.json')); } catch (e) { /* none */ }
      if (data.last === id) data.last = data.profiles[0] ? data.profiles[0].id : '';
      if (!data.profiles.length) { try { fs.unlinkSync(FILE); } catch (e) { /* ignore */ } data = null; }
      else save();
      return p;
    },
    // ---- each profile's own settings ----
    settings(id) {
      try { return JSON.parse(fs.readFileSync(path.join(SETTINGS_DIR, id + '.json'), 'utf8')); } catch (e) { return {}; }
    },
    saveSettings(id, obj) {
      const out = {};
      for (const k of PROFILE_KEYS) if (obj[k] !== undefined) out[k] = obj[k];
      try {
        fs.mkdirSync(SETTINGS_DIR, { recursive: true });
        fs.writeFileSync(path.join(SETTINGS_DIR, id + '.json'), JSON.stringify(out, null, 2) + '\n');
      } catch (e) { log(`could not save the profile's settings: ${e.message}`); }
    },
    // ---- PIN ----
    get hasPin() { return fs.existsSync(PIN_FILE); },
    setPin(code) {
      const salt = crypto.randomBytes(8).toString('hex');
      const hash = crypto.createHash('sha256').update(salt + ':' + code).digest('hex');
      try { fs.writeFileSync(PIN_FILE, `${salt}:${hash}\n`); return true; } catch (e) { log(`could not save the PIN: ${e.message}`); return false; }
    },
    checkPin(code) {
      try {
        const [salt, hash] = fs.readFileSync(PIN_FILE, 'utf8').trim().split(':');
        return crypto.createHash('sha256').update(salt + ':' + String(code)).digest('hex') === hash;
      } catch (e) { return true; } // no PIN (or it was removed): nothing to check
    },
    PROFILE_KEYS
  };
  return api;
}

module.exports = { create, PROFILE_KEYS };
