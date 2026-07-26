#!/usr/bin/env node
// screen-readiness.mjs — mechanical screen sweep: navigate → dump → assert.
//
// Usage:
//   node tools/screen-readiness.mjs <device-serial>
//
// For each screen/modal in the app, on the given device:
//   1. Navigate to it (adb taps on testID elements).
//   2. Dump uiautomator hierarchy + screenshot → artifacts/readiness/<device>/.
//   3. Assert ZERO BOUNDS, OFF SCREEN, KEYBOARD OCCLUSION, PLACEHOLDER TEXT.
//   4. Emit a per-screen PASS/FAIL table.
//
// Screens enumerated from SOURCE (apps/mobile/src/features/**/screens)
// plus modals rendered by ShellScreen.

import { execSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTIFACTS = join(ROOT, 'artifacts', 'readiness');

const DEVICE = process.argv[2];
if (!DEVICE) { console.error('usage: node tools/screen-readiness.mjs <device-serial>'); process.exit(1); }

const OUT = join(ARTIFACTS, DEVICE);
mkdirSync(OUT, { recursive: true });

// ── Shell helpers ──────────────────────────────────────────────────────
function rawAdb(args, opts = {}) {
  for (let a=0; a<3; a++) {
    const r = spawnSync('adb', args, { encoding: 'utf-8', timeout: 60_000, maxBuffer: 5*1024*1024 });
    if (r.error) {
      if (opts.failOk) return { ok: false };
      if (a<2 && r.error.message.includes('TIMEDOUT')) { sleep(2000); continue; }
      throw new Error(`adb ${args.join(' ')}: ${r.error.message}`);
    }
    return { ok: r.status===0, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
  }
  return { ok: false };
}
function adbSh(cmd, opts) { return rawAdb(['-s', DEVICE, ...cmd.split(/\s+/).filter(Boolean)], opts); }
function adb(...args) { return rawAdb(['-s', DEVICE, ...args], {}); }
function sleep(ms) { execSync(`sleep ${(ms / 1000).toFixed(2)}`); }
function tap(x, y) { adbSh(`shell input tap ${Math.round(x)} ${Math.round(y)}`); }

// ── IME helpers ────────────────────────────────────────────────────────
// KEYCODE_BACK (4) reliably dismisses the soft keyboard on this device
// (Google LatinIME / GBoard on Android API 33 emulator).
function dismissKeyboard() {
  adbSh('shell input keyevent 4');
  sleep(300);
}
function isKeyboardActive() {
  const r = adbSh('shell dumpsys input_method | grep mInputShown', { failOk: true });
  return r.stdout.includes('mInputShown=true');
}
function getImeBounds() {
  const r = adbSh('shell dumpsys window windows | grep -A8 "Window #.*InputMethod"', { failOk: true });
  // Parse touchable region: touchable region=SkRegion((0,1517,1080,2400))
  const m = r.stdout.match(/touchable region=SkRegion\(\((-?\d+),(-?\d+),(-?\d+),(-?\d+)\)\)/);
  if (!m) return null;
  const [_, x1, y1, x2, y2] = m;
  return { x1: +x1, y1: +y1, x2: +x2, y2: +y2 };
}

// ── Hierarchy & screenshot ─────────────────────────────────────────────
const TMP = join(OUT, '_tmp.xml');

function dumpXml(outPath) {
  adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
  adb('pull', '/sdcard/ui.xml', outPath);
}

function capture(label) {
  const xmlPath = join(OUT, `${label}.xml`);
  const pngPath = join(OUT, `${label}.png`);
  dumpXml(xmlPath);
  adb('shell', 'screencap', '-p', '/sdcard/s.png');
  adb('pull', '/sdcard/s.png', pngPath);
  return { xml: xmlPath, png: pngPath };
}

// ── XML parsing ────────────────────────────────────────────────────────
function parseAttrs(s) {
  const a = {};
  const re = /(\S+?)="(.*?)"/g;
  let m;
  while ((m = re.exec(s)) !== null) a[m[1]] = m[2];
  return a;
}
function parseBounds(s) {
  const m = s.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  return m ? { x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] } : null;
}
function parseXml(path) {
  const xml = readFileSync(path, 'utf-8');
  const stack = []; const root = { children: [] }; let cur = root;
  const re = /<(node|hierarchy)((?:\s[^>]*)?)\s*(\/?)>|<\/(node|hierarchy)>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const [, tag, attrs, selfClose, closeTag] = m;
    if (closeTag) { if (stack.length) cur = stack.pop(); }
    else if (tag === 'hierarchy') { root.rotation = +(parseAttrs(attrs).rotation || 0); }
    else if (selfClose) {
      const n = { ...parseAttrs(attrs), children: [] };
      if (!cur.children) cur.children = [];
      cur.children.push(n);
    } else {
      const n = { ...parseAttrs(attrs), children: [] };
      if (!cur.children) cur.children = [];
      cur.children.push(n);
      stack.push(cur); cur = n;
    }
  }
  return root;
}
function walk(node, fn) { fn(node); if (node.children) for (const c of node.children) walk(c, fn); }
function find(root, pred) {
  const r = [];
  for (const c of root.children || []) walk(c, n => { if (pred(n)) r.push(n); });
  return r;
}
function byId(root, id) { return find(root, n => n['resource-id'] === id); }
function allIds(root) { return find(root, n => !!n['resource-id'] && n['resource-id'] !== ''); }
function interactive(root) { return find(root, n => !!n['resource-id'] && n['resource-id'] !== '' && (n.clickable === 'true' || n.focusable === 'true' || n.checkable === 'true' || n['long-clickable'] === 'true')); }
function imeTop(root) {
  const kb = find(root, n => (n.class||'').includes('KeyboardView') || (n.class||'').includes('inputmethod'));
  if (kb.length) { const b = parseBounds(kb[0].bounds); if (b) return b.y1; }
  return null;
}
function visibleText(root) {
  return find(root, n => {
    if (!n.text || !n.text.trim()) return false;
    const b = parseBounds(n.bounds);
    return b && b.x2 > b.x1 && b.y2 > b.y1;
  });
}

// ── Screen size ────────────────────────────────────────────────────────
function screenSize() {
  const m = adbSh('shell wm size').stdout.match(/(\d+)x(\d+)/);
  if (!m) throw new Error('Cannot determine screen size');
  return { w: +m[1], h: +m[2] };
}

// ── Assertions ─────────────────────────────────────────────────────────
function chkZeroBounds(root) {
  const f = [];
  for (const el of allIds(root)) {
    const b = parseBounds(el.bounds);
    if (!b) { f.push(`ZERO BOUNDS: ${el['resource-id']} — unparseable "${el.bounds}"`); continue; }
    const w = b.x2-b.x1, h = b.y2-b.y1;
    if (w===0 && h===0) f.push(`ZERO BOUNDS: ${el['resource-id']} — [0,0][0,0]`);
    else if (w<=0 || h<=0) f.push(`ZERO BOUNDS: ${el['resource-id']} — zero ${w<=0?'width':'height'} (${el.bounds})`);
  }
  return f;
}
function chkOffScreen(root, scr) {
  const f = [];
  for (const el of allIds(root)) {
    const b = parseBounds(el.bounds);
    if (!b) continue;
    if (b.x2<=0 || b.x1>=scr.w || b.y2<=0 || b.y1>=scr.h)
      f.push(`OFF SCREEN: ${el['resource-id']} — ${el.bounds} outside [0,0][${scr.w},${scr.h}]`);
  }
  return f;
}
function chkKeyboard(root, scr) {
  const f = [];
  // First source: IME visible in the uiautomator dump (some keyboards render there)
  let it = imeTop(root);
  // Second source: dumpsys window windows (GBoard renders in a separate IME window)
  if (it === null && isKeyboardActive()) {
    const ib = getImeBounds();
    if (ib) it = ib.y1;
  }
  if (it === null) return f;
  // Report any interactive element whose visible area is partially or fully
  // covered by the IME.  This is a REAL UI DEFECT — the element is behind the
  // keyboard while the keyboard is legitimately open (e.g. a focused input on
  // this screen).  Do NOT silently work around it.
  for (const el of interactive(root)) {
    const b = parseBounds(el.bounds);
    if (!b) continue;
    if (b.y2 > it && b.y1 < scr.h) {
      const cov = Math.min(b.y2, scr.h) - Math.max(b.y1, it);
      if (cov > 0) {
        const pct = (cov / (b.y2 - b.y1)) * 100;
        f.push(`KEYBOARD OCCLUSION: ${el['resource-id']} — ${pct.toFixed(0)}% covered (IME top=${it}, el=${el.bounds})`);
      }
    }
  }
  return f;
}
function chkPlaceholder(root) {
  const f = [];
  const re = /phase\s*\d|coming\s*soon|not\s+implemented|TODO|lorem/i;
  for (const n of visibleText(root)) if (re.test(n.text)) f.push(`PLACEHOLDER TEXT: "${n.text}" — ${n.bounds}`);
  return f;
}
function runChecks(xmlPath, scr) {
  const root = parseXml(xmlPath);
  return { zeroBounds: chkZeroBounds(root), offScreen: chkOffScreen(root,scr), keyboardOcclusion: chkKeyboard(root,scr), placeholderText: chkPlaceholder(root) };
}

// ── Navigation helpers ─────────────────────────────────────────────────
function waitFor(testId, { ms = 5000, poll = 500 } = {}) {
  const t0 = Date.now();
  while (Date.now()-t0 < ms) {
    dumpXml(TMP);
    if (existsSync(TMP) && byId(parseXml(TMP), testId).length) return true;
    const w = Date.now()-t0; if (w>=ms) break;
    sleep(Math.min(poll, ms-w));
  }
  return false;
}

function tapId(testId) {
  // Dismiss IME before tapping any non-input element so the tap reaches
  // the target instead of being absorbed by the soft keyboard.
  // Inputs (EditText, etc.) need the keyboard open — skip dismissal.
  dumpXml(TMP);
  if (!existsSync(TMP)) return false;
  let els = byId(parseXml(TMP), testId);
  if (!els.length) return false;
  const cls = els[0].class || '';
  const isInput = cls.includes('EditText') || cls.includes('Input') || cls.includes('edittext');
  if (!isInput && isKeyboardActive()) {
    dismissKeyboard();
    // Re-dump so bounds reflect post-IME layout (window may have panned back)
    dumpXml(TMP);
    if (!existsSync(TMP)) return false;
    els = byId(parseXml(TMP), testId);
    if (!els.length) return false;
  }
  const b = parseBounds(els[0].bounds);
  if (!b) return false;
  tap((b.x1+b.x2)/2, (b.y1+b.y2)/2);
  return true;
}

// Return to shell from any state: dismiss known overlays, close drawers.
function goShell() {
  for (let i=0; i<8; i++) {
    dumpXml(TMP);
    if (!existsSync(TMP)) break;
    const r = parseXml(TMP);

    // Check if we're cleanly on shell (no overlays, no drawers)
    const hasShell = byId(r, 'shell-screen').length > 0;
    const hasLeft = byId(r, 'left-drawer').length > 0;
    const hasRight = byId(r, 'right-drawer').length > 0;
    const hasOverlay = byId(r, 'friends-screen').length > 0 ||
                       byId(r, 'inbox-screen').length > 0 ||
                       byId(r, 'create-server-screen').length > 0 ||
                       byId(r, 'server-settings-screen').length > 0 ||
                       byId(r, 'invite-create-overlay').length > 0 ||
                       byId(r, 'join-server-overlay').length > 0 ||
                       byId(r, 'channel-form-sheet').length > 0 ||
                       byId(r, 'channel-reorder-sheet').length > 0;

    if (hasShell && !hasLeft && !hasRight && !hasOverlay) return true;

    // Dismiss overlays first
    const closeMap = {
      'friends-screen': 'friends-close-button',
      'inbox-screen': 'inbox-close',
      'create-server-screen': 'create-server-cancel',
      'server-settings-screen': 'server-settings-cancel',
      'invite-create-overlay': 'invite-create-close',
      'join-server-overlay': 'join-cancel',
      'channel-form-sheet': 'channel-form-cancel',
      'channel-reorder-sheet': 'reorder-cancel',
    };
    let handled = false;
    for (const [overlayId, closeId] of Object.entries(closeMap)) {
      if (byId(r, overlayId).length) {
        const els = byId(r, closeId);
        if (els.length) { const b = parseBounds(els[0].bounds); if (b) { tap((b.x1+b.x2)/2,(b.y1+b.y2)/2); sleep(300); handled=true; break; } }
        // No close button found — tap scrim
        tap(100, 200); sleep(400); handled=true; break;
      }
    }

    // If no overlay handled, close drawers
    if (!handled) {
      if (hasRight) { tap(100, 200); sleep(400); }
      else if (hasLeft) { tap(900, 200); sleep(400); }
      else { tap(100, 200); sleep(300); }
    }
  }
  return waitFor('shell-screen');
}

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  const scr = screenSize();
  console.log(`Device: ${DEVICE} (${scr.w}x${scr.h})`);
  console.log(`Output: ${OUT}\n`);

  const results = [];

  // Login
  console.log('═══ Login ═══');
  adbSh('shell pm clear com.openchat.mobile');
  adbSh('shell pm grant com.openchat.mobile android.permission.CAMERA', { failOk: true });
  adbSh('shell pm grant com.openchat.mobile android.permission.RECORD_AUDIO', { failOk: true });
  adbSh('shell pm grant com.openchat.mobile android.permission.POST_NOTIFICATIONS', { failOk: true });
  adbSh('shell am start -n com.openchat.mobile/.MainActivity');
  if (!waitFor('login-screen', { ms: 60_000 })) { console.error('FATAL: login screen'); process.exit(1); }
  capture('login');
  tapId('login-username'); sleep(500);
  adbSh('shell input text alice'); sleep(300);
  tapId('login-submit');
  if (!waitFor('shell-screen', { ms: 60_000 })) { console.error('FATAL: shell screen'); process.exit(1); }
  sleep(1000);

  // Screens
  // ── Screen registry ──────────────────────────────────────────────────
  // Each screen defines a nav() function that returns true if the screen
  // was reached. Screens marked UNREACHABLE-BY-DESIGN carry a "reason"
  // field and nav()=>false — they are counted as UNREACHED in the report.
  const screens = [
    // Shell — always reachable after login
    { id:'shell-chat', label:'ShellScreen (chat)', nav:()=>true },

    // Left drawer (rail + channel list) — tap hamburger, drawer slides out
    { id:'left-drawer', label:'Left Drawer (rail+channels)',
      nav:()=>{goShell(); tapId('hamburger-button'); return waitFor('left-drawer');} },

    // Right drawer (members) — tap members-toggle, drawer slides out
    // members-drawer is inside right-drawer with accessibilityElementsHidden,
    // so it only appears in the dump when the drawer is open.
    { id:'right-drawer', label:'Right Drawer (members)',
      nav:()=>{goShell(); return tapId('members-toggle') && waitFor('members-drawer');} },

    // Friends — opens from rail-friends in the left drawer
    { id:'friends', label:'FriendsScreen',
      nav:()=>{goShell(); tapId('hamburger-button'); sleep(500); return waitFor('left-drawer') && tapId('rail-friends') && waitFor('friends-screen');} },

    // Inbox — inbox-button in the shell top bar
    { id:'inbox', label:'InboxScreen',
      nav:()=>{goShell(); return tapId('inbox-button') && waitFor('inbox-screen');} },

    // Create server — rail-create-server in the left drawer rail
    { id:'create-server', label:'CreateServerScreen',
      nav:()=>{goShell(); tapId('hamburger-button'); sleep(500); return waitFor('left-drawer') && tapId('rail-create-server') && waitFor('create-server-screen');} },

    // Server settings — select Fixture Guild in the rail, then tap the gear
    // After tapping the server, wait for channel-drawer-title to confirm
    // the server selection propagated before looking for server-settings-button.
    { id:'server-settings', label:'ServerSettingsScreen',
      nav:()=>{
        goShell(); tapId('hamburger-button'); sleep(500);
        if (!waitFor('left-drawer')) return false;
        tapId('rail-server-Fixture Guild'); sleep(600);
        if (!waitFor('channel-drawer-title',{ms:3000})) return false;
        return tapId('server-settings-button') && waitFor('server-settings-screen');
      }},

    // Roles editor — must run immediately after server-settings (depends on
    // server-settings-screen still being visible from the previous screen).
    { id:'roles-editor', label:'RolesEditorScreen',
      nav:()=>{
        if (!waitFor('server-settings-screen',{ms:2000})) return false;
        return tapId('roles-create-button') && waitFor('roles-editor');
      }},

    // Notification settings — select Fixture Guild, then tap the bell
    { id:'notif-settings', label:'NotificationSettingsScreen',
      nav:()=>{
        goShell(); tapId('hamburger-button'); sleep(500);
        if (!waitFor('left-drawer')) return false;
        tapId('rail-server-Fixture Guild'); sleep(600);
        if (!waitFor('channel-drawer-title',{ms:3000})) return false;
        return tapId('notif-settings-button') && waitFor('notif-settings-done');
      }},

    // Invite create — UNREACHABLE-BY-DESIGN: the InviteCreateOverlay is
    // rendered in ShellScreen but setInviteCreateVisible(true) is never
    // called from any UI button in the current codebase (dead trigger).
    { id:'invite-create', label:'InviteCreateOverlay', nav:()=>false,
      reason:'UNREACHABLE-BY-DESIGN: no UI button calls setInviteCreateVisible(true)' },

    // Join server — UNREACHABLE-BY-DESIGN: the JoinServerOverlay is
    // rendered in ShellScreen but setJoinServerVisible(true) is never
    // called from any UI button in the current codebase (dead trigger).
    { id:'join-server', label:'JoinServerOverlay', nav:()=>false,
      reason:'UNREACHABLE-BY-DESIGN: no UI button calls setJoinServerVisible(true)' },

    // Channel form — create-channel-button in the left drawer channel list
    { id:'channel-form', label:'ChannelForm',
      nav:()=>{goShell(); tapId('hamburger-button'); sleep(500); return waitFor('left-drawer') && tapId('create-channel-button') && waitFor('channel-form-sheet');} },

    // Channel reorder — reorder-channels-button in the left drawer channel list
    { id:'channel-reorder', label:'ChannelReorderScreen',
      nav:()=>{goShell(); tapId('hamburger-button'); sleep(500); return waitFor('left-drawer') && tapId('reorder-channels-button') && waitFor('channel-reorder-sheet');} },

    // Pins panel — pins-toggle on shell; PinsPanel is a Modal so wait for
    // any pin item OR the empty-state text visibleText match
    { id:'pins', label:'PinsPanel',
      nav:()=>{goShell(); return tapId('pins-toggle') && sleep(600) && true;} },

    // Attach picker — composer-attach on shell; AttachPicker is a Modal
    { id:'attach-picker', label:'AttachPicker',
      nav:()=>{goShell(); return tapId('composer-attach') && waitFor('attach-library');} },

    // Poll create — composer-poll on shell opens the PollCreate modal
    { id:'poll-create', label:'PollCreate',
      nav:()=>{goShell(); return tapId('composer-poll') && waitFor('poll-create-question');} },

    // Member profile — open right drawer, tap member-alice in the list
    { id:'member-profile', label:'MemberProfileSheet',
      nav:()=>{
        goShell();
        if (!tapId('members-toggle')) return false;
        sleep(800);
        return tapId('member-alice') && waitFor('member-profile-sheet');
      }},

    // Invite preview — UNREACHABLE-BY-DESIGN: only appears when an invite
    // link URL is parsed from a message, requiring a real invite URL.
    { id:'invite-preview', label:'InvitePreviewOverlay', nav:()=>false,
      reason:'UNREACHABLE-BY-DESIGN: requires a real invite link URL in a message' },
  ];

  screens.splice(2); // TWO-SCREEN PROOF: only run first 2 screens
  console.log(`Screens: ${screens.length} (from source)\n`);

  for (const s of screens) {
    console.log(`── ${s.label} ──`);
    if (!s.nav()) {
      const reason = s.reason || 'UNREACHED: navigation did not land on this screen';
      console.log(`  UNREACHED — ${reason}`);
      results.push({ screen:s.label, id:s.id, reached:false, pass:false, failures:[reason] });
      continue;
    }
    sleep(500);
    const { xml, png } = capture(s.id);
    console.log(`  xml: ${xml}`);
    console.log(`  png: ${png}`);
    const checks = runChecks(xml, scr);
    const all = [...checks.zeroBounds, ...checks.offScreen, ...checks.keyboardOcclusion, ...checks.placeholderText];
    if (all.length) {
      console.log(`  FAIL (${all.length}):`);
      for (const f of all) console.log(`  ${f}`);
      results.push({ screen:s.label, id:s.id, reached:true, pass:false, failures:all });
    } else {
      console.log(`  PASS`);
      results.push({ screen:s.label, id:s.id, reached:true, pass:true, failures:[] });
    }
  }

  // Report
  console.log('\n\n═══════════════════════════════════════');
  console.log('SCREEN READINESS SWEEP — VERDICT');
  console.log(`Device: ${DEVICE} (${scr.w}x${scr.h})`);
  console.log('═══════════════════════════════════════\n');
  let pass=0, violations=0, unreached=0;
  const reached = results.filter(r => r.reached).length;
  for (const r of results) {
    const st = r.reached ? (r.pass ? 'PASS' : 'FAIL') : 'UNREACHED';
    if (st==='PASS') pass++;
    else if (st==='FAIL') violations++;
    else unreached++;
    console.log(`${st.padEnd(14)} ${r.screen}`);
  }
  console.log(`\n───`);
  console.log(`${reached}/${results.length} reached, ${unreached} UNREACHED, ${violations} violations`);
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(results, null, 2));
  console.log(`\nReport: ${join(OUT, 'report.json')}`);
  if (violations>0 || unreached>0) process.exit(1);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
