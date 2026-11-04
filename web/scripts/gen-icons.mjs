// Generates the PWA PNG icons (no native deps) matching public/icon.svg: a white raindrop on blue.
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(out, { recursive: true });

const BG = [0x03, 0x69, 0xa1];
const FG = [0xff, 0xff, 0xff];

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

// Drop in the 512 x 512 SVG space: circle (256, 310) r 130 plus the cone up to the tip at (256, 70).
const CX = 256;
const CY = 310;
const R = 130;
const TIP = 70;
function inDrop(px, py) {
  if (Math.hypot(px - CX, py - CY) <= R) return true;
  if (py < TIP || py > CY) return false;
  // the cone is tangent to the circle; its half-width grows linearly from the tip
  const t = (py - TIP) / (CY - TIP);
  const tangentHalf = R * Math.cos(Math.asin(R / (CY - TIP)));
  return Math.abs(px - CX) <= tangentHalf * t;
}

function render(size) {
  const s = size;
  const scale = s / 512;
  const raw = Buffer.alloc((s * 4 + 1) * s);
  const inside = (x, y, r) => Math.hypot(x, y) <= r;
  for (let y = 0; y < s; y++) {
    raw[y * (s * 4 + 1)] = 0; // filter none
    for (let x = 0; x < s; x++) {
      const px = (x + 0.5) / scale;
      const py = (y + 0.5) / scale;
      const inSquare =
        !(px < 112 && py < 112 && !inside(px - 112, py - 112, 112)) &&
        !(px > 400 && py < 112 && !inside(px - 400, py - 112, 112)) &&
        !(px < 112 && py > 400 && !inside(px - 112, py - 400, 112)) &&
        !(px > 400 && py > 400 && !inside(px - 400, py - 400, 112));
      const color = inSquare ? (inDrop(px, py) ? FG : BG) : null;
      const o = y * (s * 4 + 1) + 1 + x * 4;
      if (color) {
        raw[o] = color[0];
        raw[o + 1] = color[1];
        raw[o + 2] = color[2];
        raw[o + 3] = 255;
      } else {
        raw[o + 3] = 0;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(s, 0);
  ihdr.writeUInt32BE(s, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(join(out, 'icon-192.png'), render(192));
writeFileSync(join(out, 'icon-512.png'), render(512));
writeFileSync(join(out, 'apple-touch-icon.png'), render(180));
console.log('icons written to', out);
