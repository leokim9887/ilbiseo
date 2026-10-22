import sharp from "sharp";
import fs from "fs";
import path from "path";

const OUT = path.join(process.cwd(), "public", "icons");
const SRC_DIR = path.join(process.cwd(), "public", "icons", "source");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SRC_DIR, { recursive: true });

/** Master: edge-to-edge Toss blue + bold 일 (crisp at tiny sizes) */
function iconSvg(size, { pad = 0, maskable = false } = {}) {
  const s = size;
  // Maskable safe zone ~80% — extra inset
  const inset = maskable ? s * 0.18 : pad;
  const inner = s - inset * 2;
  // Glyph box
  const fontSize = Math.round(inner * 0.58);
  const cy = s / 2 + fontSize * 0.08;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" fill="#3182F6"/>
  <text
    x="50%"
    y="${cy}"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="Apple SD Gothic Neo, Noto Sans KR, Malgun Gothic, Pretendard, sans-serif"
    font-size="${fontSize}"
    font-weight="700"
    fill="#FFFFFF"
    letter-spacing="-0.04em"
  >일</text>
  <!-- tiny check accent: readable at 32+, fades into 일 at 16 -->
  <g transform="translate(${s * 0.68}, ${s * 0.66}) scale(${s / 512})">
    <circle cx="0" cy="0" r="48" fill="#FFFFFF"/>
    <path d="M-22 2 L-6 18 L24 -16" fill="none" stroke="#3182F6" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

/** Simpler 16px-friendly: no check badge (too noisy) */
function iconSvgTiny(size) {
  const s = size;
  const fontSize = Math.round(s * 0.62);
  const cy = s / 2 + fontSize * 0.06;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" fill="#3182F6"/>
  <text
    x="50%"
    y="${cy}"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="Apple SD Gothic Neo, Noto Sans KR, Malgun Gothic, Pretendard, sans-serif"
    font-size="${fontSize}"
    font-weight="800"
    fill="#FFFFFF"
  >일</text>
</svg>`;
}

async function raster(svg, file, size) {
  const buf = Buffer.from(svg);
  await sharp(buf)
    .resize(size, size, { fit: "fill" })
    .png({ compressionLevel: 9, palette: false })
    .toFile(file);
  console.log("wrote", file, size);
}

async function main() {
  // Master 1024 (with check)
  const masterSvg = iconSvg(1024);
  const masterPath = path.join(SRC_DIR, "ilbiseo-icon-1024.png");
  await raster(masterSvg, masterPath, 1024);
  fs.writeFileSync(path.join(SRC_DIR, "ilbiseo-icon.svg"), iconSvg(512));

  // App icons — 192/512 use check badge; apple 180 too
  await raster(iconSvg(512), path.join(OUT, "icon-512.png"), 512);
  await raster(iconSvg(192), path.join(OUT, "icon-192.png"), 192);
  await raster(iconSvg(180), path.join(OUT, "apple-touch-icon.png"), 180);
  await raster(iconSvg(512, { maskable: true }), path.join(OUT, "maskable-512.png"), 512);

  // Favicon sizes (tiny: no badge)
  await raster(iconSvgTiny(32), path.join(OUT, "favicon-32.png"), 32);
  await raster(iconSvgTiny(16), path.join(OUT, "favicon-16.png"), 16);
  await raster(iconSvgTiny(48), path.join(OUT, "icon-48.png"), 48);

  // Multi-size ICO from 16+32+48
  const png16 = await sharp(Buffer.from(iconSvgTiny(16))).png().toBuffer();
  const png32 = await sharp(Buffer.from(iconSvgTiny(32))).png().toBuffer();
  const png48 = await sharp(Buffer.from(iconSvgTiny(48))).png().toBuffer();
  // Simple ICO writer (PNG-in-ICO)
  const ico = buildIco([
    { size: 16, png: png16 },
    { size: 32, png: png32 },
    { size: 48, png: png48 },
  ]);
  fs.writeFileSync(path.join(OUT, "favicon.ico"), ico);
  fs.writeFileSync(path.join(process.cwd(), "public", "favicon.ico"), ico);
  console.log("wrote favicon.ico");

  // Preview grid for store media
  const previewOut = "/cursor/stores/self/media/ilbiseo-icon-preview.png";
  await buildPreview(previewOut, {
    master: masterPath,
    s512: path.join(OUT, "icon-512.png"),
    s192: path.join(OUT, "icon-192.png"),
    s180: path.join(OUT, "apple-touch-icon.png"),
    s48: path.join(OUT, "icon-48.png"),
    s32: path.join(OUT, "favicon-32.png"),
    s16: path.join(OUT, "favicon-16.png"),
    mask: path.join(OUT, "maskable-512.png"),
  });
  console.log("wrote", previewOut);
}

function buildIco(images) {
  // ICONDIR + ICONDIRENTRY + PNG data
  const count = images.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const entries = [];
  for (const img of images) {
    entries.push({
      width: img.size >= 256 ? 0 : img.size,
      height: img.size >= 256 ? 0 : img.size,
      bytes: img.png.length,
      offset,
      png: img.png,
    });
    offset += img.png.length;
  }
  const buf = Buffer.alloc(offset);
  buf.writeUInt16LE(0, 0);
  buf.writeUInt16LE(1, 2); // ICO
  buf.writeUInt16LE(count, 4);
  let eoff = 6;
  for (const e of entries) {
    buf.writeUInt8(e.width, eoff);
    buf.writeUInt8(e.height, eoff + 1);
    buf.writeUInt8(0, eoff + 2);
    buf.writeUInt8(0, eoff + 3);
    buf.writeUInt16LE(1, eoff + 4);
    buf.writeUInt16LE(32, eoff + 6);
    buf.writeUInt32LE(e.bytes, eoff + 8);
    buf.writeUInt32LE(e.offset, eoff + 12);
    e.png.copy(buf, e.offset);
    eoff += 16;
  }
  return buf;
}

async function buildPreview(outPath, files) {
  const W = 1200;
  const H = 700;
  const bg = "#F2F4F6";
  const cells = [
    { label: "1024", file: files.master, size: 220 },
    { label: "512", file: files.s512, size: 160 },
    { label: "maskable", file: files.mask, size: 160 },
    { label: "192", file: files.s192, size: 120 },
    { label: "180 apple", file: files.s180, size: 110 },
    { label: "48", file: files.s48, size: 48 },
    { label: "32", file: files.s32, size: 32 },
    { label: "16", file: files.s16, size: 16 },
  ];

  const parts = [];
  let x = 48;
  let y = 100;
  const rowH = 280;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (i === 5) {
      x = 48;
      y = 100 + rowH;
    }
    const img = await sharp(c.file)
      .resize(c.size, c.size, { fit: "fill" })
      .png()
      .toBuffer();
    // card
    const cardW = Math.max(c.size + 40, 100);
    const cardH = c.size + 70;
    const card = await sharp({
      create: {
        width: cardW,
        height: cardH,
        channels: 4,
        background: "#FFFFFF",
      },
    })
      .png()
      .toBuffer();

    const labelSvg = Buffer.from(`<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${cardW}" height="28">
  <text x="50%" y="20" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#4E5968">${c.label}</text>
</svg>`);

    const cell = await sharp(card)
      .composite([
        {
          input: img,
          left: Math.round((cardW - c.size) / 2),
          top: 16,
        },
        {
          input: await sharp(labelSvg).png().toBuffer(),
          left: 0,
          top: cardH - 32,
        },
      ])
      .png()
      .toBuffer();

    parts.push({ input: cell, left: x, top: y });
    x += cardW + 28;
  }

  const title = Buffer.from(`<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="70">
  <text x="48" y="48" font-family="sans-serif" font-size="28" font-weight="700" fill="#191F28">일비서 app icon</text>
  <text x="320" y="48" font-family="sans-serif" font-size="16" fill="#8B95A1">Toss blue #3182F6 · 일 monogram</text>
</svg>`);

  await sharp({
    create: { width: W, height: H, channels: 3, background: bg },
  })
    .composite([
      { input: await sharp(title).png().toBuffer(), left: 0, top: 8 },
      ...parts,
    ])
    .png()
    .toFile(outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
