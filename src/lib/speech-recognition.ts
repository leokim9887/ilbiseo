/**
 * Web Speech API helpers for mobile Chrome / Samsung Internet / Android PWA.
 * iOS Safari support is limited — callers should degrade gracefully.
 */

export type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((ev: Event) => void) | null;
  onend: ((ev: Event) => void) | null;
  onerror: ((ev: Event & { error?: string }) => void) | null;
  onresult: ((ev: SpeechRecognitionResultEventLike) => void) | null;
};

export type SpeechRecognitionResultEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
    length: number;
  }>;
};

type SpeechCtor = new () => SpeechRecognitionLike;

export function getSpeechRecognitionCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() != null;
}

/** Father-facing Korean reason when mic / speech is unavailable. */
export function speechUnsupportedMessage(): string {
  return (
    "이 브라우저에서는 음성 입력을 쓸 수 없습니다.\n" +
    "Android에서는 Chrome 또는 Samsung Internet으로 열어 주세요.\n" +
    "(홈 화면에 추가한 일비서도 됩니다.)\niPhone Safari는 지원이 제한적입니다."
  );
}

export type SpeechListenHandlers = {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
};

export function createKoreanSpeechRecognition(
  handlers: SpeechListenHandlers,
): SpeechRecognitionLike | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "ko-KR";
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onstart = () => handlers.onStart?.();
  rec.onend = () => handlers.onEnd?.();
  rec.onerror = (ev) => {
    const code = (ev as { error?: string }).error ?? "error";
    if (code === "aborted" || code === "no-speech") {
      handlers.onError?.(
        code === "no-speech"
          ? "말씀이 들리지 않았습니다. 다시 눌러 말씀해 주세요."
          : "음성 인식이 취소되었습니다.",
      );
      return;
    }
    if (code === "not-allowed" || code === "service-not-allowed") {
      handlers.onError?.(
        "마이크 권한이 필요합니다. 브라우저 설정에서 마이크를 허용해 주세요.",
      );
      return;
    }
    handlers.onError?.(`음성 인식 오류: ${code}`);
  };
  rec.onresult = (ev) => {
    let interim = "";
    let finals = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const row = ev.results[i];
      const piece = row[0]?.transcript ?? "";
      if (row.isFinal) finals += piece;
      else interim += piece;
    }
    if (interim) handlers.onInterim?.(interim);
    if (finals) handlers.onFinal?.(finals.trim());
  };
  return rec;
}
