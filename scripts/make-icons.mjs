// Gera os ícones do PWA sem dependências externas (PNG codificado na mão).
// Uso: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const APP = join(ROOT, 'src', 'app');

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filtro "none"
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profundidade
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hsl = (h, s, l, a = 1) => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
      ? [x, c, 0]
      : h < 180
      ? [0, c, x]
      : h < 240
      ? [0, x, c]
      : h < 300
      ? [x, 0, c]
      : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255, a * 255];
};

function makeCanvas(size) {
  return { size, data: new Float32Array(size * size * 4) };
}

function blend(canvas, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= canvas.size || y >= canvas.size) return;
  const i = (y * canvas.size + x) * 4;
  const sa = a / 255;
  const d = canvas.data;
  d[i] = r * sa + d[i] * (1 - sa);
  d[i + 1] = g * sa + d[i + 1] * (1 - sa);
  d[i + 2] = b * sa + d[i + 2] * (1 - sa);
  d[i + 3] = a + d[i + 3] * (1 - sa);
}

function fillRoundRect(canvas, x0, y0, w, h, radius, color) {
  const [r, g, b, a] = color;
  for (let y = Math.floor(y0); y < Math.ceil(y0 + h); y++) {
    for (let x = Math.floor(x0); x < Math.ceil(x0 + w); x++) {
      const dx = Math.max(x0 + radius - x, 0, x - (x0 + w - radius));
      const dy = Math.max(y0 + radius - y, 0, y - (y0 + h - radius));
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      const edge = Math.min(1, radius - d);
      blend(canvas, x, y, [r, g, b, a * Math.min(1, edge)]);
    }
  }
}

function fillCircle(canvas, cx, cy, radius, color) {
  const [r, g, b, a] = color;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > radius) continue;
      blend(canvas, x, y, [r, g, b, a * Math.min(1, Math.max(0, radius - d))]);
    }
  }
}

function radialGlow(canvas, cx, cy, radius, color) {
  const [r, g, b, a] = color;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const t = 1 - Math.hypot(x - cx, y - cy) / radius;
      if (t <= 0) continue;
      blend(canvas, x, y, [r, g, b, a * t * t]);
    }
  }
}

/**
 * Desenha o ícone em um buffer 2× e reduz (antialiasing).
 * `bleed: true` = arte sangrada até a borda (maskable / apple-touch).
 */
function drawIcon(size, { bleed = false, content = 1 } = {}) {
  const SS = 2;
  const S = size * SS;
  const canvas = makeCanvas(S);
  const u = S / 512;

  // fundo
  for (let y = 0; y < S; y++) {
    const t = y / S;
    const top = [10, 15, 39];
    const bottom = [29, 18, 71];
    const c = top.map((v, i) => v + (bottom[i] - v) * t);
    for (let x = 0; x < S; x++) blend(canvas, x, y, [...c, 255]);
  }
  radialGlow(canvas, 90 * u, 60 * u, 320 * u, [34, 211, 238, 90]);
  radialGlow(canvas, 430 * u, 470 * u, 300 * u, [167, 139, 250, 95]);

  if (!bleed) {
    // recorte arredondado (cantos transparentes)
    const r = 112 * u;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = Math.max(r - x, 0, x - (S - r));
        const dy = Math.max(r - y, 0, y - (S - r));
        const d = Math.hypot(dx, dy);
        if (d > r) {
          const i = (y * S + x) * 4;
          canvas.data[i + 3] = 0;
        } else if (d > r - 2) {
          const i = (y * S + x) * 4;
          canvas.data[i + 3] *= Math.min(1, r - d);
        }
      }
    }
  }

  // cobra: corpo em L (3 na horizontal + 2 na vertical) e cabeça à direita
  const center = S / 2;
  const k = content;
  const P = (x, y) => [center + (x - 256 + 14) * u * k, center + (y - 256 + 14) * u * k];
  const block = 86 * u * k;
  const radius = 23 * u * k;

  const segments = [
    { x: 176, y: 336, hue: 275 },
    { x: 176, y: 262, hue: 240 },
    { x: 176, y: 176, hue: 210 },
    { x: 256, y: 176, hue: 185 },
  ];
  for (const s of segments) {
    const [cx, cy] = P(s.x, s.y);
    fillRoundRect(
      canvas,
      cx - block / 2,
      cy - block / 2,
      block,
      block,
      radius,
      hsl(s.hue, 0.72, 0.52)
    );
  }

  // cabeça (por cima, à direita)
  const [hx, hy] = P(336, 176);
  fillRoundRect(canvas, hx - block / 2, hy - block / 2, block, block, radius, hsl(150, 0.78, 0.56));
  // olhos voltados para a direita (perpendiculares à direção)
  for (const dy of [-1, 1]) {
    fillCircle(canvas, hx + 15 * u * k, hy + dy * 17 * u * k, 10 * u * k, [255, 255, 255, 255]);
    fillCircle(canvas, hx + 19 * u * k, hy + dy * 17 * u * k, 5 * u * k, [11, 16, 38, 255]);
  }

  // reduz 2× (box filter)
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * S + (x * SS + sx)) * 4;
          r += canvas.data[i];
          g += canvas.data[i + 1];
          b += canvas.data[i + 2];
          a += canvas.data[i + 3];
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return encodePNG(size, out);
}

const targets = [
  [join(PUBLIC, 'icon-192.png'), 192, { bleed: false, content: 1.05 }],
  [join(PUBLIC, 'icon-512.png'), 512, { bleed: false, content: 1.05 }],
  [join(PUBLIC, 'icon-maskable-512.png'), 512, { bleed: true, content: 0.78 }],
  [join(PUBLIC, 'apple-touch-icon.png'), 180, { bleed: true, content: 0.8 }],
  [join(APP, 'icon.png'), 192, { bleed: false }],
];

mkdirSync(APP, { recursive: true });
for (const [file, size, opts] of targets) {
  writeFileSync(file, drawIcon(size, opts));
  console.log(`ok ${file.replace(ROOT, '.')} (${size}px)`);
}
