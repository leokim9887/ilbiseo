/**
 * Pure Excel save policy (no DOM / IndexedDB).
 * Used by excel-link and unit smokes.
 */

export type ExcelWriteErrorKind =
  | "not_found"
  | "locked"
  | "permission"
  | "unknown";

export type ExcelSaveResult =
  | { mode: "overwrite"; fileName: string }
  | { mode: "created"; fileName: string }
  | {
      mode: "download";
      fileName: string;
      reason: "unsupported" | "fallback";
    }
  | { mode: "cancelled" }
  | {
      mode: "error";
      kind: ExcelWriteErrorKind;
      message: string;
      fileName?: string;
    };

/** Map FS / DOM errors to father-friendly kinds + Korean copy */
export function classifyExcelWriteError(e: unknown): {
  kind: ExcelWriteErrorKind;
  message: string;
} {
  const name =
    e && typeof e === "object" && "name" in e
      ? String((e as { name?: string }).name ?? "")
      : "";
  const raw =
    e instanceof Error
      ? e.message
      : typeof e === "string"
        ? e
        : "엑셀 저장에 실패했습니다.";
  const lower = `${name} ${raw}`.toLowerCase();

  if (
    name === "NotFoundError" ||
    lower.includes("not found") ||
    lower.includes("no longer exists") ||
    lower.includes("could not be found")
  ) {
    return {
      kind: "not_found",
      message:
        "예전에 고른 엑셀 파일을 찾지 못했습니다. 「다른 이름으로 저장」으로 다시 골라 주세요.",
    };
  }

  if (
    name === "NoModificationAllowedError" ||
    name === "InvalidStateError" ||
    lower.includes("being used") ||
    lower.includes("in use") ||
    lower.includes("locked") ||
    lower.includes("access denied") ||
    lower.includes("cannot acquire") ||
    lower.includes("failed to create") ||
    lower.includes("sharing")
  ) {
    return {
      kind: "locked",
      message:
        "엑셀 파일이 열려 있거나 잠겨 있습니다. 파일을 닫은 뒤 다시 「엑셀 파일 저장」을 눌러 주세요.",
    };
  }

  if (
    name === "NotAllowedError" ||
    name === "SecurityError" ||
    lower.includes("permission") ||
    lower.includes("권한")
  ) {
    return {
      kind: "permission",
      message:
        "파일 쓰기 권한이 필요합니다. 허용을 누르거나, 「다른 이름으로 저장」으로 다시 연결해 주세요.",
    };
  }

  return {
    kind: "unknown",
    message: raw.includes("엑셀")
      ? raw
      : `엑셀 저장에 실패했습니다. 잠시 후 다시 시도해 주세요. (${raw})`,
  };
}

/**
 * - forceNewFile → picker
 * - no handle → picker
 * - handle + overwrite fail → error (never auto-picker)
 * - handle → overwrite
 */
export function resolveSaveStrategy(input: {
  forceNewFile: boolean;
  hasStoredHandle: boolean;
  overwriteError?: ExcelWriteErrorKind | null;
}): "picker" | "overwrite" | "error" {
  if (input.forceNewFile) return "picker";
  if (!input.hasStoredHandle) return "picker";
  if (input.overwriteError) return "error";
  return "overwrite";
}

export function excelSaveToastMessage(result: ExcelSaveResult): string | null {
  switch (result.mode) {
    case "overwrite":
      return result.fileName
        ? `저장했습니다 · ${result.fileName}`
        : "기존 파일에 저장했습니다";
    case "created":
      return `저장했습니다 · ${result.fileName}`;
    case "download":
      return result.reason === "unsupported"
        ? `다운로드로 저장했습니다 · ${result.fileName}`
        : `다운로드로 저장했습니다 · ${result.fileName}`;
    case "error":
      return result.message;
    case "cancelled":
      return null;
  }
}

/** True when stored handle name must change to today’s dated stamp. */
export function needsDatedExcelRename(
  currentName: string | null | undefined,
  desiredName: string,
): boolean {
  if (!currentName) return true;
  return currentName !== desiredName;
}
