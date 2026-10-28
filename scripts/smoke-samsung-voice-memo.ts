/**
 * Smoke for Samsung voice-memo file helpers — run via:
 *   npx tsx scripts/smoke-samsung-voice-memo.ts
 */
import {
  fileBasename,
  fileExtension,
  isTranscriptTextFile,
  isVoiceMemoAudioFile,
  pickSamsungVoiceFiles,
  samsungVoiceMemoLimitsCopy,
} from "../src/lib/samsung-voice-memo";
import { parseVoiceRowAdd } from "../src/lib/voice-row-parse";

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

eq("ext m4a", fileExtension("Voice 001.m4a"), "m4a");
eq("basename", fileBasename("Voice 001.m4a"), "Voice 001");
eq("ext path", fileExtension("folder/rec.AMR"), "amr");

const audio = new File([new Uint8Array([0])], "회의.m4a", {
  type: "audio/mp4",
});
const sidecar = new File(
  ["보고서 쓰기 메모 급함 마감 오늘 중요도 높음"],
  "회의.txt",
  { type: "text/plain" },
);
const otherTxt = new File(["다른 글"], "메모.txt", { type: "text/plain" });

eq("is audio m4a", isVoiceMemoAudioFile(audio), true);
eq("is text", isTranscriptTextFile(sidecar), true);
eq("audio not text", isTranscriptTextFile(audio), false);

async function main() {
  const matched = await pickSamsungVoiceFiles([audio, sidecar]);
  eq("pick audio name", matched.audio?.name, "회의.m4a");
  eq("pick sidecar text", matched.transcriptText?.includes("보고서"), true);
  eq("pick warnings empty", matched.warnings.length, 0);

  const loose = await pickSamsungVoiceFiles([audio, otherTxt]);
  eq("loose sidecar uses lone txt", loose.transcriptText, "다른 글");
  eq("loose warns name mismatch", loose.warnings.length > 0, true);

  const bad = await pickSamsungVoiceFiles([
    new File(["x"], "notes.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  ]);
  eq("reject unknown", bad.audio, null);
  eq("reject has warning", bad.warnings.length > 0, true);

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const parsed = parseVoiceRowAdd(matched.transcriptText!, { today });
  eq("sidecar parses title", parsed.title, "보고서 쓰기");
  eq("sidecar parses imp", parsed.importance, 3);

  const limits = samsungVoiceMemoLimitsCopy();
  eq("limits mentions browser", limits.includes("브라우저"), true);
  eq("limits no paid api", limits.includes("유료"), true);

  if (failed) {
    console.error(`${failed} failed`);
    process.exit(1);
  }
  console.log("all ok");
}

void main();
