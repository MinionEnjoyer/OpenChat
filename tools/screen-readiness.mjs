#!/usr/bin/env node
// screen-readiness.mjs — Maestro-driven screen sweep: navigate → dump → assert.
//
// Uses Maestro flows for navigation (reusing existing selectors and idioms),
// then captures uiautomator hierarchy + screenshot via adb and runs the same
// four mechanical assertions as screen-readiness-legacy.mjs:
//   1. ZERO BOUNDS — any element with 0-area bounds (collapsed/invisible)
//   2. OFF SCREEN — any element entirely outside the viewport
//   3. KEYBOARD OCCLUSION — interactive elements covered by the IME
//   4. PLACEHOLDER TEXT — "coming soon", "TODO", "phase N", etc.
//
// Usage:
//   node tools/screen-readiness.mjs <device-serial>
//
// Output: artifacts/readiness/<device>/ — XML dumps, PNG screenshots, report.json

import { execSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTIFACTS = join(ROOT, 'artifacts', 'readiness');
const FLOWS = join(ROOT, 'apps', 'mobile', 'e2e', 'flows');
const SCREEN_FLOWS = join(FLOWS, 'screen-readiness');

const DEVICE = process.argv[2];
if (!DEVICE) { console.error('usage: node tools/screen-readiness.mjs <device-serial>'); process.exit(1); }

const OUT = join(ARTIFACTS, DEVICE);
mkdirSync(OUT, { recursive: true });

// ── Environment ──────────────────────────────────────────────────────────
const MAESTRO = join(process.env.HOME, '.maestro', 'bin', 'maestro');
const ADB = join(process.env.HOME, 'Library', 'Android', 'sdk', 'platform-tools', 'adb');

// ── Helpers ──────────────────────────────────────────────────────────────
function sleep(ms) { execSync(`sleep ${(ms / 1000).toFixed(2)}`); }

function adb(...args) {
  const r = spawnSync(ADB, ['-s', DEVICE, ...args], { encoding: 'utf-8', timeout: 60_000, maxBuffer: 5 * 1024 * 1024 });
  if (r.error) throw new Error(`adb ${args.join(' ')}: ${r.error.message}`);
  return { ok: r.status === 0, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
}

function adbSh(cmd) {
  const r = spawnSync(ADB, ['-s', DEVICE, 'shell', ...cmd.split(/\s+/).filter(Boolean)], { encoding: 'utf-8', timeout: 60_000, maxBuffer: 5 * 1024 * 1024 });
  if (r.error) return { ok: false, stdout: '', stderr: r.error.message };
  return { ok: r.status === 0, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
}

function maestro(args, opts = {}) {
  const r = spawnSync(MAESTRO, [...args, '--device', DEVICE], {
    encoding: 'utf-8',
    timeout: opts.timeout || 120_000,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, JAVA_HOME: '/opt/homebrew/opt/openjdk@17', PATH: `/opt/homebrew/opt/openjdk@17/bin:${process.env.PATH}` },
  });
  return { ok: r.status === 0, stdout: r.stdout, stderr: r.stderr, code: r.status };
}

function screenSize() {
  const m = adbSh('wm size').stdout.match(/(\d+)x(\d+)/);
  if (!m) throw new Error('Cannot determine screen size');
  return { w: +m[1], h: +m[2] };
}

// ── Hierarchy & screenshot ───────────────────────────────────────────────
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

// ── XML parsing ──────────────────────────────────────────────────────────
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
function allIds(root) { return find(root, n => !!n['resource-id'] && n['resource-id'] !== ''); }
function interactive(root) { return find(root, n => !!n['resource-id'] && n['resource-id'] !== '' && (n.clickable === 'true' || n.focusable === 'true' || n.checkable === 'true' || n['long-clickable'] === 'true')); }
function imeTop(root) {
  const kb = find(root, n => (n.class || '').includes('KeyboardView') || (n.class || '').includes('inputmethod'));
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
function isKeyboardActive() {
  const r = adbSh('dumpsys input_method | grep mInputShown');
  return r.stdout.includes('mInputShown=true');
}
function getImeBounds() {
  const r = adbSh('dumpsys window windows | grep -A8 "Window #.*InputMethod"');
  const m = r.stdout.match(/touchable region=SkRegion\(\((-?\d+),(-?\d+),(-?\d+),(-?\d+)\)\)/);
  if (!m) return null;
  return { x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] };
}

// ── Assertions ───────────────────────────────────────────────────────────
// FOUR core assertions from the proven legacy harness, plus a sanity check.

function chkZeroBounds(root) {
  const f = [];
  for (const el of allIds(root)) {
    const b = parseBounds(el.bounds);
    if (!b) continue;
    if (b.x1 === b.x2 || b.y1 === b.y2)
      f.push(`ZERO BOUNDS: ${el['resource-id']} — ${el.bounds} (${b.x2 - b.x1}x${b.y2 - b.y1})`);
  }
  return f;
}
function chkOffScreen(root, scr) {
  const f = [];
  for (const el of allIds(root)) {
    const b = parseBounds(el.bounds);
    if (!b) continue;
    if (b.x2 <= 0 || b.x1 >= scr.w || b.y2 <= 0 || b.y1 >= scr.h)
      f.push(`OFF SCREEN: ${el['resource-id']} — ${el.bounds} outside [0,0][${scr.w},${scr.h}]`);
  }
  return f;
}
function chkKeyboard(root, scr) {
  const f = [];
  let it = imeTop(root);
  if (it === null && isKeyboardActive()) {
    const ib = getImeBounds();
    if (ib) it = ib.y1;
  }
  if (it === null) return f;
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
function chkRequiredElements(root, requiredTestIds) {
  const f = [];
  for (const id of requiredTestIds) {
    const els = find(root, n => n['resource-id'] === id);
    if (!els.length) f.push(`REQUIRED MISSING: ${id} — testID not found in hierarchy`);
  }
  return f;
}
function chkPackage(root) {
  // Sanity check: ensure we're looking at our app, not the launcher.
  const pkgs = find(root, n => !!n.package);
  const ourPkg = pkgs.filter(n => n.package === 'com.openchat.mobile');
  if (ourPkg.length === 0 && pkgs.length > 0) {
    return [`WRONG PACKAGE: expected com.openchat.mobile, got ${pkgs.map(n => n.package).filter(Boolean).slice(0, 5).join(', ')}`];
  }
  return [];
}
function runChecks(xmlPath, scr, requiredTestIds = []) {
  const root = parseXml(xmlPath);
  return {
    pkg: chkPackage(root),
    zeroBounds: chkZeroBounds(root),
    offScreen: chkOffScreen(root, scr),
    keyboardOcclusion: chkKeyboard(root, scr),
    placeholderText: chkPlaceholder(root),
    requiredMissing: chkRequiredElements(root, requiredTestIds),
  };
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const scr = screenSize();
  console.log(`Device: ${DEVICE} (${scr.w}x${scr.h})`);
  console.log(`Output: ${OUT}\n`);

  // ── Setup: clear state + grant permissions + login ──
  console.log('═══ Setup ═══');
  adbSh('pm clear com.openchat.mobile');
  adbSh('pm grant com.openchat.mobile android.permission.CAMERA');
  adbSh('pm grant com.openchat.mobile android.permission.RECORD_AUDIO');
  adbSh('pm grant com.openchat.mobile android.permission.POST_NOTIFICATIONS');
  sleep(1000);

  // Run login via Maestro
  console.log('  Running _login.yaml...');
  const loginR = maestro(['test', join(FLOWS, '_login.yaml')], { timeout: 120_000 });
  if (!loginR.ok) {
    console.error('FATAL: login failed');
    console.error(loginR.stderr);
    process.exit(1);
  }
  console.log('  Login OK\n');

  // ── Screen registry ────────────────────────────────────────────────────
  const screens = [
    // Each entry: { id, label, flow: 'flow-name.yaml', requiredTestIds: [...] }
    { id: 'shell-chat', label: 'ShellScreen (chat)', flow: 'shell-chat.yaml',
      required: ['shell-screen', 'chat-pane', 'composer-input'] },
    { id: 'left-drawer', label: 'Left Drawer (rail+channels)', flow: 'left-drawer.yaml',
      required: ['left-drawer', 'server-rail'] },
    { id: 'right-drawer', label: 'Right Drawer (members)', flow: 'right-drawer.yaml',
      required: ['right-drawer', 'members-drawer'] },
    { id: 'friends', label: 'FriendsScreen', flow: 'friends.yaml',
      required: ['friends-screen', 'friends-tabs'] },
    { id: 'inbox', label: 'InboxScreen', flow: 'inbox.yaml',
      required: ['inbox-screen'] },
    { id: 'create-server', label: 'CreateServerScreen', flow: 'create-server.yaml',
      required: ['create-server-screen'] },
    { id: 'server-settings', label: 'ServerSettingsScreen', flow: 'server-settings.yaml',
      required: ['server-settings-screen'] },
    { id: 'roles-editor', label: 'RolesEditorScreen', flow: 'roles-editor.yaml',
      required: ['roles-editor'] },
    { id: 'notif-settings', label: 'NotificationSettingsScreen', flow: 'notif-settings.yaml',
      required: ['notif-settings-done'] },
    { id: 'invite-create', label: 'InviteCreateOverlay', flow: 'invite-create.yaml',
      required: ['invite-create-overlay'] },
    { id: 'join-server', label: 'JoinServerOverlay', flow: 'join-server.yaml',
      required: ['join-server-overlay'] },
    { id: 'channel-form', label: 'ChannelForm', flow: 'channel-form.yaml',
      required: ['channel-form-sheet'] },
    { id: 'channel-reorder', label: 'ChannelReorderScreen', flow: 'channel-reorder.yaml',
      required: ['channel-reorder-sheet'] },
    { id: 'pins', label: 'PinsPanel', flow: 'pins.yaml',
      required: ['pins-panel'] },
    { id: 'attach-picker', label: 'AttachPicker', flow: 'attach-picker.yaml',
      required: ['attach-library'] },
    { id: 'poll-create', label: 'PollCreate', flow: 'poll-create.yaml',
      required: ['poll-create-question'] },
    { id: 'member-profile', label: 'MemberProfileSheet', flow: 'member-profile.yaml',
      required: ['member-profile-sheet'] },
    { id: 'invite-preview', label: 'InvitePreviewOverlay', flow: 'invite-preview.yaml',
      required: ['invite-preview-overlay'],
      unreachableReason: 'UNREACHABLE-BY-DESIGN: requires a real invite link URL in a message' },
  ];



  const results = [];
  for (const s of screens) {
    console.log(`── ${s.label} ──`);

    // UNREACHABLE-BY-DESIGN screens skip the flow file check
    if (s.unreachableReason) {
      console.log(`  UNREACHED — ${s.unreachableReason}`);
      results.push({ screen: s.label, id: s.id, reached: false, pass: false, failures: [s.unreachableReason] });
      continue;
    }

    const flowPath = join(SCREEN_FLOWS, s.flow);

    if (!existsSync(flowPath)) {
      const reason = `UNREACHABLE-BY-DESIGN: no flow file at ${s.flow}`;
      console.log(`  UNREACHED — ${reason}`);
      results.push({ screen: s.label, id: s.id, reached: false, pass: false, failures: [reason] });
      continue;
    }

    // Run the navigation flow via Maestro
    const mr = maestro(['test', flowPath], { timeout: 120_000 });
    if (!mr.ok) {
      const reason = `UNREACHED: Maestro flow failed (exit code ${mr.code})`;
      console.log(`  UNREACHED — ${reason}`);
      if (mr.stderr) console.log(`  stderr: ${mr.stderr.split('\n').slice(0, 5).join('\n')}`);
      results.push({ screen: s.label, id: s.id, reached: false, pass: false, failures: [reason] });
      continue;
    }

    sleep(500);
    const { xml, png } = capture(s.id);
    console.log(`  xml: ${xml}`);
    console.log(`  png: ${png}`);

    // Sanity check package
    const pkgCheck = chkPackage(parseXml(xml));
    if (pkgCheck.length) {
      console.log(`  WARNING: ${pkgCheck.join('; ')}`);
    }

    const checks = runChecks(xml, scr, s.required || []);
    const all = [
      ...checks.pkg.map(f => `PKG: ${f}`),
      ...checks.zeroBounds,
      ...checks.offScreen,
      ...checks.keyboardOcclusion,
      ...checks.placeholderText,
      ...checks.requiredMissing,
    ];
    if (all.length) {
      console.log(`  FAIL (${all.length}):`);
      for (const f of all) console.log(`  ${f}`);
      results.push({ screen: s.label, id: s.id, reached: true, pass: false, failures: all });
    } else {
      console.log(`  PASS`);
      results.push({ screen: s.label, id: s.id, reached: true, pass: true, failures: [] });
    }

    // Each flow handles its own go-shell recovery inline
  }

  // ── Report ─────────────────────────────────────────────────────────────
  console.log('\n\n═══════════════════════════════════════');
  console.log('SCREEN READINESS SWEEP — VERDICT');
  console.log(`Device: ${DEVICE} (${scr.w}x${scr.h})`);
  console.log('═══════════════════════════════════════\n');
  let pass = 0, violations = 0, unreached = 0;
  const reached = results.filter(r => r.reached).length;
  for (const r of results) {
    const st = r.reached ? (r.pass ? 'PASS' : 'FAIL') : 'UNREACHED';
    if (st === 'PASS') pass++;
    else if (st === 'FAIL') violations++;
    else unreached++;
    console.log(`${st.padEnd(14)} ${r.screen}`);
  }
  console.log(`\n───`);
  console.log(`${reached}/${results.length} reached, ${unreached} UNREACHED, ${violations} violations`);
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(results, null, 2));
  console.log(`\nReport: ${join(OUT, 'report.json')}`);
  if (violations > 0 || unreached > 0) process.exit(1);
}

function runGoShell() {
  // Use adb back button to dismiss overlays and return to shell.
  // This is MUCH more reliable than Maestro's `back` command, which
  // can exit the app. adb keyevent 4 from shell is harmless.
  const TMP = join(OUT, '_tmp.xml');
  for (let i = 0; i < 8; i++) {
    try { dumpXml(TMP); } catch { break; }
    if (!existsSync(TMP)) break;
    const hasShell = find(parseXml(TMP), n => n['resource-id'] === 'shell-screen').length > 0;
    if (hasShell) return;
    adbSh('input keyevent 4');
    sleep(400);
  }
  console.log('  (go-shell recover exceeded retries, continuing anyway)');
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
