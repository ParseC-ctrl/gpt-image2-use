import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const outPath = join(rootDir, "public/favicon.ico");
const sizes = [16, 32, 48, 64];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function createPng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  const rows = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.from([0]));
    rows.push(rgba.subarray(y * width * 4, (y + 1) * width * 4));
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function blend(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function roundedRectAlpha(x, y, size, radius) {
  const dx = Math.max(radius - x, 0, x - (size - radius - 1));
  const dy = Math.max(radius - y, 0, y - (size - radius - 1));
  const distance = Math.hypot(dx, dy);
  if (distance <= radius - 1) return 255;
  if (distance >= radius + 1) return 0;
  return Math.round((radius + 1 - distance) * 127.5);
}

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const margin = Math.max(1, Math.round(size * 0.08));
  const gridStep = Math.max(4, Math.round(size / 4));

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const alpha = roundedRectAlpha(x, y, size, radius);
      const t = (x + y) / (size * 2);
      pixels[index] = blend(8, 25, t);
      pixels[index + 1] = blend(116, 180, t);
      pixels[index + 2] = blend(126, 196, t);
      pixels[index + 3] = alpha;
    }
  }

  function setPixel(x, y, color, alpha = 255) {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const baseAlpha = pixels[(y * size + x) * 4 + 3];
    if (!baseAlpha) return;
    const index = (y * size + x) * 4;
    const opacity = Math.min(alpha, baseAlpha) / 255;
    pixels[index] = Math.round(pixels[index] * (1 - opacity) + color[0] * opacity);
    pixels[index + 1] = Math.round(pixels[index + 1] * (1 - opacity) + color[1] * opacity);
    pixels[index + 2] = Math.round(pixels[index + 2] * (1 - opacity) + color[2] * opacity);
  }

  for (let p = margin; p < size - margin; p += gridStep) {
    for (let i = margin; i < size - margin; i += 1) {
      setPixel(i, p, [210, 247, 241], 55);
      setPixel(p, i, [210, 247, 241], 55);
    }
  }

  const frame = Math.round(size * 0.22);
  const frameEnd = Math.round(size * 0.78);
  const stroke = Math.max(1, Math.round(size / 20));
  for (let i = frame; i <= frameEnd; i += 1) {
    for (let s = 0; s < stroke; s += 1) {
      setPixel(i, frame + s, [238, 255, 252], 230);
      setPixel(i, frameEnd - s, [238, 255, 252], 230);
      setPixel(frame + s, i, [238, 255, 252], 230);
      setPixel(frameEnd - s, i, [238, 255, 252], 230);
    }
  }

  const sparkX = Math.round(size * 0.68);
  const sparkY = Math.round(size * 0.34);
  const spark = Math.max(3, Math.round(size * 0.16));
  for (let d = -spark; d <= spark; d += 1) {
    const alpha = Math.round(245 * (1 - Math.abs(d) / (spark + 1)));
    setPixel(sparkX + d, sparkY, [255, 245, 154], alpha);
    setPixel(sparkX, sparkY + d, [255, 245, 154], alpha);
    if (Math.abs(d) < spark / 2) {
      setPixel(sparkX + d, sparkY + d, [255, 245, 154], alpha);
      setPixel(sparkX + d, sparkY - d, [255, 245, 154], alpha);
    }
  }

  return createPng(size, size, pixels);
}

function createIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, createIco(sizes.map((size) => ({ size, png: drawIcon(size) }))));
console.log(`Generated ${outPath}`);
