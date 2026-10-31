// Generates extension/icons/icon{16,48,128}.png (purple tile with a sparkle) with no dependencies.
import { writeFile, mkdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'icons');

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const rows = [];
  for (let y = 0; y < size; y++) rows.push(Buffer.from([0]), rgba.subarray(y * size * 4, (y + 1) * size * 4));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Coverage of one point in unit space: 1 inside the shape, 0 outside.
function sample(u, v) {
  const r = 0.22, d = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0) ** 2 + Math.max(Math.abs(v - 0.5) - (0.5 - r), 0) ** 2;
  if (d > r * r) return null;
  const x = Math.abs(u - 0.5), y = Math.abs(v - 0.5);
  const sparkle = Math.sqrt(x) + Math.sqrt(y) < Math.sqrt(0.3);
  const small = Math.hypot(u - 0.76, v - 0.25) < 0.06;
  if (sparkle || small) return [255, 255, 255];
  const t = (u + v) / 2;
  return [Math.round(124 + 112 * t), Math.round(58 - 10 * t), Math.round(237 - 84 * t)];
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const ss = 4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const c = sample((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
      if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
    }
    const i = (y * size + x) * 4;
    if (a) { px[i] = r / a; px[i + 1] = g / a; px[i + 2] = b / a; px[i + 3] = (255 * a) / (ss * ss); }
  }
  return png(size, px);
}

await mkdir(out, { recursive: true });
for (const size of [16, 48, 128]) await writeFile(join(out, `icon${size}.png`), render(size));
console.log('✓ icons written to extension/icons');
