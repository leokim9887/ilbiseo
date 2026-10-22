import sharp from "sharp";
import fs from "fs";
import path from "path";

/**
 * 일비서 own-brand icons — sage teal + champagne gold (product DNA).
 * Not Toss blue / Kakao yellow / Notion mono.
 */
const SAGE = "#163F39";
const SAGE_MID = "#1A4D45";
const GOLD = "#C9B27C";
const CREAM = "#FFFCF8";
const INK_LINE = "#1A4D45";

const OUT = path.join(process.cwd(), "public", "icons");
const SRC_DIR = path.join(OUT, "source");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SRC_DIR, { recursive: true });

/** Full mark: cream note card + gold check + two sage lines */
function iconSvg(size, { maskable = false, tiny = false } = {}) {
  const s = size;
  const inset = maskable ? s * 0.18 : 0;
  // Card geometry in 0–100 viewBox units then scale
  const vb = 100;
  const scale = s / vb;
  // Card
  const cx = 50;
  const cy = maskable ? 50 : 50;
  const cardW = tiny ? 58 : 54;
  const cardH = tiny ? 64 : 60;
  const cardX = cx - cardW / 2;
  const cardY = cy - cardH / 2;
  const r = tiny ? 10 : 12;

  const checkCx = cardX + (tiny ? 14 : 13);
  const checkCy = cardY + (tiny ? 20 : 18);
  const checkR = tiny ? 8 : 7.5;

  const line1X = checkCx + checkR + (tiny ? 5 : 6);
  const line1Y = checkCy;
  const line2Y = checkCy + (tiny ? 16 : 15);
  const lineW = cardX + cardW - line1X - (tiny ? 10 : 9);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${vb} ${vb}">
  <rect width="${vb}" height="${vb}" fill="${SAGE}"/>
  ${
    maskable
      ? ""
      : ""
  }
  <!-- cream task card -->
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${r}" ry="${r}" fill="${CREAM}"/>
  <!-- gold check circle -->
  <circle cx="${checkCx}" cy="${checkCy}" r="${checkR}" fill="${GOLD}"/>
  <path d="M${checkCx - 3.2} ${checkCy + 0.3} L${checkCx - 0.8} ${checkCy + 2.8} L${checkCx + 3.5} ${checkCy - 2.6}"
    fill="none" stroke="${SAGE}" stroke-width="${tiny ? 2.4 : 2.2}" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- task lines -->
  <rect x="${line1X}" y="${line1Y - 1.6}" width="${lineW}" height="${tiny ? 3.2 : 3}" rx="1.5" fill="${INK_LINE}" opacity="0.85"/>
  <rect x="${checkCx - checkR}" y="${line2Y - 1.6}" width="${lineW + checkR * 2 + (tiny ? 5 : 6)}" height="${tiny ? 3.2 : 3}" rx="1.5" fill="${INK_LINE}" opacity="0.45"/>
  ${
    tiny
      ? ""
      : `<!-- third quiet line -->
  <rect x="${checkCx - checkR}" y="${line2Y + 12}" width="${lineW * 0.72 + checkR * 2}" height="2.6" rx="1.3" fill="${INK_LINE}" opacity="0.28"/>`
  }
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
  const W = 1200;
  const H = 700;
  const bg = "#EBE6DF";
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
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (i === 5) {
      x = 48;
      y = 380;
    }
    const img = await sharp(c.file).resize(c.size, c.size).png().toBuffer();
    const cardW = Math.max(c.size + 40, 100);
    const cardH = c.size + 70;
    const card = await sharp({
      create: {
        width: cardW,
        height: cardH,
        channels: 4,
        background: "#FFFCF8",
      },
    })
      .png()
      .toBuffer();
    const labelSvg = Buffer.from(`<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${cardW}" height="28">
  <text x="50%" y="20" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#454D48">${c.label}</text>
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
  <text x="48" y="44" font-family="sans-serif" font-size="26" font-weight="700" fill="#163F39">일비서 app icon</text>
  <text x="300" y="44" font-family="sans-serif" font-size="15" fill="#6B736C">sage #163F39 · cream · gold #C9B27C</text>
</svg>`);
  await sharp({
    create: { width: W, height: H, channels: 3, background: bg },
  })
    .composite([
      { input: await sharp(title).png().toBuffer(), left: 0, top: 10 },
      ...parts,
    ])
    .png()
    .toFile(outPath);
  console.log("wrote", outPath);
}

async function main() {
  const masterSvg = iconSvg(1024);
  const masterPath = path.join(SRC_DIR, "ilbiseo-icon-1024.png");
  await raster(masterSvg, masterPath, 1024);
  fs.writeFileSync(path.join(SRC_DIR, "ilbiseo-icon.svg"), iconSvg(512));

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
  console.log("wrote favicon.ico");

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
