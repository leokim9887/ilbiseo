"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createKoreanSpeechRecognition,
  isSpeechRecognitionSupported,
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
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const today = todayIsoKst();

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
    },
    [today, pickedCategory],
  );

  const startListening = useCallback(() => {
    setError(null);
    if (supported.current === false || !isSpeechRecognitionSupported()) {
      supported.current = false;
      setError(speechUnsupportedMessage());
      return;
    }
    supported.current = true;
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
      },
    });
    if (!rec) {
      setError(speechUnsupportedMessage());
      return;
    }
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setError("음성 인식을 시작하지 못했습니다. 다시 시도해 주세요.");
      setListening(false);
    }
  }, [applyTranscript, stopRec]);

  const resetSession = useCallback(() => {
    setTranscript("");
    setInterim("");
    setParsedHint(null);
    setDraft(null);
    setError(null);
    setPickedCategory(defaultCategory(frame));
  }, [frame]);

  const openDialog = useCallback(() => {
    setOpen(true);
  }, [setOpen]);

  const closeDialog = useCallback(() => {
    stopRec();
    setOpen(false);
  }, [setOpen, stopRec]);

  // Fresh listen session whenever the dialog opens (toolbar or「추가 기능」).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      stopRec();
      return;
    }
    if (wasOpen.current) return;
    wasOpen.current = true;
    resetSession();
    const t = window.setTimeout(() => startListening(), 120);
    return () => window.clearTimeout(t);
  }, [open, resetSession, startListening, stopRec]);

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

  const showUnsupportedOnly =
    error != null &&
    error.includes("음성 입력을 쓸 수 없습니다") &&
    !draft &&
    !transcript;

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
          className="sm:max-w-md"
          data-voice-row-dialog
          showCloseButton
        >
          <DialogHeader>
            <DialogTitle className="text-[17px] text-[var(--ink)]">
              음성으로 행 추가
            </DialogTitle>
            <DialogDescription className="text-[13.5px] leading-relaxed text-[var(--ink-muted)]">
              말씀하신 내용을 확인한 뒤 추가합니다. 틀은 아래에서 바꿀 수
              있습니다.
              {frame !== pickedCategory ? (
                <>
                  {" "}
                  (열었을 때 화면 틀: {FRAME_LABEL[frame]})
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {showUnsupportedOnly ? (
            <p
              className="whitespace-pre-line rounded-lg bg-[#fff4e5] px-3 py-3 text-[14px] leading-relaxed text-[#7a4a00] dark:bg-[#3a2a10] dark:text-[#ffd89a]"
              data-voice-unsupported
            >
              {error}
            </p>
          ) : (
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-[12.5px] font-medium text-[var(--ink-muted)]">
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
                  className="h-11 w-full rounded-lg border border-[#c5ccd3] bg-white px-3 text-[15px] font-medium outline-none focus:border-[var(--toss-blue)] dark:border-[#4a5c52] dark:bg-[#24302a]"
                  aria-label="틀 선택"
                >
                  {TASK_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-2">
                {listening ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11 flex-1 border-[#b42318]/40 text-[#b42318]"
                    onClick={stopRec}
                    data-voice-stop
                  >
                    <Square className="size-3.5" aria-hidden />
                    듣기 그만
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11 flex-1 bg-[var(--toss-blue)] text-white hover:bg-[#1b64da]"
                    onClick={startListening}
                    data-voice-listen
                  >
                    <Mic className="size-3.5" aria-hidden />
                    {transcript ? "다시 말하기" : "말하기 시작"}
                  </Button>
                )}
                {listening ? (
                  <span
                    className="inline-flex items-center gap-1 text-[13px] font-medium text-[#b42318]"
                    data-voice-listening
                  >
                    <MicOff className="size-3.5 animate-pulse" aria-hidden />
                    듣는 중…
                  </span>
                ) : null}
              </div>

              <div
                className="rounded-lg border border-[#d0d5dd] bg-[#f8fafc] px-3 py-2 dark:border-[#3a4540] dark:bg-[#1a221e]"
                data-voice-transcript
              >
                <p className="text-[12px] font-medium text-[var(--ink-muted)]">
                  인식된 말
                </p>
                <p className="mt-1 min-h-[2.5rem] whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--ink)]">
                  {transcript || interim || (
                    <span className="text-[var(--ink-muted)]">
                      예: 보고서 쓰기 메모 급함 마감 10월 30일부터 11월 2일
                      중요도 높음
                    </span>
                  )}
                </p>
              </div>

              {error && !showUnsupportedOnly ? (
                <p
                  className="whitespace-pre-line text-[13.5px] text-[#b42318]"
                  data-voice-error
                >
                  {error}
                </p>
              ) : null}

              {draft ? (
                <div className="space-y-2.5" data-voice-confirm-fields>
                  {parsedHint && parsedHint.uncertain.length > 0 ? (
                    <p className="rounded-md bg-[#fff8e8] px-2.5 py-2 text-[13px] text-[#7a4a00] dark:bg-[#2a2410] dark:text-[#ffd89a]">
                      일부 내용을 확실히 이해하지 못했습니다. 아래를 확인·수정한
                      뒤 「추가」를 눌러 주세요.
                    </p>
                  ) : (
                    <p className="text-[13px] text-[var(--ink-muted)]">
                      맞으면 「추가」, 틀리면 고친 뒤 「추가」를 눌러 주세요.
                    </p>
                  )}

                  <label className="block space-y-1">
                    <span className="text-[12.5px] font-medium text-[var(--ink-muted)]">
                      할 일
                    </span>
                    <input
                      data-voice-field-title
                      value={draft.title}
                      onChange={(e) =>
                        setDraft((d) =>
                          d ? { ...d, title: e.target.value } : d,
                        )
                      }
                      className="h-11 w-full rounded-lg border border-[#c5ccd3] bg-white px-3 text-[15px] outline-none focus:border-[var(--toss-blue)] dark:border-[#4a5c52] dark:bg-[#24302a]"
                      placeholder="할 일 제목"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[12.5px] font-medium text-[var(--ink-muted)]">
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
                      className="h-11 w-full rounded-lg border border-[#c5ccd3] bg-white px-3 text-[15px] outline-none focus:border-[var(--toss-blue)] dark:border-[#4a5c52] dark:bg-[#24302a]"
                      placeholder="메모"
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      data-voice-field-someday
                      aria-pressed={draft.someday}
                      onClick={() =>
                        setDraft((d) =>
                          d ? { ...d, someday: !d.someday } : d,
                        )
                      }
                      className={`h-10 min-h-10 rounded-lg border px-3 text-[13.5px] font-medium ${
                        draft.someday
                          ? "border-[var(--toss-blue)] bg-[#e8f1ff] text-[var(--toss-blue)]"
                          : "border-[#c5ccd3] bg-white text-[var(--ink)] dark:border-[#4a5c52] dark:bg-[#24302a]"
                      }`}
                    >
                      언젠가
                    </button>
                    {!draft.someday ? (
                      <>
                        <label className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px] text-[var(--ink-muted)]">
                          시작
                          <input
                            type="date"
                            data-voice-field-start
                            value={draft.startDate}
                            onChange={(e) =>
                              setDraft((d) =>
                                d
                                  ? { ...d, startDate: e.target.value }
                                  : d,
                              )
                            }
                            className="h-10 min-w-0 flex-1 rounded-lg border border-[#c5ccd3] bg-white px-2 text-[14px] dark:border-[#4a5c52] dark:bg-[#24302a]"
                          />
                        </label>
                        <label className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px] text-[var(--ink-muted)]">
                          종료
                          <input
                            type="date"
                            data-voice-field-end
                            value={draft.targetDate}
                            onChange={(e) =>
                              setDraft((d) =>
                                d
                                  ? { ...d, targetDate: e.target.value }
                                  : d,
                              )
                            }
                            className="h-10 min-w-0 flex-1 rounded-lg border border-[#c5ccd3] bg-white px-2 text-[14px] dark:border-[#4a5c52] dark:bg-[#24302a]"
                          />
                        </label>
                      </>
                    ) : null}
                  </div>

                  <label className="block space-y-1">
                    <span className="text-[12.5px] font-medium text-[var(--ink-muted)]">
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
                      className="h-11 w-full rounded-lg border border-[#c5ccd3] bg-white px-3 text-[15px] dark:border-[#4a5c52] dark:bg-[#24302a]"
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
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11"
              onClick={closeDialog}
              data-voice-cancel
            >
              취소
            </Button>
            {!showUnsupportedOnly ? (
              <Button
                type="button"
                size="sm"
                className="min-h-11 bg-[#217346] text-white hover:bg-[#1a5c38]"
                disabled={!draft?.title.trim()}
                onClick={confirm}
                data-voice-confirm
              >
                추가
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
