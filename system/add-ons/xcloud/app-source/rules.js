'use strict';
// Which pages the app may open.
// A rule is "host" or "host/path". A host may start with "*." to include
// its subdomains, and "*" in a path matches one path segment (like en-us).
// A path rule also covers everything below it: "www.xbox.com/*/play"
// allows /en-us/play and /en-us/play/games/... but not /en-us/games.

function escapeRe(s) {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function compileRule(pattern) {
  let p = String(pattern || '').trim().toLowerCase().replace(/^https?:\/\//, '');
  if (!p || p.startsWith('#')) return null;
  const slash = p.indexOf('/');
  const host = slash < 0 ? p : p.slice(0, slash);
  const path = slash < 0 ? '' : p.slice(slash).replace(/\/+$/, '');
  const hostRe = host.startsWith('*.')
    ? new RegExp('^([a-z0-9-]+\\.)*' + escapeRe(host.slice(2)) + '$')
    : new RegExp('^' + escapeRe(host) + '$');
  const pathRe = path
    ? new RegExp('^' + escapeRe(path).replace(/\*/g, '[^/]+') + '(/|$)')
    : null;
  return { src: p, hostRe, pathRe };
}

function compile(list) {
  return (Array.isArray(list) ? list : []).map(compileRule).filter(Boolean);
}

function isAllowed(url, rules) {
  let u;
  try { u = new URL(url); } catch (e) { return false; }
  if (u.protocol === 'about:' && u.href === 'about:blank') return true;
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  const path = (u.pathname || '/').toLowerCase();
  return rules.some(r => r.hostRe.test(host) && (!r.pathRe || r.pathRe.test(path)));
}

// for permissions (like fullscreen), which only give an origin, not a page
function hostAllowed(url, rules) {
  let u;
  try { u = new URL(url); } catch (e) { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return rules.some(r => r.hostRe.test(host));
}

module.exports = { compile, compileRule, isAllowed, hostAllowed };
