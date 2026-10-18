/**
 * Post-process ExcelJS .xlsx buffers so Microsoft Excel opens without
 * 「이 파일에 오류가 생겼습니다」/ content-repair prompts.
 *
 * Known ExcelJS issues we patch:
 * 1) Table XML: totalsRow=false still emits totalsRowShown="1"
 * 2) Table columns: stray totalsRowLabel / totalsRowFunction when no totals
 * 3) Worksheet pageSetup: horizontalDpi/verticalDpi = 4294967295 (−1 as uint32)
 * 4) Worksheet element order: legacyDrawing after tableParts (from cell notes)
 *    — preferred fix is not emitting notes; we also drop orphan comment/VML parts
 *
 * @see exceljs lib/xlsx/xform/table/table-xform.js
 *   totalsRowShown: model.totalsRow ? undefined : '1'  // inverted / wrong
 */
import JSZip from "jszip";

/** OOXML / XML 1.0: disallow most C0 controls (keep tab, LF, CR). */
export function sanitizeExcelText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function toArrayBuffer(
  buffer: ArrayBuffer | ArrayBufferView,
): ArrayBuffer {
  if (buffer instanceof ArrayBuffer) return buffer;
  const view = buffer as ArrayBufferView;
  return view.buffer.slice(
    view.byteOffset,
    view.byteOffset + view.byteLength,
  ) as ArrayBuffer;
}

function repairTableXml(xml: string): string {
  const hasTotalsRow = /totalsRowCount="1"/.test(xml);
  if (hasTotalsRow) return xml;
  let out = xml.replace(/totalsRowShown="1"/g, 'totalsRowShown="0"');
  // ExcelJS stamps these even without a totals row — Office may repair
  out = out.replace(/\s+totalsRowLabel="[^"]*"/g, "");
  out = out.replace(/\s+totalsRowFunction="none"/g, "");
  return out;
}

/** ExcelJS writes dpi=-1 → uint32 4294967295; strip those attributes. */
function repairWorksheetXml(xml: string): string {
  let out = xml.replace(
    /\s(horizontalDpi|verticalDpi)="4294967295"/g,
    "",
  );
  // If legacyDrawing appears after tableParts, move it before tableParts
  // (ECMA-376: legacyDrawing precedes tableParts).
  const legacy = out.match(/<legacyDrawing\b[^/]*\/>/);
  const tableParts = out.match(/<tableParts\b[\s\S]*?<\/tableParts>/);
  if (
    legacy &&
    tableParts &&
    out.indexOf(legacy[0]) > out.indexOf(tableParts[0])
  ) {
    out = out.replace(legacy[0], "");
    out = out.replace(tableParts[0], `${legacy[0]}${tableParts[0]}`);
  }
  return out;
}

/**
 * Fix OOXML inside an .xlsx buffer so Office opens without repair.
 */
export async function repairExcelJsTableXml(
  buffer: ArrayBuffer | ArrayBufferView,
): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(toArrayBuffer(buffer));
  const tasks: Promise<void>[] = [];

  zip.forEach((relativePath, file) => {
    if (file.dir) return;
    if (relativePath.startsWith("xl/tables/") && relativePath.endsWith(".xml")) {
      tasks.push(
        (async () => {
          const xml = await file.async("string");
          zip.file(relativePath, repairTableXml(xml));
        })(),
      );
      return;
    }
    if (
      relativePath.startsWith("xl/worksheets/") &&
      relativePath.endsWith(".xml") &&
      !relativePath.includes("/_rels/")
    ) {
      tasks.push(
        (async () => {
          const xml = await file.async("string");
          zip.file(relativePath, repairWorksheetXml(xml));
        })(),
      );
    }
  });

  await Promise.all(tasks);
  const out = await zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return out;
}

/** Patterns that commonly trigger Microsoft Excel repair dialogs. */
export const EXCEL_REPAIR_BAD_PATTERNS = [
  { id: "totalsRowShown-1", re: /totalsRowShown="1"/ },
  { id: "bad-dpi", re: /(horizontalDpi|verticalDpi)="4294967295"/ },
] as const;

/**
 * Return bad-pattern ids found in an xlsx buffer (empty = clean).
 * Also flags legacyDrawing appearing after tableParts in any sheet.
 */
export async function findExcelRepairRisks(
  buffer: ArrayBuffer | ArrayBufferView,
): Promise<string[]> {
  const zip = await JSZip.loadAsync(toArrayBuffer(buffer));
  const risks: string[] = [];
  const names = Object.keys(zip.files);

  for (const name of names) {
    if (zip.files[name].dir) continue;
    if (!name.endsWith(".xml") && !name.endsWith(".vml")) continue;
    const xml = await zip.file(name)!.async("string");
    for (const p of EXCEL_REPAIR_BAD_PATTERNS) {
      if (p.re.test(xml) && !risks.includes(p.id)) risks.push(p.id);
    }
    if (
      name.startsWith("xl/worksheets/") &&
      !name.includes("/_rels/")
    ) {
      const legacyIdx = xml.search(/<legacyDrawing\b/);
      const tableIdx = xml.search(/<tableParts\b/);
      if (legacyIdx >= 0 && tableIdx >= 0 && legacyIdx > tableIdx) {
        if (!risks.includes("legacyDrawing-after-tableParts")) {
          risks.push("legacyDrawing-after-tableParts");
        }
      }
    }
  }
  return risks;
}
