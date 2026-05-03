/**
 * Murmur Browser Extension — Build Script.
 * Validates the extension structure and copies files to a dist/ directory.
 * No bundler required — the extension uses plain JS files directly.
 *
 * Usage: node scripts/build.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// ── File lists ──────────────────────────────────────────────

const REQUIRED_SRC_FILES = [
  'manifest.json',
  'src/shared/types.js',
  'src/shared/enums.js',
  'src/shared/tool-catalog.js',
  'src/shared/storage.js',
  'src/background/service-worker.js',
  'src/background/detector.js',
  'src/background/tool-matcher.js',
  'src/background/sessionizer.js',
  'src/background/native-messaging.js',
  'src/popup/popup.html',
  'src/popup/popup.js',
  'src/popup/popup.css',
  'src/options/options.html',
  'src/options/options.js',
  'src/options/options.css',
  'src/calculator/entry-calculator.js',
  'src/calculator/fatigue-calculator.js',
  'src/calculator/weekly-review.js',
  'src/export/csv-exporter.js',
];

const COPY_DIRS = [
  { src: 'icons', dest: 'icons' },
  { src: 'src', dest: 'src' },
];

// ── Validate ────────────────────────────────────────────────

console.log('[Murmur Build] Validating source files...');
let missing = [];
for (const f of REQUIRED_SRC_FILES) {
  const fullPath = path.join(ROOT, f);
  if (!fs.existsSync(fullPath)) {
    missing.push(f);
    console.error(`  ✗ MISSING: ${f}`);
  }
}

if (missing.length > 0) {
  console.error(`\n[Murmur Build] ERROR: ${missing.length} required file(s) missing.`);
  process.exit(1);
}

console.log(`  ✓ All ${REQUIRED_SRC_FILES.length} required files present.`);

// ── Validate manifest ───────────────────────────────────────

console.log('[Murmur Build] Validating manifest.json...');
try {
  const manifestRaw = fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8');
  const manifest = JSON.parse(manifestRaw);

  if (manifest.manifest_version !== 3) {
    console.error('  ✗ manifest_version must be 3');
    process.exit(1);
  }

  if (!manifest.icons) {
    console.error('  ✗ icons field is required in manifest');
    process.exit(1);
  }

  // icons must be an object with size keys (Chrome requirement)
  if (typeof manifest.icons !== 'object' || Array.isArray(manifest.icons)) {
    console.error('  ✗ icons must be an object with size keys, e.g. {"16": "...", "48": "...", "128": "..."}');
    process.exit(1);
  }

  // Validate all icon paths exist and are PNG (SVG not supported by Chrome for icons)
  const requiredSizes = ['16', '48', '128'];
  for (const size of requiredSizes) {
    const iconPath = manifest.icons[size];
    if (!iconPath) {
      console.warn(`  ⚠ No icon for size ${size}`);
      continue;
    }
    if (iconPath.endsWith('.svg')) {
      console.error(`  ✗ SVG icons not supported by Chrome: ${iconPath}. Use PNG format.`);
      process.exit(1);
    }
    if (!fs.existsSync(path.join(ROOT, iconPath))) {
      console.error(`  ✗ Icon file missing: ${iconPath}`);
      process.exit(1);
    }
  }
  console.log('  ✓ Icon files verified (PNG, size-object format)');

  // Also validate action default_icon if present
  if (manifest.action && manifest.action.default_icon) {
    const actionIcon = manifest.action.default_icon;
    if (typeof actionIcon === 'string') {
      console.error('  ✗ action.default_icon must be a size object, not a string');
      process.exit(1);
    }
    for (const iconPath of Object.values(actionIcon)) {
      if (iconPath.endsWith('.svg')) {
        console.error(`  ✗ SVG icons not supported by Chrome: ${iconPath}`);
        process.exit(1);
      }
      if (!fs.existsSync(path.join(ROOT, iconPath))) {
        console.error(`  ✗ Icon file missing: ${iconPath}`);
        process.exit(1);
      }
    }
    console.log('  ✓ Action icon files verified');
  }

  const requiredPermissions = ['tabs', 'storage'];
  for (const perm of requiredPermissions) {
    if (!manifest.permissions.includes(perm)) {
      console.warn(`  ⚠ Missing recommended permission: ${perm}`);
    }
  }

  if (manifest.content_scripts) {
    console.warn('  ⚠ content_scripts detected — ensure Prompt Count is P1/opt-in only');
  }

  console.log('  ✓ manifest.json valid');
} catch (err) {
  console.error(`  ✗ Invalid manifest.json: ${err.message}`);
  process.exit(1);
}

// ── Copy to dist ────────────────────────────────────────────

console.log('[Murmur Build] Copying to dist/...');
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true });
}

for (const { src, dest } of COPY_DIRS) {
  const srcPath = path.join(ROOT, src);
  const destPath = path.join(DIST, dest);
  copyRecursive(srcPath, destPath);
}

// Copy manifest separately
fs.copyFileSync(
  path.join(ROOT, 'manifest.json'),
  path.join(DIST, 'manifest.json')
);

console.log('[Murmur Build] ✓ Build complete. Output: dist/');
console.log('  Load dist/ as an unpacked extension in chrome://extensions/');

// ── Helpers ─────────────────────────────────────────────────

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
