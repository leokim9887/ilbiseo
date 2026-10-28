/**
 * Client-only helpers for Samsung Voice Recorder / voice-memo imports.
 *
 * Browsers cannot decode Samsung's proprietary in-file transcription.
 * We accept audio (+ optional .txt sidecar / paste) and reuse voice-row parse.
 */

export const SAMSUNG_VOICE_AUDIO_ACCEPT =
  "audio/*,.m4a,.mp3,.wav,.amr,.3gp,.aac,.ogg,.txt,.text";

const AUDIO_EXT = new Set([
  "m4a",
  "mp3",
  "wav",
  "amr",
  "3gp",
  "aac",
  "ogg",
  "oga",
  "webm",
  "caf",
]);

const TEXT_EXT = new Set(["txt", "text", "md"]);

export function fileExtension(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const i = base.lastIndexOf(".");
  if (i < 0) return "";
  return base.slice(i + 1).toLowerCase();
}

export function fileBasename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const i = base.lastIndexOf(".");
  if (i < 0) return base;
  return base.slice(0, i);
}

export function isVoiceMemoAudioFile(file: File): boolean {
  const ext = fileExtension(file.name);
  if (AUDIO_EXT.has(ext)) return true;
  if (file.type.startsWith("audio/")) return true;
  return false;
}

export function isTranscriptTextFile(file: File): boolean {
  const ext = fileExtension(file.name);
  if (TEXT_EXT.has(ext)) return true;
  return (
    file.type === "text/plain" ||
    file.type === "text/markdown" ||
    file.type.startsWith("text/")
  );
}

export type SamsungVoicePickResult = {
  audio: File | null;
  /** Sidecar transcript matched by basename, or lone .txt if no audio yet. */
  transcriptFile: File | null;
  transcriptText: string | null;
  warnings: string[];
};

/**
 * From a multi-file picker (audio + optional .txt), pick the audio and a
 * same-basename transcript sidecar when present.
 */
export async function pickSamsungVoiceFiles(
  files: FileList | File[],
): Promise<SamsungVoicePickResult> {
  const list = Array.from(files);
  const warnings: string[] = [];
  const audios = list.filter(isVoiceMemoAudioFile);
  const texts = list.filter(isTranscriptTextFile);

  if (audios.length === 0 && texts.length === 0) {
    return {
      audio: null,
      transcriptFile: null,
      transcriptText: null,
      warnings: [
        "음성 파일(.m4a · .mp3 · .wav · .amr · .3gp) 또는 글(.txt)을 골라 주세요.",
      ],
    };
  }

  const audio = audios[0] ?? null;
  if (audios.length > 1) {
    warnings.push(
      `음성 파일이 ${audios.length}개라서 「${audio!.name}」만 씁니다.`,
    );
  }

  let transcriptFile: File | null = null;
  if (audio && texts.length > 0) {
    const stem = fileBasename(audio.name).toLowerCase();
    transcriptFile =
      texts.find((t) => fileBasename(t.name).toLowerCase() === stem) ?? null;
    if (!transcriptFile && texts.length === 1) {
      // Father often picks one audio + one txt with slightly different names.
      transcriptFile = texts[0];
      if (fileBasename(texts[0].name).toLowerCase() !== stem) {
        warnings.push(
          `글 파일 이름이 음성과 달라 「${texts[0].name}」을(를) 받아쓰기로 씁니다.`,
        );
      }
    } else if (!transcriptFile && texts.length > 1) {
      warnings.push(
        "같은 이름(.txt) 글 파일을 찾지 못했습니다. 아래 칸에 붙여 넣어 주세요.",
      );
    }
  } else if (!audio && texts.length > 0) {
    transcriptFile = texts[0];
    if (texts.length > 1) {
      warnings.push(`글 파일이 여러 개라서 「${texts[0].name}」만 씁니다.`);
    }
  }

  let transcriptText: string | null = null;
  if (transcriptFile) {
    try {
      transcriptText = (await transcriptFile.text()).replace(/^\uFEFF/, "").trim();
      if (!transcriptText) {
        warnings.push("글 파일이 비어 있습니다.");
        transcriptText = null;
      }
    } catch {
      warnings.push("글 파일을 읽지 못했습니다. 아래 칸에 붙여 넣어 주세요.");
      transcriptText = null;
    }
  }

  return { audio, transcriptFile, transcriptText, warnings };
}

/** Father-facing limit copy (no server STT). */
export function samsungVoiceMemoLimitsCopy(): string {
  return (
    "파일 안 자동 받아쓰기는 브라우저가 읽을 수 없습니다. " +
    "재생하며 「이 내용으로 받아쓰기」하거나, 삼성 음성녹음 앱의 글을 붙여 넣어 주세요. " +
    "(서버 유료 음성 인식 없음)"
  );
}
