// Runs inside the Xbox page (main world). Added by main.js at dom-ready and
// by the preload as the page starts; it only installs itself once.
// Settings come from window.__xcloudStreamCfg and can change later through
// window.__xcloudStreamSet({ res, sharpen, stats, vib }):
//   res     'auto' | '1080p' | '1080p-hq' | '1440p'   the stream resolution asked for
//   sharpen 0 (off) .. 3 (high)             a sharpening filter on the stream
//   clarity true / false                    a little more contrast and colour
//   contrast, saturation, brightness 50..150 the picture (100 = unchanged)
//   stats   true / false                    the stream stats box
//   vib     0 .. 100                        controller vibration strength (%)
//   boost   100 .. 600                      the game's sound (%), vol the app's volume 0 .. 100
//   ipv6    true / false                    prefer the game server's IPv6 address
//   wait    true / false                    a game's page shows the wait for a server (waitT: its text)
//   mic     true / false                    turn the microphone on when a game starts
(function () {
  if (window.__xcloudStream) return;
  window.__xcloudStream = 1;
  var C = Object.assign({ res: 'auto', sharpen: 0, clarity: false, contrast: 100, saturation: 100, brightness: 100, stats: false, vib: 100, boost: 100, vol: 100, ipv6: false, wait: true, mic: false, waitT: {} }, window.__xcloudStreamCfg || {});
  function say(m) { try { console.info('[xcloud] ' + m); } catch (e) { /* ignore */ } }

  // ---------- resolution: the play request says which kind of device this is ----------
  // Xbox Cloud Gaming picks the stream size from it: Windows gets 1080p, a
  // Samsung TV (Tizen) 1080p at a higher bitrate. 1440p goes to a Windows PC
  // with a 1440p screen, for Game Pass Ultimate and the games that have it
  // (Xbox sends 1080p otherwise). There's no 4K.
  function osFor(res) { return res === '1080p-hq' ? 'tizen' : res === '1080p' || res === '1440p' ? 'windows' : ''; }
  function deviceInfo(os, res) {
    var big = res === '1440p';
    var m = navigator.userAgent.match(/Chrome\/([\d.]+)/);
    return {
      appInfo: { env: { clientAppId: location.host, clientAppType: 'browser', clientAppVersion: '26.1.97', clientSdkVersion: '10.3.7', httpEnvironment: 'prod', sdkInstallId: '' } },
      dev: { os: { name: os, ver: '22631.2715', platform: 'desktop' }, hw: { make: 'Microsoft', model: 'unknown', sdktype: 'web' },
        browser: { browserName: 'chrome', browserVersion: m ? m[1] : '130.0' }, displayInfo: { dimensions: { widthInPixels: big ? 2560 : 1920, heightInPixels: big ? 1440 : 1080 }, pixelDensity: { dpiX: 1, dpiY: 1 } } }
    };
  }
  var nativeFetch = window.fetch;
  function urlOf(input) { return typeof input === 'string' ? input : input && input.url ? input.url : String(input || ''); }
  async function playRequest(input, init) {
    var os = osFor(C.res);
    if (!os) return nativeFetch.call(window, input, init);
    try {
      var req = new Request(input, init);
      var body = JSON.parse(await req.clone().text() || '{}');
      body.settings = body.settings || {};
      body.settings.osName = os;
      var headers = new Headers(req.headers);
      headers.set('x-ms-device-info', JSON.stringify(deviceInfo(os, C.res)));
      say('stream: asking for ' + C.res + ' (as ' + os + ')');
      return nativeFetch.call(window, new Request(req, { body: JSON.stringify(body), headers: headers }));
    } catch (e) {
      say('stream: could not change the resolution (' + e.message + ')');
      return nativeFetch.call(window, input, init);
    }
  }
  // the stream's settings: vibration on (or off, at 0%)
  async function configRequest(input, init) {
    var res = await nativeFetch.call(window, input, init);
    try {
      var text = await res.clone().text();
      if (!text) return res;
      var obj = JSON.parse(text), over = JSON.parse(obj.clientStreamingConfigOverrides || '{}') || {};
      over.inputConfiguration = over.inputConfiguration || {};
      over.inputConfiguration.enableVibration = C.vib > 0;
      obj.clientStreamingConfigOverrides = JSON.stringify(over);
      return new Response(JSON.stringify(obj), { status: res.status, statusText: res.statusText, headers: res.headers });
    } catch (e) { return res; }
  }
  // ---------- prefer IPv6: the server's IPv6 address first ----------
  // The ICE answer lists the addresses the game server can be reached on; the
  // browser tries them by priority. IPv6 ones are put first (when there are any).
  var CAND = /^a=candidate:(\S+) (\d+) (udp|tcp) (\d+) (\S+) (\d+) (.*)$/i;
  async function iceRequest(input, init) {
    var res = await nativeFetch.call(window, input, init);
    if (!C.ipv6) return res;
    try {
      var obj = await res.clone().json();
      if (!obj || typeof obj.exchangeResponse !== 'string') return res;
      var list = JSON.parse(obj.exchangeResponse);
      if (!Array.isArray(list)) return res;
      var cands = list.filter(function (c) { return c && CAND.test(c.candidate || ''); });
      var six = cands.filter(function (c) { return CAND.exec(c.candidate)[5].indexOf(':') >= 0; });
      if (!six.length) { say('prefer IPv6: the server offered no IPv6 address'); return res; }
      var ordered = six.concat(cands.filter(function (c) { return six.indexOf(c) < 0; }));
      var prio = 2130706431;
      ordered.forEach(function (c, i) {
        var m = CAND.exec(c.candidate);
        c.candidate = 'a=candidate:' + (i + 1) + ' ' + m[2] + ' ' + m[3] + ' ' + (prio - i * 1000) + ' ' + m[5] + ' ' + m[6] + ' ' + m[7];
      });
      obj.exchangeResponse = JSON.stringify(ordered.concat(list.filter(function (c) { return cands.indexOf(c) < 0; })));
      say('prefer IPv6: ' + six.length + ' IPv6 of ' + cands.length + ' server addresses put first');
      return new Response(JSON.stringify(obj), { status: res.status, statusText: res.statusText, headers: res.headers });
    } catch (e) { say('prefer IPv6: left as it is (' + e.message + ')'); return res; }
  }

  // ---------- the wait for a server, on a game's page ----------
  // Xbox Cloud Gaming's own requests carry the sign-in token and go to the
  // region's server; the games list maps each game (Store ID) to its title ID.
  // With those, /v1/waittime/<title ID> gives the expected wait.
  var gs = { token: '', base: '', titles: {} };
  function noteGssv(url, input, init) {
    try {
      var h = new Headers((init && init.headers) || (input && input.headers) || {});
      var auth = h.get('Authorization');
      if (auth && /^Bearer /i.test(auth)) gs.token = auth;
      var u = new URL(url);
      if (!/^xgpuweb\./i.test(u.hostname) && /gssv-play-prod/i.test(u.hostname)) gs.base = u.origin;
    } catch (e) { /* ignore */ }
  }
  function noteLogin(text) {
    try {
      var j = JSON.parse(text);
      if (j.gsToken) gs.token = 'Bearer ' + j.gsToken;
      var regs = (j.offeringSettings && j.offeringSettings.regions) || [];
      var def = regs.filter(function (r) { return r.isDefault; })[0] || regs[0];
      if (def && def.baseUri) gs.base = String(def.baseUri).replace(/\/$/, '');
    } catch (e) { /* not that */ }
  }
  function noteTitles(text) {
    try {
      var j = JSON.parse(text), n = 0;
      (j.results || []).forEach(function (t) {
        var pid = t && t.details && t.details.productId;
        if (pid && t.titleId) { gs.titles[String(pid).toUpperCase()] = t.titleId; n++; }
      });
      if (n) say('wait time: ' + Object.keys(gs.titles).length + ' games known');
    } catch (e) { /* not that */ }
  }
  var pill = null, waitFor = '', waitTimer = null;
  function showPill(text) {
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'xcloud-wait';
      pill.setAttribute('style', 'position:fixed;top:84px;right:24px;z-index:2147483000;pointer-events:none;' +
        'font:600 18px/1.2 "Segoe UI",system-ui,sans-serif;color:#fff;background:rgba(16,16,16,.88);border:2px solid #107c10;' +
        'padding:8px 16px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.5)');
      document.documentElement.appendChild(pill);
    }
    pill.textContent = '\u23f1 ' + text;
    pill.style.display = 'block';
  }
  function hidePill() { if (pill) pill.style.display = 'none'; }
  function fmtWait(sec) {
    var T = C.waitT || {};
    if (sec < 60) return (T.label || 'Wait time: {t}').replace('{t}', T.none || 'no wait');
    return (T.label || 'Wait time: {t}').replace('{t}', (T.min || 'about {n} min').replace('{n}', Math.round(sec / 60)));
  }
  async function askWait(pid) {
    var tid = gs.titles[pid];
    if (!tid || !gs.token || !gs.base) { say('wait time: not known yet for ' + pid + (tid ? '' : ' (no title ID)') + (gs.token ? '' : ' (no sign-in)') + (gs.base ? '' : ' (no server)')); return; }
    try {
      var r = await nativeFetch.call(window, gs.base + '/v1/waittime/' + tid, { headers: { Authorization: gs.token } });
      if (!r.ok) { say('wait time: ' + r.status + ' for ' + tid); return; }
      var j = await r.json();
      var sec = Number(j.estimatedTotalWaitTimeInSeconds);
      if (!Number.isFinite(sec) || waitFor !== pid) return;
      showPill(fmtWait(sec));
    } catch (e) { say('wait time: ' + e.message); }
  }
  setInterval(function () {
    var m = /\/launch\/[^/]+\/([0-9A-Z]{12})/i.exec(location.pathname);
    var pid = m && C.wait && !document.querySelector('#game-stream video') ? m[1].toUpperCase() : '';
    if (pid === waitFor) return;
    waitFor = pid; hidePill(); clearInterval(waitTimer);
    if (!pid) return;
    askWait(pid);
    waitTimer = setInterval(function () { if (waitFor === pid) askWait(pid); }, 60000);
  }, 1000);

  // ---------- the site's game lists (Game Pass catalog), named in the log ----------
  // e.g. "catalog list: 29a81209-... | All games | 573 games": how the app's own
  // game list options find Microsoft's lists (free to play, play with ads...)
  var listsSeen = {};
  function noteList(id, title, n) {
    id = String(id || '').toLowerCase();
    if (!/^[0-9a-f-]{36}$/.test(id) || listsSeen[id]) return;
    listsSeen[id] = 1;
    say('catalog list: ' + id + ' | ' + (title || '?') + ' | ' + (n == null ? '?' : n) + ' games');
  }
  function noteListResponse(url, data) {
    var m = /[?&]id=([0-9a-f-]{36})/i.exec(url || '');
    if (!m) return;
    var title = '', n = null;
    if (Array.isArray(data)) {
      title = data[0] && (data[0].title || data[0].siglId === m[1] && data[0].title) || '';
      n = data.filter(function (x) { return x && x.id; }).length;
    }
    noteList(m[1], title, n);
  }
  function scanState() {
    try {
      var st = window.__PRELOADED_STATE__, sigls = st && st.xcloud && st.xcloud.sigls;
      if (!sigls) return;
      Object.keys(sigls).forEach(function (id) {
        var v = sigls[id] || {}, d = v.data || {};
        noteList(id, d.title || v.title || d.name || '', Array.isArray(d.products) ? d.products.length : null);
      });
    } catch (e) { /* not there */ }
  }
  [0, 4000, 15000, 40000].forEach(function (ms) { setTimeout(scanState, ms); });
  // the Library page (Library > My games): its address, and where its games
  // come from, in the log, for the coming "Games I own" choice. The games are
  // buttons (no links), so the data the page loads is noted: each response
  // holding Microsoft Store IDs, with how many and the first few.
  var libSeen = {}, libData = 0;
  function onLibrary() { return /library/i.test(location.pathname + location.search + location.hash); }
  setInterval(function () {
    try {
      if (!onLibrary() || libSeen[location.href]) return;
      libSeen[location.href] = 1;
      var tiles = document.querySelectorAll('main button img, section button img').length;
      say('library page: ' + location.href + ' | ' + tiles + ' game pictures on screen');
      setTimeout(libraryProbe, 2500);
    } catch (e) { /* page between states */ }
  }, 3000);
  // where the Library's games are: IDs in the page's own data (its preloaded
  // state) and in the tiles' React properties, for the log
  function idsIn(v, depth, seen, out) {
    if (out.length > 60 || depth > 7 || v == null) return;
    if (typeof v === 'string') { if (/^[0-9A-Z]{12}$/.test(v) && /[0-9]/.test(v) && out.indexOf(v) < 0) out.push(v); return; }
    if (typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    var keys = Array.isArray(v) ? v.slice(0, 400) : Object.keys(v).slice(0, 200);
    for (var i = 0; i < keys.length; i++) {
      try { idsIn(Array.isArray(v) ? keys[i] : v[keys[i]], depth + 1, seen, out); } catch (e) { /* getter */ }
    }
  }
  function libraryProbe() {
    try {
      var st = window.__PRELOADED_STATE__ || {};
      Object.keys(st).forEach(function (k) {
        var ids = []; idsIn(st[k], 0, new WeakSet(), ids);
        if (ids.length) say('library state: ' + k + ' | ' + ids.length + ' IDs: ' + ids.slice(0, 10).join(' '));
      });
      var tiles = Array.prototype.slice.call(document.querySelectorAll('button')).filter(function (b) { return b.querySelector('img'); }).slice(0, 4);
      tiles.forEach(function (b, n) {
        var found = [], label = (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 40);
        Object.keys(b).forEach(function (k) {
          if (!/^__react(Props|Fiber)/.test(k)) return;
          var f = b[k], hops = 0;
          if (/Props/.test(k)) { idsIn(f, 0, new WeakSet(), found); return; }
          while (f && hops < 12) { idsIn(f.memoizedProps, 0, new WeakSet(), found); f = f.return; hops++; }
        });
        var attrs = Array.prototype.map.call(b.attributes, function (a) { return a.name + '=' + String(a.value).slice(0, 30); }).join(' ');
        say('library tile ' + n + ': "' + label + '" | IDs ' + (found.slice(0, 6).join(' ') || 'none') + ' | ' + attrs);
      });
    } catch (e) { say('library probe failed: ' + e.message); }
  }
  function noteLibraryData(url, text) {
    if (!onLibrary() || libData >= 12 || !text) return;
    var ids = [], re = /"([0-9A-Z]{12})"/g, m;
    while ((m = re.exec(text)) && ids.length < 400) if (/[0-9]/.test(m[1]) && ids.indexOf(m[1]) < 0) ids.push(m[1]);
    if (!ids.length) return;
    libData++;
    say('library data: ' + String(url).split('?')[0].slice(0, 160) + ' | ' + ids.length + ' IDs: ' + ids.slice(0, 8).join(' '));
  }
  var xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var lu = String(url);
    if (onLibrary()) this.addEventListener('load', function () { try { noteLibraryData(lu, this.responseText); } catch (e) { /* not text */ } });
    if (/catalog\.gamepass\.com\/sigls/i.test(String(url))) {
      var u = String(url);
      this.addEventListener('load', function () { try { noteListResponse(u, JSON.parse(this.responseText)); } catch (e) { /* not JSON */ } });
    }
    return xhrOpen.apply(this, arguments);
  };

  window.fetch = function (input, init) {
    var url = urlOf(input), method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (onLibrary() && libData < 12 && !/catalog\.gamepass\.com\/sigls/i.test(url)) {
      return nativeFetch.apply(this, arguments).then(function (res) {
        try { res.clone().text().then(function (t) { noteLibraryData(url, t); }).catch(function () {}); } catch (e) { /* ignore */ }
        return res;
      });
    }
    if (/catalog\.gamepass\.com\/sigls/i.test(url)) {
      return nativeFetch.apply(this, arguments).then(function (res) {
        try { res.clone().json().then(function (d) { noteListResponse(url, d); }).catch(function () {}); } catch (e) { /* ignore */ }
        return res;
      });
    }
    if (/gssv-play-prod\.xboxlive\.com/i.test(url)) {
      noteGssv(url, input, init);
      if (/\/v2\/login\/user/i.test(url) || /\/v2\/titles/i.test(url)) {
        return nativeFetch.apply(this, arguments).then(function (res) {
          try { res.clone().text().then(function (t) { if (/login/i.test(url)) noteLogin(t); else noteTitles(t); }).catch(function () {}); } catch (e) { /* ignore */ }
          return res;
        });
      }
    }
    if (/\/v5\/sessions\/cloud\/[^/]+\/ice(\?|$)/.test(url) && method === 'GET') return iceRequest(input, init);
    if (/\/v5\/sessions\/cloud\/play(\?|$)/.test(url) && method === 'POST') return playRequest(input, init);
    if (/\/v5\/sessions\/cloud\/[^/]+\/configuration(\?|$)/.test(url) && method === 'GET') return configRequest(input, init);
    return nativeFetch.apply(this, arguments);
  };

  // ---------- vibration strength ----------
  var HA = window.GamepadHapticActuator && window.GamepadHapticActuator.prototype;
  if (HA && HA.playEffect) {
    var playEffect = HA.playEffect;
    HA.playEffect = function (type, p) {
      var k = Math.max(0, Math.min(100, Number(C.vib))) / 100;
      if (k <= 0) return Promise.resolve('complete');
      if (k < 1 && p) {
        p = Object.assign({}, p);
        ['strongMagnitude', 'weakMagnitude', 'leftTrigger', 'rightTrigger'].forEach(function (n) { if (typeof p[n] === 'number') p[n] *= k; });
      }
      return playEffect.call(this, type, p);
    };
  }
  if (HA && HA.pulse) {
    var pulse = HA.pulse;
    HA.pulse = function (value, duration) {
      var k = Math.max(0, Math.min(100, Number(C.vib))) / 100;
      if (k <= 0) return Promise.resolve(true);
      return pulse.call(this, value * k, duration);
    };
  }

  // ---------- sharpening (an unsharp filter) and clarity boost (contrast and colour) ----------
  var KERNEL = [0, 7, 6.25, 5.5];   // Low, Medium, High (smaller = stronger)
  var NS = 'http://www.w3.org/2000/svg', css = null, matrix = null;
  function sharpen() {
    var lvl = Math.max(0, Math.min(3, Number(C.sharpen) || 0));
    if (!document.documentElement) return;
    if (!css) {
      var svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
      svg.setAttribute('aria-hidden', 'true');
      var defs = document.createElementNS(NS, 'defs'), f = document.createElementNS(NS, 'filter');
      f.setAttribute('id', 'xcloud-sharpen');
      matrix = document.createElementNS(NS, 'feConvolveMatrix');
      matrix.setAttribute('order', '3');
      f.appendChild(matrix); defs.appendChild(f); svg.appendChild(defs);
      css = document.createElement('style');
      css.id = 'xcloud-sharpen-css';
      document.documentElement.appendChild(svg);
      document.documentElement.appendChild(css);
    }
    var filters = [];
    if (lvl) {
      matrix.setAttribute('kernelMatrix', '0 -1 0 -1 ' + KERNEL[lvl] + ' -1 0 -1 0');
      filters.push('url(#xcloud-sharpen)');
    }
    ['contrast', 'saturate', 'brightness'].forEach(function (f, i) {
      var v = Number(C[['contrast', 'saturation', 'brightness'][i]]);
      if (v && v !== 100) filters.push(f + '(' + Math.min(150, Math.max(50, v)) / 100 + ')');
    });
    if (C.clarity) filters.push('contrast(1.08) saturate(1.12) brightness(1.02)');
    css.textContent = filters.length ? '#game-stream video { filter: ' + filters.join(' ') + ' !important; }' : '';
  }

  // ---------- volume boost: the game's sound through a gain of up to 6x ----------
  // Only once it's above 100%: the stream's sound goes through Web Audio
  // (the page's own player is muted so it isn't heard twice).
  var audioTracks = [], actx = null, gain = null, routed = [];
  function gainValue() { return Math.max(0, Math.min(1, (C.vol == null ? 100 : C.vol) / 100)) * Math.max(1, Math.min(6, (C.boost || 100) / 100)); }
  function boostAudio() {
    audioTracks = audioTracks.filter(function (t) { return t.readyState !== 'ended'; });
    routed = routed.filter(function (t) { return t.readyState !== 'ended'; });
    if (!actx && (C.boost || 100) <= 100) return;
    try {
      if (!actx) {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        gain = actx.createGain(); gain.connect(actx.destination);
      }
      gain.gain.value = gainValue();
      audioTracks.forEach(function (t) {
        if (routed.indexOf(t) >= 0) return;
        actx.createMediaStreamSource(new MediaStream([t])).connect(gain);
        routed.push(t);
        say('volume boost: the game\'s sound at ' + C.boost + '%');
      });
      if (actx.state === 'suspended') actx.resume().catch(function () {});
      muteOwnPlayers();
    } catch (e) { say('volume boost not available: ' + e.message); }
  }
  // the page's players of a boosted track are muted (and given back if Web Audio stops)
  function muteOwnPlayers() {
    var live = actx && actx.state === 'running' && routed.length;
    document.querySelectorAll('video,audio').forEach(function (el) {
      var src = el.srcObject, has = false;
      try { has = !!src && src.getAudioTracks && src.getAudioTracks().some(function (t) { return routed.indexOf(t) >= 0; }); } catch (e) { has = false; }
      if (has && live) { if (!el.muted) { el.muted = true; el.dataset.xcloudBoost = '1'; } }
      else if (el.dataset.xcloudBoost === '1') { el.muted = false; delete el.dataset.xcloudBoost; }
    });
  }
  setInterval(function () { if (actx) { if (actx.state === 'suspended') actx.resume().catch(function () {}); muteOwnPlayers(); } }, 1000);

  // ---------- microphone on game launch ----------
  // Once a game is streaming, the stream's own microphone switch is pressed
  // (once per game). Its name is in the site's language.
  var MIC = /mi[ck]ro|マイク|마이크/i;
  var MIC_ON = /unmute|turn on|enable|activ|einschalt|aktivier|allumer|attiva|inschakel|slå på|sla pa|käynnist|włącz|zapn|bekapcs|ligar|オン|켜기/i;
  var micDone = false, micSince = 0;
  function micLabel(b) { return ((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '') + ' ' + (b.textContent || '')).replace(/\s+/g, ' ').trim(); }
  setInterval(function () {
    var streaming = !!document.querySelector('#game-stream video');
    if (!streaming) { micDone = false; micSince = 0; return; }
    if (!C.mic || micDone) return;
    if (!micSince) micSince = Date.now();
    if (Date.now() - micSince < 4000) return;
    var btns = Array.prototype.filter.call(document.querySelectorAll('button,[role=button],[role=switch],[role=menuitemcheckbox]'), function (b) { return MIC.test(micLabel(b)); });
    if (!btns.length) { if (Date.now() - micSince > 60000) { micDone = true; say('microphone on launch: no microphone switch found on the stream'); } return; }
    micDone = true;
    var on = btns.filter(function (b) { return MIC_ON.test(micLabel(b)) || b.getAttribute('aria-pressed') === 'false' || b.getAttribute('aria-checked') === 'false'; })[0];
    say('microphone on launch: switches seen: ' + btns.map(function (b) { return '"' + micLabel(b).slice(0, 40) + '"'; }).join(', '));
    if (on) { on.click(); say('microphone on launch: turned on ("' + micLabel(on).slice(0, 40) + '")'); }
    else say('microphone on launch: it already looks on');
  }, 1000);

  // ---------- stream stats ----------
  var PCs = [];
  var NativePC = window.RTCPeerConnection;
  if (NativePC) {
    var PC = function (a, b) {
      var pc = new NativePC(a, b); PCs.push(pc);
      try { pc.addEventListener('track', function (e) { if (e.track && e.track.kind === 'audio') { audioTracks.push(e.track); boostAudio(); } }); } catch (e) { /* ignore */ }
      return pc;
    };
    PC.prototype = NativePC.prototype;
    Object.setPrototypeOf(PC, NativePC);
    window.RTCPeerConnection = PC;
    if (window.webkitRTCPeerConnection) window.webkitRTCPeerConnection = PC;
  }
  var box = null, timer = null, last = null;
  function hideStats() { if (box) box.style.display = 'none'; last = null; }
  function showStats(text) {
    if (!box) {
      box = document.createElement('div');
      box.id = 'xcloud-stats';
      box.setAttribute('style', 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483000;pointer-events:none;' +
        'font:600 14px/1.3 ui-monospace,Consolas,monospace;color:#fff;background:rgba(0,0,0,.6);padding:5px 12px;border-radius:8px;' +
        'white-space:nowrap;text-shadow:0 1px 2px #000;letter-spacing:.2px');
      document.documentElement.appendChild(box);
    }
    box.textContent = text;
    box.style.display = 'block';
  }
  function n1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  async function poll() {
    PCs = PCs.filter(function (pc) { return pc.connectionState !== 'closed'; });
    var live = PCs.filter(function (pc) { return pc.connectionState === 'connected'; });
    if (!C.stats || !live.length || !document.querySelector('#game-stream video')) { hideStats(); return; }
    var video = null, pair = null;
    for (var i = 0; i < live.length && !video; i++) {
      var rep;
      try { rep = await live[i].getStats(); } catch (e) { continue; }
      rep.forEach(function (s) {
        if (s.type === 'inbound-rtp' && (s.kind === 'video' || s.mediaType === 'video')) video = s;
        if (s.type === 'candidate-pair' && s.state === 'succeeded' && (s.nominated || !pair)) pair = s;
      });
    }
    if (!video) { hideStats(); return; }
    var parts = [];
    if (video.frameWidth) parts.push(video.frameWidth + '×' + video.frameHeight);
    if (video.framesPerSecond != null) parts.push(Math.round(video.framesPerSecond) + ' fps');
    if (pair && pair.currentRoundTripTime != null) parts.push('ping ' + Math.round(pair.currentRoundTripTime * 1000) + ' ms');
    if (last && video.timestamp > last.timestamp) {
      var mbps = (video.bytesReceived - last.bytesReceived) * 8 / ((video.timestamp - last.timestamp) / 1000) / 1e6;
      parts.push(n1(Math.max(0, mbps)) + ' Mb/s');
      var frames = video.framesDecoded - last.framesDecoded;
      if (frames > 0 && video.totalDecodeTime != null) parts.push('decode ' + n1((video.totalDecodeTime - last.totalDecodeTime) * 1000 / frames) + ' ms');
    }
    var got = video.packetsReceived || 0, lost = Math.max(0, video.packetsLost || 0);
    if (got + lost > 0) parts.push('loss ' + n1(lost * 100 / (got + lost)) + '%');
    last = video;
    showStats(parts.join('  ·  '));
  }
  function stats() {
    if (C.stats && !timer) timer = setInterval(function () { poll().catch(function () { /* stream between states */ }); }, 1000);
    if (!C.stats && timer) { clearInterval(timer); timer = null; hideStats(); }
  }

  window.__xcloudStreamSet = function (c) {
    Object.assign(C, c || {});
    try { sharpen(); } catch (e) { /* no page yet */ }
    stats();
    try { if (gain) gain.gain.value = gainValue(); boostAudio(); } catch (e) { /* ignore */ }
    if (!C.wait) { waitFor = ''; hidePill(); }
  };
  if (document.documentElement) window.__xcloudStreamSet();
  else document.addEventListener('DOMContentLoaded', function () { window.__xcloudStreamSet(); });
  say('stream options: resolution ' + C.res + ', sharpening ' + C.sharpen + ', clarity ' + (C.clarity ? 'on' : 'off') + ', picture ' + C.contrast + '/' + C.saturation + '/' + C.brightness + '%' + ', stats ' + (C.stats ? 'on' : 'off') + ', vibration ' + C.vib + '%' + ', volume boost ' + C.boost + '%' + ', prefer IPv6 ' + (C.ipv6 ? 'on' : 'off') + ', microphone on launch ' + (C.mic ? 'on' : 'off') + ', wait time ' + (C.wait ? 'on' : 'off'));
})();
