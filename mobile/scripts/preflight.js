#!/usr/bin/env node
/**
 * Pre-submission checklist for store builds.
 *
 *   npm run preflight
 *
 * Reports every problem at once rather than failing on the first, so the team
 * can see the full remaining work. Exits non-zero if any blocker remains.
 *
 * The same API-URL and Maps-key rules are enforced hard in app.config.js at
 * build time; this script exists to surface them early and readably, plus the
 * checks a build cannot make (placeholder artwork, unreplaced eas.json fields).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Expo loads .env itself; plain node does not. Mirror it so local runs see the
// same values a build would. Real builds read EAS secrets, not this file.
try {
  require('dotenv').config({ path: path.join(ROOT, '.env') });
} catch {
  // dotenv unavailable — fall back to whatever is already in the environment.
}
const blockers = [];
const warnings = [];

const read = (p) => {
  try {
    return fs.readFileSync(path.join(ROOT, p));
  } catch {
    return null;
  }
};

// ── CNG: native folders must not exist ───────────────────────────────
// `expo run:android` / `expo prebuild` recreate these locally. While they
// exist, EAS Build silently ignores icon/splash/ios/android/plugins from
// app.config.js — which is how the placeholder Maps key and cleartext HTTP
// previously ended up baked into the native manifest.
for (const dir of ['android', 'ios']) {
  if (fs.existsSync(path.join(ROOT, dir))) {
    blockers.push(
      `mobile/${dir}/ exists — EAS will ignore app.config.js (icon, splash, ${dir}, plugins). ` +
        `Delete it; EAS regenerates native code at build time.`
    );
  }
}

// ── Icons: still the generated placeholders? ─────────────────────────
const PLACEHOLDER_MARK = 'LaundroMart-Placeholder';
for (const asset of ['icon.png', 'adaptive-icon.png', 'splash.png', 'favicon.png']) {
  const buf = read(path.join('assets', asset));
  if (!buf) {
    blockers.push(`assets/${asset} is missing.`);
  } else if (buf.includes(PLACEHOLDER_MARK)) {
    blockers.push(`assets/${asset} is still the generated placeholder — replace with real artwork.`);
  }
}

// ── eas.json: unreplaced submit credentials ──────────────────────────
const easRaw = read('eas.json');
if (!easRaw) {
  blockers.push('eas.json is missing.');
} else {
  const eas = JSON.parse(easRaw);
  const ios = eas.submit?.production?.ios || {};
  for (const [key, val] of Object.entries(ios)) {
    if (typeof val === 'string' && val.startsWith('REPLACE_WITH_')) {
      blockers.push(`eas.json: submit.production.ios.${key} is still a placeholder.`);
    }
  }
  const saPath = eas.submit?.production?.android?.serviceAccountKeyPath;
  if (saPath && !fs.existsSync(path.join(ROOT, saPath))) {
    warnings.push(
      `eas.json references ${saPath}, which does not exist yet. ` +
        `Needed only for \`eas submit\` to Play; download it from Google Cloud Console.`
    );
  }
}

// ── Environment ──────────────────────────────────────────────────────
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
if (!apiUrl) {
  blockers.push('EXPO_PUBLIC_API_URL is not set in the environment.');
} else {
  let host = null;
  try {
    const u = new URL(apiUrl);
    host = u.hostname;
    if (u.protocol !== 'https:') blockers.push(`EXPO_PUBLIC_API_URL must use https:// (got ${u.protocol}//).`);
    if (!u.pathname.replace(/\/$/, '').endsWith('/api')) {
      warnings.push(`EXPO_PUBLIC_API_URL ("${apiUrl}") does not end in /api — confirm this matches your backend mount point.`);
    }
  } catch {
    blockers.push(`EXPO_PUBLIC_API_URL is not a valid URL (got "${apiUrl}").`);
  }
  const priv =
    host &&
    (host === 'localhost' ||
      host.endsWith('.local') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host));
  if (priv) blockers.push(`EXPO_PUBLIC_API_URL host "${host}" is private — store reviewers cannot reach it.`);
}

const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
if (!mapsKey) {
  blockers.push('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not set — maps will render blank.');
} else if (/^YOUR_|_HERE$|PLACEHOLDER|CHANGEME/i.test(mapsKey)) {
  blockers.push(`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is still a placeholder ("${mapsKey}") — maps will render blank.`);
} else if (!mapsKey.startsWith('AIza')) {
  blockers.push('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY does not look like a Google API key (should start with "AIza").');
} else if (!/^AIza[0-9A-Za-z_-]{35}$/.test(mapsKey)) {
  // Unusual but not necessarily wrong — warn rather than block.
  warnings.push(
    `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is an unusual length (${mapsKey.length}; Google keys are typically 39). Double-check it.`
  );
}

// ── Reminders a script cannot verify ─────────────────────────────────
const manual = [
  'Backend deployed at a public HTTPS domain with a valid TLS certificate.',
  'Paystack switched from sk_test_ to live keys (and the old test key rotated).',
  'Privacy policy publicly hosted; URL ready for both stores (required — you collect location).',
  'Demo credentials for customer, rider AND provider roles in App Store Connect review notes.',
  'Seeded demo data so a reviewer logging in as rider/provider sees a non-empty queue.',
  'Screenshots captured (iOS 6.7" + 5.5"; Android phone + 7"/10" tablet).',
];

// ── Report ───────────────────────────────────────────────────────────
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
console.log(`\n${bold('LaundroMart store preflight')}\n`);

if (blockers.length) {
  console.log(bold(`  ${blockers.length} blocker(s):`));
  blockers.forEach((b) => console.log(`   \x1b[31m✗\x1b[0m ${b}`));
  console.log('');
}
if (warnings.length) {
  console.log(bold(`  ${warnings.length} warning(s):`));
  warnings.forEach((w) => console.log(`   \x1b[33m!\x1b[0m ${w}`));
  console.log('');
}
if (!blockers.length && !warnings.length) {
  console.log('  \x1b[32m✓\x1b[0m Automated checks passed.\n');
}

console.log(bold('  Verify by hand (not checkable here):'));
manual.forEach((m) => console.log(`   \x1b[90m□\x1b[0m ${m}`));
console.log('');

process.exit(blockers.length ? 1 : 0);
