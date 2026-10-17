/**
 * ExcelJS Table writer bug: when totalsRow=false it still emits
 * totalsRowShown="1", which makes Microsoft Excel offer repair on open.
 * Also strip illegal XML 1.0 control chars from shared strings if present.
 *
 * @see exceljs lib/xlsx/xform/table/table-xform.js
 *   totalsRowShown: model.totalsRow ? undefined : '1'  // inverted / wrong
 */
import JSZip from "jszip";

/** OOXML / XML 1.0: disallow most C0 controls (keep tab, LF, CR). */
export function sanitizeExcelText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

/**
 * Fix table*.xml inside an .xlsx buffer so Office opens without repair.
 * - totalsRowShown="1" → "0" when totalsRowCount is absent (no totals row)
 * - drop stray totalsRowLabel on columns when no totals row
 */
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

export async function repairExcelJsTableXml(
  buffer: ArrayBuffer | ArrayBufferView,
): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(toArrayBuffer(buffer));
  const tasks: Promise<void>[] = [];

  zip.forEach((relativePath, file) => {
    if (!relativePath.startsWith("xl/tables/") || !relativePath.endsWith(".xml")) {
      return;
    }
    if (file.dir) return;
    tasks.push(
      (async () => {
        let xml = await file.async("string");
        const hasTotalsRow = /totalsRowCount="1"/.test(xml);
        if (!hasTotalsRow) {
          xml = xml.replace(
            /totalsRowShown="1"/g,
            'totalsRowShown="0"',
          );
          // ExcelJS still stamps totalsRowLabel on col 1 even without totals
          xml = xml.replace(/\s+totalsRowLabel="Total"/g, "");
        }
        zip.file(relativePath, xml);
      })(),
    );
  });

  await Promise.all(tasks);
  const out = await zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return out;
}
