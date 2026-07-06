#!/usr/bin/env node
/*
 * bujo-sync — canonical Supabase <-> local journal.md bridge for a local agent.
 *
 * Supabase is the single source of truth for the Bullet Journal (one Markdown
 * row per user in public.journal, gated by RLS). This CLI lets a local agent
 * always read the LATEST and safely write changes back:
 *
 *   node bujo-sync.js pull            # Supabase -> journalPath (freshest to-dos)
 *   node bujo-sync.js push            # journalPath -> Supabase (after edits)
 *   node bujo-sync.js whoami          # verify auth
 *   node bujo-sync.js setup --email you@example.com --file /path/to/journal.md
 *
 * Auth: your Supabase login. Password is read from the macOS Keychain, never a
 * file. Store it once (see README). Endpoint + publishable key come from the
 * app's ../config.js. Session tokens are cached in .session.json (git-ignored).
 *
 * No npm dependencies — Node 18+ (global fetch) only.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const CONFIG_PATH   = path.join(HERE, 'config.json');        // { email, journalPath }
const SESSION_PATH  = path.join(HERE, '.session.json');      // cached tokens
const LASTSYNC_PATH = path.join(HERE, '.last-sync.json');    // { updated_at } from last pull
const KEYCHAIN_SERVICE = 'bujo-supabase';

// ---------- small helpers ----------
const readJSON  = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const writeJSON = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2));
const die = (msg) => { console.error('✗ ' + msg); process.exit(1); };

function loadSupabaseCfg() {
  // The app's config.js is browser code: `window.JOURNAL_CONFIG = {...}`.
  const p = path.join(HERE, '..', 'config.js');
  let src;
  try { src = fs.readFileSync(p, 'utf8'); } catch { die('cannot read ../config.js — is the repo intact?'); }
  const window = {};
  try { new Function('window', src)(window); } catch (e) { die('failed to parse ../config.js: ' + e.message); }
  const s = window.JOURNAL_CONFIG && window.JOURNAL_CONFIG.supabase;
  if (!s || !s.url || !s.key) die('../config.js has no supabase { url, key } — cloud not configured.');
  return { url: s.url.replace(/\/$/, ''), key: s.key };
}

function loadAgentCfg() {
  const c = readJSON(CONFIG_PATH);
  if (!c || !c.email || !c.journalPath) {
    die('missing ' + CONFIG_PATH + ' — run `node bujo-sync.js setup --email <you> --file <journal.md>` first.');
  }
  return c;
}

function keychainPassword(email) {
  try {
    return execFileSync('security',
      ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', email, '-w'],
      { encoding: 'utf8' }).replace(/\n$/, '');
  } catch {
    die(`no Keychain password for ${email}. Store it once with:\n` +
        `   security add-generic-password -s ${KEYCHAIN_SERVICE} -a "${email}" -w`);
  }
}

function decodeUid(accessToken) {
  try {
    let b = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    b += '='.repeat((4 - b.length % 4) % 4);
    return JSON.parse(Buffer.from(b, 'base64').toString('utf8')).sub;
  } catch { return null; }
}
const jwtExp = (t) => { try { let b = t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'); b+='='.repeat((4-b.length%4)%4); return JSON.parse(Buffer.from(b,'base64').toString('utf8')).exp*1000; } catch { return 0; } };

// ---------- auth ----------
async function getSession(sb, agent) {
  let sess = readJSON(SESSION_PATH);
  // Reuse a still-valid access token (60s safety margin).
  if (sess && sess.access_token && jwtExp(sess.access_token) - 60000 > timeNow()) return sess;
  // Try refresh_token before falling back to a password login.
  if (sess && sess.refresh_token) {
    const r = await fetch(sb.url + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: { apikey: sb.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: sess.refresh_token }),
    });
    if (r.ok) { sess = await r.json(); writeJSON(SESSION_PATH, sess); return sess; }
  }
  // Password grant.
  const password = keychainPassword(agent.email);
  const r = await fetch(sb.url + '/auth/v1/token?grant_type=password', {
    method: 'POST', headers: { apikey: sb.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: agent.email, password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) die('login failed: ' + (data.error_description || data.msg || data.message || ('HTTP ' + r.status)));
  writeJSON(SESSION_PATH, data);
  try { fs.chmodSync(SESSION_PATH, 0o600); } catch {}
  return data;
}
// Date.now() is fine in a normal Node CLI (unlike the workflow sandbox).
function timeNow() { return Date.now(); }

function apiHeaders(sb, sess) {
  return { apikey: sb.key, Authorization: 'Bearer ' + sess.access_token, 'Content-Type': 'application/json' };
}

// ---------- remote row ----------
async function remoteRow(sb, sess) {
  const r = await fetch(sb.url + '/rest/v1/journal?select=content,updated_at', { headers: apiHeaders(sb, sess) });
  if (!r.ok) die('read failed: HTTP ' + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 200));
  const rows = await r.json();
  return (rows && rows[0]) ? rows[0] : { content: '', updated_at: null };
}

// ---------- commands ----------
async function cmdPull() {
  const sb = loadSupabaseCfg(), agent = loadAgentCfg();
  const sess = await getSession(sb, agent);
  const row = await remoteRow(sb, sess);
  fs.mkdirSync(path.dirname(agent.journalPath), { recursive: true });
  fs.writeFileSync(agent.journalPath, row.content || '');
  writeJSON(LASTSYNC_PATH, { updated_at: row.updated_at });
  const n = (row.content.match(/^\s*-\s+\[ \]/gm) || []).length;
  console.log(`✓ pulled latest → ${agent.journalPath}`);
  console.log(`  ${row.content.length} bytes · ${n} open task(s) · remote updated_at ${row.updated_at || '(none yet)'}`);
}

async function cmdPush(argv) {
  const force = argv.includes('--force');
  const sb = loadSupabaseCfg(), agent = loadAgentCfg();
  let md;
  try { md = fs.readFileSync(agent.journalPath, 'utf8'); } catch { die('cannot read ' + agent.journalPath + ' — pull first.'); }
  // Guard against pushing something that isn't a journal (would wipe the row).
  if (!/^#\s*Journal/m.test(md) && !/^##\s+Daily/m.test(md)) {
    die('refusing to push: file does not look like a journal (no "# Journal"/"## Daily"). Use --force to override.');
  }
  const sess = await getSession(sb, agent);
  // Clobber-safety: if the remote changed since our last pull, someone edited
  // elsewhere (e.g. your phone). Refuse unless --force so we don't overwrite it.
  const row = await remoteRow(sb, sess);
  const marker = readJSON(LASTSYNC_PATH);
  if (!force && marker && row.updated_at && marker.updated_at !== row.updated_at) {
    die('remote changed since last pull (updated_at ' + row.updated_at + ').\n' +
        '   Someone edited elsewhere. Run `pull` and re-apply your changes, or push --force to overwrite.');
  }
  const uid = decodeUid(sess.access_token);
  if (!uid) die('could not derive user id from token.');
  const body = JSON.stringify([{ user_id: uid, content: md, updated_at: new Date().toISOString() }]);
  const r = await fetch(sb.url + '/rest/v1/journal?on_conflict=user_id', {
    method: 'POST',
    headers: { ...apiHeaders(sb, sess), Prefer: 'resolution=merge-duplicates,return=representation' },
    body,
  });
  if (!r.ok) die('push failed: HTTP ' + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 200));
  const rows = await r.json().catch(() => null);
  const newUpdated = rows && rows[0] ? rows[0].updated_at : new Date().toISOString();
  writeJSON(LASTSYNC_PATH, { updated_at: newUpdated });
  console.log(`✓ pushed ${md.length} bytes → Supabase (updated_at ${newUpdated})`);
  console.log('  The app will pick it up on its next sync/poll.');
}

async function cmdWhoami() {
  const sb = loadSupabaseCfg(), agent = loadAgentCfg();
  const sess = await getSession(sb, agent);
  console.log(`✓ authenticated as ${agent.email}`);
  console.log(`  uid ${decodeUid(sess.access_token)} · project ${sb.url}`);
}

function cmdSetup(argv) {
  const get = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
  const email = get('--email');
  const file  = get('--file');
  if (!email || !file) die('usage: setup --email <you@example.com> --file </abs/path/journal.md>');
  writeJSON(CONFIG_PATH, { email, journalPath: path.resolve(file) });
  console.log(`✓ wrote ${CONFIG_PATH}`);
  console.log(`\nNext, store your Supabase password in the Keychain (one time):`);
  console.log(`   security add-generic-password -s ${KEYCHAIN_SERVICE} -a "${email}" -w`);
  console.log(`\nThen test:  node bujo-sync.js whoami`);
}

// ---------- dispatch ----------
(async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    switch (cmd) {
      case 'pull':   await cmdPull(); break;
      case 'push':   await cmdPush(rest); break;
      case 'whoami': await cmdWhoami(); break;
      case 'setup':  cmdSetup(rest); break;
      default:
        console.log('bujo-sync — Supabase <-> local journal.md\n');
        console.log('  node bujo-sync.js pull     fetch latest to-dos from Supabase');
        console.log('  node bujo-sync.js push      write local journal.md back to Supabase (--force to override clobber guard)');
        console.log('  node bujo-sync.js whoami    verify auth');
        console.log('  node bujo-sync.js setup --email <you> --file <journal.md>');
        process.exit(cmd ? 1 : 0);
    }
  } catch (e) { die(e.message); }
})();
