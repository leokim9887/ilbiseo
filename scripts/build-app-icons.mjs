import sharp from "sharp";
import fs from "fs";
import path from "path";

/**
 * 일비서 icon — refined layout of the classic mark:
 * dark teal field · white rounded card · 3 list lines (dark / tan / dark).
 * Layout polish only; same identity as media/ilbiseo-icon-reference.png
 */
const FIELD = "#0B5058"; // classic teal from prior icon DNA
const CARD = "#F4F7F8";
const LINE_DARK = "#0B5058";
const LINE_ACCENT = "#D4B896"; // muted tan middle line

const OUT = path.join(process.cwd(), "public", "icons");
const SRC = path.join(OUT, "source");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SRC, { recursive: true });

/**
 * viewBox 0–100. Optical centering: card nudged ~0.6 up.
 * Tiny: slightly larger card + thicker bars for 16px clarity.
 */
function iconSvg(size, { maskable = false, tiny = false } = {}) {
  const vb = 100;
  // Card footprint — polished padding (~21% margin → card ~58%)
  const cardW = tiny ? 62 : 56;
  const cardH = tiny ? 68 : 62;
  const cardX = (vb - cardW) / 2;
  // Optical vertical center (cards read low if dead-centered)
  const cardY = (vb - cardH) / 2 - (tiny ? 0.4 : 0.8);
  const cardR = tiny ? 14 : 13.5;

  // Three bars — equal length, pill ends, even rhythm
  const barW = cardW * (tiny ? 0.58 : 0.55);
  const barH = tiny ? 5.8 : 5.2;
  const barR = barH / 2;
  const barX = cardX + (cardW - barW) / 2;
  // Vertical stack: gap ≈ barH * 1.05 for breathability
  const gap = barH * 1.08;
  const stackH = barH * 3 + gap * 2;
  const stackTop = cardY + (cardH - stackH) / 2 + 0.3;

  const bars = [0, 1, 2].map((i) => {
    const y = stackTop + i * (barH + gap);
    const fill = i === 1 ? LINE_ACCENT : LINE_DARK;
    return `<rect x="${barX.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${barH.toFixed(2)}" rx="${barR.toFixed(2)}" fill="${fill}"/>`;
  });

  // Maskable: keep same art but field-only outside safe zone already via smaller card
  const cardScale = maskable ? 0.92 : 1;
  const ox = maskable ? (vb - vb * cardScale) / 2 : 0;
  const oy = maskable ? (vb - vb * cardScale) / 2 : 0;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${vb} ${vb}">
  <rect width="${vb}" height="${vb}" fill="${FIELD}"/>
  <g transform="${maskable ? `translate(${ox},${oy}) scale(${cardScale})` : ""}">
    <rect x="${cardX.toFixed(2)}" y="${cardY.toFixed(2)}" width="${cardW}" height="${cardH}" rx="${cardR}" ry="${cardR}" fill="${CARD}"/>
    ${bars.join("\n    ")}
  </g>
</svg>`;
}

async function raster(svg, file, size) {
  await sharp(Buffer.from(svg))
    .resize(size, size, { fit: "fill" })
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log("wrote", file);
}

function buildIco(images) {
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
  buf.writeUInt16LE(1, 2);
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
  const W = 1280;
  const H = 720;
  const bg = "#E8EEF0";
  const cells = [
    { label: "1024", file: files.master, size: 200 },
    { label: "512", file: files.s512, size: 140 },
    { label: "maskable", file: files.mask, size: 140 },
    { label: "192", file: files.s192, size: 110 },
    { label: "180", file: files.s180, size: 100 },
    { label: "48", file: files.s48, size: 48 },
    { label: "32", file: files.s32, size: 32 },
    { label: "16", file: files.s16, size: 16 },
  ];
  const parts = [];
  let x = 40;
  let y = 120;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (i === 5) {
      x = 40;
      y = 400;
    }
    const img = await sharp(c.file).resize(c.size, c.size).png().toBuffer();
    const cardW = Math.max(c.size + 36, 96);
    const cardH = c.size + 64;
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
  <text x="50%" y="20" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#5A6A6E">${c.label}</text>
</svg>`);
    const cell = await sharp(card)
      .composite([
        {
          input: img,
          left: Math.round((cardW - c.size) / 2),
          top: 14,
        },
        {
          input: await sharp(labelSvg).png().toBuffer(),
          left: 0,
          top: cardH - 30,
        },
      ])
      .png()
      .toBuffer();
    parts.push({ input: cell, left: x, top: y });
    x += cardW + 24;
  }

  // Optional before/after strip at top-right
  let beforeAfter = [];
  const refPath = "/cursor/stores/self/media/ilbiseo-icon-reference.png";
  if (fs.existsSync(refPath)) {
    const before = await sharp(refPath)
      .resize(72, 72, { kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();
    const after = await sharp(files.s192).resize(72, 72).png().toBuffer();
    const baSvg = Buffer.from(`<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="220" height="100">
  <text x="36" y="14" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#5A6A6E">before</text>
  <text x="140" y="14" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#5A6A6E">after</text>
</svg>`);
    beforeAfter = [
      { input: await sharp(baSvg).png().toBuffer(), left: 980, top: 18 },
      { input: before, left: 1000, top: 36 },
      { input: after, left: 1104, top: 36 },
    ];
  }

  const title = Buffer.from(`<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="80">
  <text x="40" y="42" font-family="sans-serif" font-size="26" font-weight="700" fill="#0B5058">일비서 icon · layout refine</text>
  <text x="40" y="66" font-family="sans-serif" font-size="14" fill="#6B7A7E">teal field · white card · 3 lines (dark / tan / dark)</text>
</svg>`);

  await sharp({
    create: { width: W, height: H, channels: 3, background: bg },
  })
    .composite([
      { input: await sharp(title).png().toBuffer(), left: 0, top: 8 },
      ...beforeAfter,
      ...parts,
    ])
    .png()
    .toFile(outPath);
  console.log("wrote", outPath);
}

async function main() {
  const masterPath = path.join(SRC, "ilbiseo-icon-1024.png");
  await raster(iconSvg(1024), masterPath, 1024);
  fs.writeFileSync(path.join(SRC, "ilbiseo-icon.svg"), iconSvg(512));

  await raster(iconSvg(512), path.join(OUT, "icon-512.png"), 512);
  await raster(iconSvg(192), path.join(OUT, "icon-192.png"), 192);
  await raster(iconSvg(180), path.join(OUT, "apple-touch-icon.png"), 180);
  await raster(
    iconSvg(512, { maskable: true }),
    path.join(OUT, "maskable-512.png"),
    512,
  );
  await raster(iconSvg(48, { tiny: true }), path.join(OUT, "icon-48.png"), 48);
  await raster(
    iconSvg(32, { tiny: true }),
    path.join(OUT, "favicon-32.png"),
    32,
  );
  await raster(
    iconSvg(16, { tiny: true }),
    path.join(OUT, "favicon-16.png"),
    16,
  );

  const png16 = await sharp(Buffer.from(iconSvg(16, { tiny: true })))
    .png()
    .toBuffer();
  const png32 = await sharp(Buffer.from(iconSvg(32, { tiny: true })))
    .png()
    .toBuffer();
  const png48 = await sharp(Buffer.from(iconSvg(48, { tiny: true })))
    .png()
    .toBuffer();
  const ico = buildIco([
    { size: 16, png: png16 },
    { size: 32, png: png32 },
    { size: 48, png: png48 },
  ]);
  fs.writeFileSync(path.join(OUT, "favicon.ico"), ico);
  fs.writeFileSync(path.join(process.cwd(), "public", "favicon.ico"), ico);

  await buildPreview("/cursor/stores/self/media/ilbiseo-icon-preview.png", {
    master: masterPath,
    s512: path.join(OUT, "icon-512.png"),
    s192: path.join(OUT, "icon-192.png"),
    s180: path.join(OUT, "apple-touch-icon.png"),
    s48: path.join(OUT, "icon-48.png"),
    s32: path.join(OUT, "favicon-32.png"),
    s16: path.join(OUT, "favicon-16.png"),
    mask: path.join(OUT, "maskable-512.png"),
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
