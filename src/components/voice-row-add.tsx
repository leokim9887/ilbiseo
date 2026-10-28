"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Mic, MicOff, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  VoiceDeadlineFields,
  VoiceSheetBody,
  VoiceSheetFooter,
  VoiceSheetHeader,
  VOICE_SHEET_CONTENT_CLASS,
  voiceFieldClass,
} from "@/components/voice-sheet-shell";
import {
  createKoreanSpeechRecognition,
  isAppleMobileDevice,
  isSpeechRecognitionSupported,
  speechListenHint,
  speechUnsupportedMessage,
  type SpeechRecognitionLike,
} from "@/lib/speech-recognition";
import {
  parseVoiceRowAdd,
  type VoiceParsedFields,
} from "@/lib/voice-row-parse";
import { clampPriority, importanceLabel } from "@/lib/priority";
import { todayIsoKst } from "@/lib/date-range";
import type { Task, TaskCategory, TaskKind } from "@/lib/types";
import {
  CATEGORY_LABEL,
  FRAME_LABEL,
  isTaskCategory,
  TASK_CATEGORIES,
  type FrameId,
} from "@/lib/types";

export type VoiceRowCommit = Pick<
  Task,
  | "title"
  | "memo"
  | "startDate"
  | "targetDate"
  | "kind"
  | "importance"
  | "category"
>;

type Draft = {
  title: string;
  memo: string;
  startDate: string;
  targetDate: string;
  someday: boolean;
  importance: number;
  category: TaskCategory;
};

function defaultCategory(frame: FrameId): TaskCategory {
  return isTaskCategory(frame) ? frame : "work";
}

function emptyDraft(category: TaskCategory, today: string): Draft {
  return {
    title: "",
    memo: "",
    startDate: today,
    targetDate: today,
    someday: false,
    importance: 2,
    category,
  };
}

function fieldsToDraft(
  p: VoiceParsedFields,
  today: string,
  fallbackCategory: TaskCategory,
): Draft {
  const category = p.spokenCategory ?? fallbackCategory;
  if (p.kind === "someday" || p.deadlineKind === "someday") {
    return {
      title: p.title,
      memo: p.memo,
      startDate: today,
      targetDate: today,
      someday: true,
      importance: p.importance,
      category,
    };
  }
  return {
    title: p.title,
    memo: p.memo,
    startDate: p.startDate ?? today,
    targetDate: p.targetDate ?? p.startDate ?? today,
    someday: false,
    importance: p.importance,
    category,
  };
}

function draftToCommit(d: Draft): VoiceRowCommit | null {
  const title = d.title.trim();
  if (!title) return null;
  if (d.someday) {
    return {
      title,
      memo: d.memo.trim(),
      startDate: null,
      targetDate: null,
      kind: "someday",
      importance: clampPriority(d.importance, 2),
      category: d.category,
    };
  }
  const start = d.startDate.trim() || todayIsoKst();
  const end = d.targetDate.trim() || start;
  const a = start <= end ? start : end;
  const b = start <= end ? end : start;
  const kind: TaskKind = a === b ? "spot" : "ongoing";
  return {
    title,
    memo: d.memo.trim(),
    startDate: a,
    targetDate: b,
    kind,
    importance: clampPriority(d.importance, 2),
    category: d.category,
  };
}

export function VoiceRowAddButton({
  frame,
  onCommit,
  disabled,
  /** Hide the toolbar chip — open only via menu / imperative. */
  showTrigger = true,
  open: openProp,
  onOpenChange,
}: {
  frame: FrameId;
  onCommit: (fields: VoiceRowCommit) => void;
  disabled?: boolean;
  showTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const supported = useRef<boolean | null>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : uncontrolledOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [parsedHint, setParsedHint] = useState<VoiceParsedFields | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pickedCategory, setPickedCategory] = useState<TaskCategory>(
    defaultCategory(frame),
  );
  const [manualMode, setManualMode] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [speechOk, setSpeechOk] = useState(true);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const today = todayIsoKst();
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const stopRec = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    recRef.current = null;
    setListening(false);
  }, []);

  const applyTranscript = useCallback(
    (text: string) => {
      const cleaned = text.trim();
      if (!cleaned) return;
      setTranscript(cleaned);
      setInterim("");
      const parsed = parseVoiceRowAdd(cleaned, { today });
      setParsedHint(parsed);
      const next = fieldsToDraft(parsed, today, pickedCategory);
      setDraft(next);
      if (parsed.spokenCategory) setPickedCategory(parsed.spokenCategory);
      setManualMode(false);
    },
    [today, pickedCategory],
  );

  const enableManual = useCallback(() => {
    stopRec();
    setManualMode(true);
    setError(null);
    setDraft((d) => d ?? emptyDraft(pickedCategory, today));
    window.setTimeout(() => {
      titleInputRef.current?.focus();
    }, 80);
  }, [pickedCategory, stopRec, today]);

  const startListening = useCallback(() => {
    setError(null);
    setManualMode(false);
    if (supported.current === false || !isSpeechRecognitionSupported()) {
      supported.current = false;
      setSpeechOk(false);
      setError(speechUnsupportedMessage());
      enableManual();
      return;
    }
    supported.current = true;
    setSpeechOk(true);
    stopRec();
    const rec = createKoreanSpeechRecognition({
      onStart: () => setListening(true),
      onEnd: () => {
        setListening(false);
        recRef.current = null;
      },
      onInterim: (t) => setInterim(t),
      onFinal: (t) => applyTranscript(t),
      onError: (msg) => {
        setError(msg);
        setListening(false);
        // iOS / permission failures → keep typing path ready
        if (
          msg.includes("직접 적기") ||
          msg.includes("마이크 권한") ||
          msg.includes("제한")
        ) {
          setDraft((d) => d ?? emptyDraft(pickedCategory, today));
        }
      },
    });
    if (!rec) {
      setSpeechOk(false);
      setError(speechUnsupportedMessage());
      enableManual();
      return;
    }
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setError("음성 인식을 시작하지 못했습니다. 「직접 적기」를 이용해 주세요.");
      setListening(false);
      enableManual();
    }
  }, [applyTranscript, enableManual, pickedCategory, stopRec, today]);

  const resetSession = useCallback(() => {
    setTranscript("");
    setInterim("");
    setParsedHint(null);
    setDraft(null);
    setError(null);
    setManualMode(false);
    setPickedCategory(defaultCategory(frame));
  }, [frame]);

  const openDialog = useCallback(() => {
    setOpen(true);
  }, [setOpen]);

  const closeDialog = useCallback(() => {
    stopRec();
    setOpen(false);
  }, [setOpen, stopRec]);

  // Stable refs so open-effect does not cancel auto-listen when callbacks churn.
  const startListeningRef = useRef(startListening);
  startListeningRef.current = startListening;
  const resetSessionRef = useRef(resetSession);
  resetSessionRef.current = resetSession;
  const stopRecRef = useRef(stopRec);
  stopRecRef.current = stopRec;
  const frameRef = useRef(frame);
  frameRef.current = frame;

  // Fresh listen session whenever the dialog opens (toolbar or「추가 기능」).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      stopRecRef.current();
      return;
    }
    if (wasOpen.current) return;
    wasOpen.current = true;
    resetSessionRef.current();
    const apple = isAppleMobileDevice();
    setIsIos(apple);
    const ok = isSpeechRecognitionSupported();
    setSpeechOk(ok);
    supported.current = ok;
    // iOS without webkit: skip auto-listen, open typing path immediately.
    if (!ok) {
      setError(speechUnsupportedMessage());
      setManualMode(true);
      setDraft(emptyDraft(defaultCategory(frameRef.current), todayIsoKst()));
      return;
    }
    // iOS with webkit: still try listen, but delay a bit for sheet settle.
    const delay = apple ? 280 : 120;
    const t = window.setTimeout(() => startListeningRef.current(), delay);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const confirm = useCallback(() => {
    if (!draft) return;
    const withCat = { ...draft, category: pickedCategory };
    const commit = draftToCommit(withCat);
    if (!commit) {
      setError("할 일 제목을 입력해 주세요.");
      return;
    }
    stopRec();
    setOpen(false);
    onCommit(commit);
  }, [draft, pickedCategory, onCommit, stopRec, setOpen]);

  const showUnsupportedBanner =
    !speechOk ||
    (error != null &&
      (error.includes("음성 입력을 쓸 수 없습니다") ||
        error.includes("말로 넣는 기능이 제한") ||
        error.includes("한국어 음성 인식을 쓰지 못했")));

  return (
    <>
      {showTrigger ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          className="h-9 min-h-9 shrink-0 touch-manipulation rounded-sm border-[var(--toss-blue)]/40 px-2 text-[12.5px] font-semibold text-[var(--toss-blue)] hover:bg-[#e8f1ff] max-sm:h-11 max-sm:min-h-11 max-sm:rounded-xl max-sm:px-3 sm:h-9 sm:min-h-9 sm:rounded-lg sm:px-3 sm:text-[14px] dark:hover:bg-[#1a2740]"
          onClick={openDialog}
          data-excel-voice-add
          aria-label="음성으로 입력"
          title="음성으로 입력"
        >
          <Mic className="size-3.5" aria-hidden />
          <span className="max-sm:inline">음성으로 입력</span>
        </Button>
      ) : null}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) closeDialog();
          else setOpen(true);
        }}
      >
        <DialogContent
          className={VOICE_SHEET_CONTENT_CLASS}
          data-voice-row-dialog
          data-voice-ios={isIos ? "1" : "0"}
          showCloseButton
        >
          <VoiceSheetHeader>
            <DialogHeader className="gap-1.5 text-left">
              <DialogTitle className="text-[18px] font-semibold tracking-tight text-[var(--ink)] max-sm:text-[19px]">
                음성으로 입력
              </DialogTitle>
              <DialogDescription className="text-[14px] leading-relaxed text-[var(--ink-muted)]">
                말씀하신 내용을 확인한 뒤 추가합니다.
                {frame !== pickedCategory ? (
                  <> (화면 틀: {FRAME_LABEL[frame]})</>
                ) : null}
              </DialogDescription>
            </DialogHeader>
          </VoiceSheetHeader>

          <VoiceSheetBody>
            {showUnsupportedBanner && !draft?.title && manualMode ? (
              <p
                className="whitespace-pre-line rounded-xl bg-[#fff4e5] px-3.5 py-3 text-[15px] leading-relaxed text-[#7a4a00] dark:bg-[#3a2a10] dark:text-[#ffd89a]"
                data-voice-unsupported
              >
                {error ?? speechUnsupportedMessage()}
              </p>
            ) : null}

            <label className="block space-y-1.5">
              <span className="text-[13px] font-medium text-[var(--ink-muted)]">
                틀
              </span>
              <select
                data-voice-field-category
                value={pickedCategory}
                onChange={(e) => {
                  const c = e.target.value as TaskCategory;
                  setPickedCategory(c);
                  setDraft((d) => (d ? { ...d, category: c } : d));
                }}
                className={voiceFieldClass + " font-medium"}
                aria-label="틀 선택"
              >
                {TASK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {listening ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-12 w-full touch-manipulation rounded-xl border-[#b42318]/40 text-[15px] text-[#b42318] sm:min-h-11 sm:rounded-lg"
                    onClick={stopRec}
                    data-voice-stop
                  >
                    <Square className="size-4 shrink-0" aria-hidden />
                    듣기 그만
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-12 w-full touch-manipulation rounded-xl bg-[var(--toss-blue)] text-[15px] text-white hover:bg-[#1b64da] sm:min-h-11 sm:rounded-lg"
                    onClick={startListening}
                    data-voice-listen
                    disabled={!speechOk}
                  >
                    <Mic className="size-4 shrink-0" aria-hidden />
                    {transcript ? "다시 말하기" : "말하기 시작"}
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-12 w-full touch-manipulation rounded-xl border-[var(--brand)]/30 text-[15px] text-[var(--brand)] sm:min-h-11 sm:rounded-lg"
                  onClick={enableManual}
                  data-voice-manual
                  aria-label="직접 적기"
                  aria-pressed={manualMode}
                >
                  <Keyboard className="size-4 shrink-0" aria-hidden />
                  직접 적기
                </Button>
              </div>
              {listening ? (
                <p
                  className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[#b42318]"
                  data-voice-listening
                >
                  <MicOff className="size-4 animate-pulse" aria-hidden />
                  듣는 중…
                </p>
              ) : (
                <p
                  className="text-[13px] leading-snug text-[var(--ink-muted)]"
                  data-voice-listen-hint
                >
                  {speechListenHint()}
                </p>
              )}
            </div>

            {!manualMode ? (
              <div
                className="rounded-xl border border-[#d0d5dd] bg-[#f8fafc] px-3.5 py-3 dark:border-[#3a4540] dark:bg-[#1a221e]"
                data-voice-transcript
              >
                <p className="text-[12.5px] font-medium text-[var(--ink-muted)]">
                  인식된 말
                </p>
                <p className="mt-1.5 min-h-[2.75rem] whitespace-pre-wrap break-words text-[16px] leading-relaxed text-[var(--ink)] sm:text-[15px]">
                  {transcript || interim || (
                    <span className="text-[var(--ink-muted)]">
                      예: 보고서 쓰기 메모 급함 마감 10월 30일부터 11월 2일
                      중요도 높음
                    </span>
                  )}
                </p>
              </div>
            ) : (
              <p
                className="rounded-xl bg-[var(--toss-blue-soft)] px-3.5 py-2.5 text-[14px] text-[var(--toss-blue)] dark:bg-[#1a2740]"
                data-voice-manual-hint
              >
                직접 적기 모드입니다. 아래 칸을 채운 뒤 「추가」를 눌러 주세요.
              </p>
            )}

            {error && !showUnsupportedBanner ? (
              <p
                className="whitespace-pre-line rounded-lg bg-[#fff4e5] px-3 py-2.5 text-[14px] text-[#b42318] dark:bg-[#3a2a10] dark:text-[#ffd89a]"
                data-voice-error
              >
                {error}
              </p>
            ) : null}
            {error && showUnsupportedBanner && draft?.title ? (
              <p
                className="whitespace-pre-line text-[13.5px] text-[#7a4a00]"
                data-voice-error
              >
                {error}
              </p>
            ) : null}

            {draft ? (
              <div className="space-y-3" data-voice-confirm-fields>
                {parsedHint && parsedHint.uncertain.length > 0 ? (
                  <p className="rounded-xl bg-[#fff8e8] px-3 py-2.5 text-[14px] text-[#7a4a00] dark:bg-[#2a2410] dark:text-[#ffd89a]">
                    일부 내용을 확실히 이해하지 못했습니다. 아래를 확인·수정한
                    뒤 「추가」를 눌러 주세요.
                  </p>
                ) : manualMode ? null : (
                  <p className="text-[14px] text-[var(--ink-muted)]">
                    맞으면 「추가」, 틀리면 고친 뒤 「추가」를 눌러 주세요.
                  </p>
                )}

                <label className="block space-y-1.5">
                  <span className="text-[13px] font-medium text-[var(--ink-muted)]">
                    할 일
                  </span>
                  <input
                    ref={titleInputRef}
                    data-voice-field-title
                    value={draft.title}
                    onChange={(e) =>
                      setDraft((d) =>
                        d ? { ...d, title: e.target.value } : d,
                      )
                    }
                    className={voiceFieldClass}
                    placeholder="할 일 제목"
                    enterKeyHint="done"
                    autoComplete="off"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-[13px] font-medium text-[var(--ink-muted)]">
                    메모 (선택)
                  </span>
                  <input
                    data-voice-field-memo
                    value={draft.memo}
                    onChange={(e) =>
                      setDraft((d) =>
                        d ? { ...d, memo: e.target.value } : d,
                      )
                    }
                    className={voiceFieldClass}
                    placeholder="메모"
                    enterKeyHint="done"
                    autoComplete="off"
                  />
                </label>

                <VoiceDeadlineFields
                  someday={draft.someday}
                  onSomedayToggle={() =>
                    setDraft((d) => (d ? { ...d, someday: !d.someday } : d))
                  }
                  startDate={draft.startDate}
                  targetDate={draft.targetDate}
                  onStartChange={(v) =>
                    setDraft((d) => (d ? { ...d, startDate: v } : d))
                  }
                  onEndChange={(v) =>
                    setDraft((d) => (d ? { ...d, targetDate: v } : d))
                  }
                  somedayTestId="data-voice-field-someday"
                  startTestId="data-voice-field-start"
                  endTestId="data-voice-field-end"
                />

                <label className="block space-y-1.5">
                  <span className="text-[13px] font-medium text-[var(--ink-muted)]">
                    중요도 (1 낮음 · 2 보통 · 3 중요)
                  </span>
                  <select
                    data-voice-field-importance
                    value={draft.importance}
                    onChange={(e) =>
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              importance: Number(e.target.value),
                            }
                          : d,
                      )
                    }
                    className={voiceFieldClass}
                  >
                    {[1, 2, 3].map((n) => (
                      <option key={n} value={n}>
                        {n} · {importanceLabel(n)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </VoiceSheetBody>

          <VoiceSheetFooter>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-12 flex-1 touch-manipulation rounded-xl text-[15px] sm:min-h-11 sm:flex-none sm:rounded-lg sm:px-5"
              onClick={closeDialog}
              data-voice-cancel
            >
              취소
            </Button>
            <Button
              type="button"
              size="sm"
              className="min-h-12 flex-[1.35] touch-manipulation rounded-xl bg-[#217346] text-[15px] text-white hover:bg-[#1a5c38] sm:min-h-11 sm:flex-none sm:rounded-lg sm:px-6"
              disabled={!draft?.title.trim()}
              onClick={confirm}
              data-voice-confirm
            >
              추가
            </Button>
          </VoiceSheetFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
