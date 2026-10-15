/**
 * Excel import: no urgency in targets / template; old 시급성 columns skipped.
 */
import {
  IMPORT_TARGET_FIELDS,
  IMPORT_FIELD_LABEL,
  autoMapHeaders,
  isIlbiseoTemplate,
  applySavedOrAuto,
  sheetToTasks,
  buildPreviewRows,
  sanitizeMapping,
  suggestFieldForHeader,
  type ParsedSheet,
} from "../src/lib/excel-import";

function ok(name: string, cond: boolean, detail?: unknown) {
  if (!cond) {
    console.error("FAIL", name, detail);
    process.exit(1);
  }
  console.log("ok", name, detail ?? "");
}

const classicHeaders = [
  "순서",
  "할일 LIST UP",
  "마감목표",
  "중요도",
  "시급성",
  "완료여부",
];
const newHeaders = [
  "순서",
  "틀",
  "할일 LIST UP",
  "마감목표",
  "중요도",
  "완료여부",
];

ok(
  "targets-no-urgency",
  !IMPORT_TARGET_FIELDS.includes("urgency"),
  IMPORT_TARGET_FIELDS.map((f) => IMPORT_FIELD_LABEL[f]),
);

ok("suggest-urgency-skip", suggestFieldForHeader("시급성") === "skip");
ok("suggest-urgency-en-skip", suggestFieldForHeader("urgency") === "skip");

ok("template-new", isIlbiseoTemplate(newHeaders));
ok("template-classic-with-urgency", isIlbiseoTemplate(classicHeaders));
ok(
  "template-no-importance-not-match",
  !isIlbiseoTemplate(["할일 LIST UP", "마감목표", "시급성", "완료여부"]),
);

const autoClassic = autoMapHeaders(classicHeaders);
ok("auto-skips-urgency", autoClassic["시급성"] === "skip", autoClassic);
ok("auto-maps-importance", autoClassic["중요도"] === "importance", autoClassic);

const savedWithUrgency = {
  "할일 LIST UP": "title" as const,
  마감목표: "deadline" as const,
  중요도: "importance" as const,
  시급성: "urgency" as const,
};
const merged = applySavedOrAuto(classicHeaders, savedWithUrgency);
ok("saved-urgency-coerced-skip", merged["시급성"] === "skip", merged);
ok("sanitize", sanitizeMapping(savedWithUrgency)["시급성"] === "skip");

const sheet: ParsedSheet = {
  name: "할 일",
  headers: classicHeaders,
  rows: [
    {
      순서: 1,
      "할일 LIST UP": "보고서\n메모",
      마감목표: "2026-10-15",
      중요도: 3,
      시급성: 3,
      완료여부: "",
    },
  ],
};
const tasks = sheetToTasks(sheet, autoClassic, "work");
ok("import-count", tasks.length === 1, tasks);
ok("import-ignores-urgency-value", tasks[0].urgency === 1, tasks[0]);
ok("import-keeps-importance", tasks[0].importance === 3, tasks[0]);

const preview = buildPreviewRows(sheet, autoClassic, "work");
ok("preview-no-urgency-field", !("urgency" in preview[0]), preview[0]);
ok("preview-importance", preview[0].importance === 3);

console.log("all passed");
