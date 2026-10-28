/**
 * Web Speech API helpers for Samsung Internet / Android Chrome / desktop.
 * iOS Safari: webkit path when present; otherwise clear Korean fallback.
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

/** iPhone / iPad / iPod (incl. desktop-mode UA quirks via maxTouchPoints). */
export function isAppleMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ may report as Mac
  return (
    /Macintosh/i.test(ua) &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  );
}

export function isSamsungInternet(): boolean {
  if (typeof navigator === "undefined") return false;
  return /SamsungBrowser/i.test(navigator.userAgent || "");
}

/**
 * Prefer webkitSpeechRecognition on Apple (Safari) so any working iOS path
 * is used; otherwise standard SpeechRecognition first.
 */
export function getSpeechRecognitionCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  if (isAppleMobileDevice()) {
    return w.webkitSpeechRecognition ?? w.SpeechRecognition ?? null;
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() != null;
}

/** Father-facing Korean reason when mic / speech is unavailable. */
export function speechUnsupportedMessage(): string {
  if (isAppleMobileDevice()) {
    return (
      "이 iPhone에서는 말로 넣는 기능이 제한됩니다.\n" +
      "아래 「직접 적기」로 할 일을 입력해 주세요.\n" +
      "(일부 iOS·Safari에서는 마이크가 될 수도 있습니다. 「말하기 시작」을 눌러 보세요.)"
    );
  }
  return (
    "이 브라우저에서는 음성 입력을 쓸 수 없습니다.\n" +
    "Android에서는 Chrome 또는 Samsung Internet으로 열어 주세요.\n" +
    "(홈 화면에 추가한 일비서도 됩니다.)"
  );
}

/** Mic permission denied / blocked. */
export function speechMicPermissionMessage(): string {
  if (isAppleMobileDevice()) {
    return (
      "마이크 권한이 필요합니다.\n" +
      "설정 → Safari(또는 일비서) → 마이크를 허용한 뒤 다시 시도해 주세요.\n" +
      "지금은 「직접 적기」로도 넣을 수 있습니다."
    );
  }
  return (
    "마이크 권한이 필요합니다.\n" +
    "주소창 왼쪽 자물쇠(또는 사이트 설정)에서 마이크를 허용해 주세요.\n" +
    "Samsung Internet: 메뉴 → 사이트 → 권한 → 마이크."
  );
}

/** Short tip shown before / during listen on mobile. */
export function speechListenHint(): string {
  if (isAppleMobileDevice()) {
    return "마이크 허용 창이 뜨면 「허용」을 눌러 주세요. 안 되면 「직접 적기」를 쓰세요.";
  }
  if (isSamsungInternet()) {
    return "마이크 허용을 누른 뒤, 한 번에 짧게 말씀해 주세요.";
  }
  return "마이크 허용 후, 한 번에 짧게 말씀해 주세요.";
}

export type SpeechListenHandlers = {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
};

export type SpeechRecognitionOptions = {
  /** Longer memos / playback re-speak — keep listening until stop. */
  continuous?: boolean;
};

export function createKoreanSpeechRecognition(
  handlers: SpeechListenHandlers,
  options?: SpeechRecognitionOptions,
): SpeechRecognitionLike | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "ko-KR";
  rec.continuous = options?.continuous === true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onstart = () => handlers.onStart?.();
  rec.onend = () => handlers.onEnd?.();
  rec.onerror = (ev) => {
    const code = (ev as { error?: string }).error ?? "error";
    if (code === "aborted") {
      handlers.onError?.("음성 인식이 취소되었습니다.");
      return;
    }
    if (code === "no-speech") {
      handlers.onError?.(
        "말씀이 들리지 않았습니다. 다시 눌러 말씀해 주세요.",
      );
      return;
    }
    if (code === "not-allowed" || code === "service-not-allowed") {
      handlers.onError?.(speechMicPermissionMessage());
      return;
    }
    if (code === "network" || code === "language-not-supported") {
      if (isAppleMobileDevice()) {
        handlers.onError?.(
          "이 iPhone에서 한국어 음성 인식을 쓰지 못했습니다.\n" +
            "「직접 적기」로 할 일을 입력해 주세요.",
        );
        return;
      }
      handlers.onError?.(
        code === "language-not-supported"
          ? "이 기기에서 한국어 음성 인식을 지원하지 않습니다. 「직접 적기」를 이용해 주세요."
          : "음성 인식 연결에 실패했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.",
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
