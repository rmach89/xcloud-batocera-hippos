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
(function () {
  if (window.__xcloudStream) return;
  window.__xcloudStream = 1;
  var C = Object.assign({ res: 'auto', sharpen: 0, clarity: false, contrast: 100, saturation: 100, brightness: 100, stats: false, vib: 100 }, window.__xcloudStreamCfg || {});
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
  var xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (/catalog\.gamepass\.com\/sigls/i.test(String(url))) {
      var u = String(url);
      this.addEventListener('load', function () { try { noteListResponse(u, JSON.parse(this.responseText)); } catch (e) { /* not JSON */ } });
    }
    return xhrOpen.apply(this, arguments);
  };

  window.fetch = function (input, init) {
    var url = urlOf(input), method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (/catalog\.gamepass\.com\/sigls/i.test(url)) {
      return nativeFetch.apply(this, arguments).then(function (res) {
        try { res.clone().json().then(function (d) { noteListResponse(url, d); }).catch(function () {}); } catch (e) { /* ignore */ }
        return res;
      });
    }
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

  // ---------- stream stats ----------
  var PCs = [];
  var NativePC = window.RTCPeerConnection;
  if (NativePC) {
    var PC = function (a, b) { var pc = new NativePC(a, b); PCs.push(pc); return pc; };
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
  };
  if (document.documentElement) window.__xcloudStreamSet();
  else document.addEventListener('DOMContentLoaded', function () { window.__xcloudStreamSet(); });
  say('stream options: resolution ' + C.res + ', sharpening ' + C.sharpen + ', clarity ' + (C.clarity ? 'on' : 'off') + ', picture ' + C.contrast + '/' + C.saturation + '/' + C.brightness + '%' + ', stats ' + (C.stats ? 'on' : 'off') + ', vibration ' + C.vib + '%');
})();
