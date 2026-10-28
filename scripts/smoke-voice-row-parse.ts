/**
 * Unit smoke for parseVoiceRowAdd — run via:
 *   npx tsx scripts/smoke-voice-row-parse.ts
 *   node scripts/smoke-voice-row-parse.mjs
 */
import { parseVoiceRowAdd } from "../src/lib/voice-row-parse";

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const year = Number(today.slice(0, 4));

let failed = 0;
function eq(name: string, got: unknown, exp: unknown) {
  const g = JSON.stringify(got);
  const e = JSON.stringify(exp);
  if (g !== e) {
    console.error("FAIL", name, "\n got ", g, "\n exp ", e);
    failed++;
  } else {
    console.log("ok", name);
  }
}

const ex = parseVoiceRowAdd(
  "업무용에 보고서 쓰기 메모 급함 마감 10월 30일부터 11월 2일 중요도 높음",
  { today },
);
eq("example title", ex.title, "보고서 쓰기");
eq("example memo", ex.memo, "급함");
eq("example imp", ex.importance, 3);
eq("example start", ex.startDate, `${year}-10-30`);
eq("example end", ex.targetDate, `${year}-11-02`);
eq("example kind", ex.kind, "ongoing");
eq("example frame", ex.spokenCategory, "work");

const someday = parseVoiceRowAdd("장보기 마감 언젠가 중요도 낮음", { today });
eq("someday", someday.kind, "someday");
eq("someday dates", [someday.startDate, someday.targetDate], [null, null]);
eq("someday imp", someday.importance, 1);

const same = parseVoiceRowAdd("병원 예약 마감 오늘 중요도 보통", { today });
eq("today", [same.startDate, same.targetDate, same.kind], [
  today,
  today,
  "spot",
]);

const bare = parseVoiceRowAdd("택배 받기", { today });
eq("bare title", bare.title, "택배 받기");
eq("bare default today", bare.deadlineKind, "unset");

const until = parseVoiceRowAdd("보고서 마감 11월 2일까지", { today });
eq("until end", until.targetDate, `${year}-11-02`);

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("smoke-voice-row-parse: all ok");
