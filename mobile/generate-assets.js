const fs   = require('fs');
const zlib = require('zlib');
const path = require('path');

// Create a solid-color PNG using raw PNG bytes + zlib compression
function createPng(width, height, r, g, b) {
  // PNG signature
  const sig = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);

  function chunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const len       = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const crcBuf    = Buffer.concat([typeBytes, data]);
    const crc       = crc32(crcBuf);
    const crcOut    = Buffer.alloc(4); crcOut.writeUInt32BE(crc >>> 0, 0);
    return Buffer.concat([len, typeBytes, data, crcOut]);
  }

  // CRC-32
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF);
  }

  // IHDR: width, height, 8-bit RGB, no interlace
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width,  0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8]  = 8;  // bit depth
  ihdr[9]  = 2;  // color type: RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Raw image data: filter byte (0) + RGB per row
  const row = Buffer.alloc(1 + width * 3);
  row[0] = 0; // filter none
  for (let x = 0; x < width; x++) { row[1+x*3]=r; row[2+x*3]=g; row[3+x*3]=b; }

  const raw = Buffer.concat(Array(height).fill(row));
  const compressed = zlib.deflateSync(raw, { level: 6 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const assetsDir = path.join(__dirname, 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

// JD Green #367C2B = rgb(54, 124, 43)
const G = [54, 124, 43];
// White for splash background
const W = [255, 255, 255];

const files = [
  { name: 'icon.png',          w: 1024, h: 1024, c: G },
  { name: 'adaptive-icon.png', w: 1024, h: 1024, c: G },
  { name: 'splash.png',        w: 1284, h: 2778, c: W },
  { name: 'favicon.png',       w:   48, h:   48, c: G },
];

for (const f of files) {
  const buf  = createPng(f.w, f.h, ...f.c);
  const dest = path.join(assetsDir, f.name);
  fs.writeFileSync(dest, buf);
  console.log(`Created ${f.name} (${f.w}x${f.h}) — ${buf.length} bytes`);
}
