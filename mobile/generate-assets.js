#!/usr/bin/env node
/**
 * Generate PNG assets for DataSync Field mobile app.
 * Reads assets/icon.svg and produces icon.png, adaptive-icon.png,
 * favicon.png, and splash.png using sharp.
 */
const sharp   = require('sharp');
const path    = require('path');
const fs      = require('fs');

const assetsDir = path.join(__dirname, 'assets');

// Tractor elements shared between icon and splash (reused inline in splash SVG).
// In the splash the tractor is scaled 0.7× and translated so its bounding-box
// centre (506, 502.5) lands on the badge centre (642, 1280).
// Transform: translate(287.8 928.25) scale(0.7)
const TRACTOR_ELEMENTS = `
    <circle cx="698" cy="620" r="202" fill="#367C2B"/>
    <circle cx="698" cy="620" r="65"  fill="#FFDE00"/>
    <circle cx="698" cy="620" r="30"  fill="#367C2B"/>
    <circle cx="254" cy="688" r="108" fill="#367C2B"/>
    <circle cx="254" cy="688" r="36"  fill="#FFDE00"/>
    <circle cx="254" cy="688" r="16"  fill="#367C2B"/>
    <rect x="254" y="560" width="444" height="122" rx="8"  fill="#367C2B"/>
    <rect x="130" y="480" width="334" height="92"  rx="8"  fill="#367C2B"/>
    <rect x="112" y="518" width="44"  height="54"  rx="5"  fill="#367C2B"/>
    <rect x="456" y="330" width="252" height="242" rx="10" fill="#367C2B"/>
    <rect x="430" y="324" width="304" height="24"  rx="5"  fill="#367C2B"/>
    <rect x="508" y="200" width="38"  height="136" rx="6"  fill="#367C2B"/>
    <ellipse cx="527" cy="198" rx="30" ry="15" fill="#367C2B"/>
    <rect x="472" y="354" width="88"  height="84"  rx="6"  fill="#FFDE00"/>
    <rect x="574" y="354" width="88"  height="84"  rx="6"  fill="#FFDE00"/>`;

// Splash screen: green background, yellow badge with tractor, white text
const SPLASH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1284" height="2778" viewBox="0 0 1284 2778">
  <rect width="1284" height="2778" fill="#367C2B"/>
  <!-- Yellow badge (mirrors icon background) -->
  <circle cx="642" cy="1280" r="380" fill="#FFDE00"/>
  <!-- Tractor centred inside badge -->
  <g transform="translate(287.8 928.25) scale(0.7)">${TRACTOR_ELEMENTS}
  </g>
  <!-- App name -->
  <text x="642" y="1758"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-weight="bold"
        font-size="92"
        fill="white">DataSync Field</text>
  <!-- Subtitle -->
  <text x="642" y="1828"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="48"
        fill="white"
        opacity="0.88">North Green · John Deere</text>
</svg>`;

async function run() {
  fs.mkdirSync(assetsDir, { recursive: true });

  const iconSvg    = fs.readFileSync(path.join(assetsDir, 'icon.svg'));
  const splashBuf  = Buffer.from(SPLASH_SVG);

  const tasks = [
    { name: 'icon.png',          buf: iconSvg,   w: 1024, h: 1024 },
    { name: 'adaptive-icon.png', buf: iconSvg,   w: 1024, h: 1024 },
    { name: 'favicon.png',       buf: iconSvg,   w:   48, h:   48 },
    { name: 'splash.png',        buf: splashBuf, w: 1284, h: 2778 },
  ];

  for (const t of tasks) {
    await sharp(t.buf)
      .resize(t.w, t.h, { fit: 'fill' })
      .png()
      .toFile(path.join(assetsDir, t.name));
    console.log(`✓ ${t.name} (${t.w}×${t.h})`);
  }

  console.log('\nAll assets generated!');
}

run().catch(err => { console.error(err); process.exit(1); });
