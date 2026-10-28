"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileAudio,
  Keyboard,
  Mic,
  MicOff,
  Pause,
  Play,
  Square,
  Upload,
} from "lucide-react";
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
  isSpeechRecognitionSupported,
  speechListenHint,
  speechUnsupportedMessage,
  type SpeechRecognitionLike,
} from "@/lib/speech-recognition";
import {
  pickSamsungVoiceFiles,
  SAMSUNG_VOICE_AUDIO_ACCEPT,
  samsungVoiceMemoLimitsCopy,
} from "@/lib/samsung-voice-memo";
import {
  parseVoiceRowAdd,
  type VoiceParsedFields,
} from "@/lib/voice-row-parse";
import { clampPriority, importanceLabel } from "@/lib/priority";
import { todayIsoKst } from "@/lib/date-range";
import type { TaskCategory, TaskKind } from "@/lib/types";
import {
  CATEGORY_LABEL,
  FRAME_LABEL,
  isTaskCategory,
  TASK_CATEGORIES,
  type FrameId,
} from "@/lib/types";
import type { VoiceRowCommit } from "@/components/voice-row-add";

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

export function SamsungVoiceMemoImport({
  frame,
  onCommit,
  open: openProp,
  onOpenChange,
}: {
  frame: FrameId;
  onCommit: (fields: VoiceRowCommit) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
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

  const today = todayIsoKst();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalsRef = useRef("");
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [pickWarnings, setPickWarnings] = useState<string[]>([]);
  const [rawText, setRawText] = useState("");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [parsedHint, setParsedHint] = useState<VoiceParsedFields | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pickedCategory, setPickedCategory] = useState<TaskCategory>(
    defaultCategory(frame),
  );
  const [speechOk, setSpeechOk] = useState(true);

  const revokeUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const stopRec = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    recRef.current = null;
    setListening(false);
  }, []);

  const stopAudio = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      try {
        el.pause();
      } catch {
        /* ignore */
      }
    }
    setPlaying(false);
  }, []);

  const applyTranscript = useCallback(
    (text: string) => {
      const cleaned = text.trim();
      if (!cleaned) return;
      setRawText(cleaned);
      setInterim("");
      const parsed = parseVoiceRowAdd(cleaned, { today });
      setParsedHint(parsed);
      const next = fieldsToDraft(parsed, today, pickedCategory);
      setDraft(next);
      if (parsed.spokenCategory) setPickedCategory(parsed.spokenCategory);
    },
    [today, pickedCategory],
  );

  const resetSession = useCallback(() => {
    stopRec();
    stopAudio();
    revokeUrl();
    setAudioFile(null);
    setAudioUrl(null);
    setAudioError(null);
    setPickWarnings([]);
    setRawText("");
    setInterim("");
    setParsedHint(null);
    setDraft(null);
    setError(null);
    setPickedCategory(defaultCategory(frame));
    finalsRef.current = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [frame, revokeUrl, stopAudio, stopRec]);

  const closeDialog = useCallback(() => {
    stopRec();
    stopAudio();
    setOpen(false);
  }, [setOpen, stopAudio, stopRec]);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      stopRec();
      stopAudio();
      return;
    }
    if (wasOpen.current) return;
    wasOpen.current = true;
    resetSession();
    setSpeechOk(isSpeechRecognitionSupported());
  }, [open, resetSession, stopAudio, stopRec]);

  useEffect(() => {
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
      revokeUrl();
    };
  }, [revokeUrl]);

  const onFilesPicked = useCallback(
    async (list: FileList | null) => {
      if (!list || list.length === 0) return;
      setError(null);
      setAudioError(null);
      const result = await pickSamsungVoiceFiles(list);
      setPickWarnings(result.warnings);
      if (!result.audio && !result.transcriptText) {
        setError(result.warnings[0] ?? "파일을 다시 골라 주세요.");
        return;
      }

      if (result.audio) {
        revokeUrl();
        stopAudio();
        const url = URL.createObjectURL(result.audio);
        objectUrlRef.current = url;
        setAudioFile(result.audio);
        setAudioUrl(url);
      }

      if (result.transcriptText) {
        applyTranscript(result.transcriptText);
      } else if (result.audio) {
        setDraft((d) => d ?? emptyDraft(pickedCategory, today));
      }
    },
    [applyTranscript, pickedCategory, revokeUrl, stopAudio, today],
  );

  const togglePlay = useCallback(async () => {
    const el = audioRef.current;
    if (!el || !audioUrl) return;
    setAudioError(null);
    if (!el.paused) {
      el.pause();
      setPlaying(false);
      return;
    }
    try {
      await el.play();
      setPlaying(true);
    } catch {
      setAudioError(
        "이 기기에서 재생하지 못했습니다. 다른 형식(.mp3 · .wav)이거나, 아래 칸에 글을 붙여 넣어 주세요.",
      );
      setPlaying(false);
    }
  }, [audioUrl]);

  const startDictation = useCallback(() => {
    setError(null);
    if (!isSpeechRecognitionSupported()) {
      setSpeechOk(false);
      setError(
        speechUnsupportedMessage() +
          "\n재생을 들으며 아래 칸에 직접 적거나, 삼성 음성녹음 앱의 글을 붙여 넣어 주세요.",
      );
      setDraft((d) => d ?? emptyDraft(pickedCategory, today));
      return;
    }
    setSpeechOk(true);
    stopRec();
    finalsRef.current = rawText.trim() ? `${rawText.trim()} ` : "";
    const rec = createKoreanSpeechRecognition(
      {
        onStart: () => setListening(true),
        onEnd: () => {
          setListening(false);
          recRef.current = null;
          setInterim("");
          const merged = finalsRef.current.trim();
          if (merged) applyTranscript(merged);
        },
        onInterim: (t) => setInterim(t),
        onFinal: (t) => {
          const piece = t.trim();
          if (!piece) return;
          finalsRef.current = `${finalsRef.current}${piece} `.replace(
            /\s+/g,
            " ",
          );
          setInterim("");
          setRawText(finalsRef.current.trim());
          applyTranscript(finalsRef.current.trim());
        },
        onError: (msg) => {
          setError(msg);
          setListening(false);
          setDraft((d) => d ?? emptyDraft(pickedCategory, today));
        },
      },
      { continuous: true },
    );
    if (!rec) {
      setSpeechOk(false);
      setError(speechUnsupportedMessage());
      return;
    }
    recRef.current = rec;
    try {
      rec.start();
      // Best-effort: play through speaker so mic may catch it on Android Chrome.
      void (async () => {
        const el = audioRef.current;
        if (!el || !audioUrl) return;
        try {
          el.currentTime = 0;
          await el.play();
          setPlaying(true);
        } catch {
          /* playback optional during dictation */
        }
      })();
    } catch {
      setError(
        "받아쓰기를 시작하지 못했습니다. 재생을 들으며 아래 칸에 직접 적어 주세요.",
      );
      setListening(false);
    }
  }, [applyTranscript, audioUrl, pickedCategory, rawText, stopRec, today]);

  const confirm = useCallback(() => {
    if (!draft) return;
    const withCat = { ...draft, category: pickedCategory };
    const commit = draftToCommit(withCat);
    if (!commit) {
      setError("할 일 제목을 입력해 주세요.");
      return;
    }
    stopRec();
    stopAudio();
    setOpen(false);
    onCommit(commit);
  }, [draft, pickedCategory, onCommit, setOpen, stopAudio, stopRec]);

  const focusManual = useCallback(() => {
    stopRec();
    setDraft((d) => d ?? emptyDraft(pickedCategory, today));
    window.setTimeout(() => titleInputRef.current?.focus(), 80);
  }, [pickedCategory, stopRec, today]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDialog();
        else setOpen(true);
      }}
    >
      <DialogContent
        className={VOICE_SHEET_CONTENT_CLASS}
        data-samsung-voice-memo-dialog
        showCloseButton
      >
        <VoiceSheetHeader>
          <DialogHeader className="gap-1.5 text-left">
            <DialogTitle className="text-[18px] font-semibold tracking-tight text-[var(--ink)] max-sm:text-[19px]">
              음성파일 불러오기
            </DialogTitle>
            <DialogDescription className="text-[14px] leading-relaxed text-[var(--ink-muted)]">
              음성 파일을 고른 뒤 재생·받아쓰기 또는 글 붙여넣기로 할 일을
              만듭니다.
              {frame !== pickedCategory ? (
                <> (화면 틀: {FRAME_LABEL[frame]})</>
              ) : null}
            </DialogDescription>
          </DialogHeader>
        </VoiceSheetHeader>

        <VoiceSheetBody>
          <p
            className="rounded-xl bg-[#f0f4f8] px-3.5 py-3 text-[13.5px] leading-relaxed text-[var(--ink-muted)] dark:bg-[#1a221e]"
            data-samsung-voice-limits
          >
            {samsungVoiceMemoLimitsCopy()}
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept={SAMSUNG_VOICE_AUDIO_ACCEPT}
            multiple
            className="sr-only"
            data-samsung-voice-file
            onChange={(e) => {
              void onFilesPicked(e.target.files);
            }}
          />

          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-[var(--ink-muted)]">
              틀
            </span>
            <select
              data-samsung-voice-field-category
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

          <Button
            type="button"
            size="sm"
            className="min-h-12 w-full touch-manipulation rounded-xl bg-[var(--toss-blue)] text-[15px] text-white hover:bg-[#1b64da] sm:min-h-11 sm:rounded-lg"
            onClick={() => fileInputRef.current?.click()}
            data-samsung-voice-pick
          >
            <Upload className="size-4 shrink-0" aria-hidden />
            {audioFile ? "다른 파일 고르기" : "음성·글 파일 고르기"}
          </Button>

          {audioFile ? (
            <div
              className="space-y-2.5 rounded-xl border border-[#d0d5dd] bg-[#f8fafc] px-3.5 py-3 dark:border-[#3a4540] dark:bg-[#1a221e]"
              data-samsung-voice-player
            >
              <p className="flex items-center gap-2 text-[13px] font-medium text-[var(--ink-muted)]">
                <FileAudio className="size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{audioFile.name}</span>
              </p>
              {audioUrl ? (
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  className="w-full"
                  controls
                  preload="metadata"
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                  onError={() =>
                    setAudioError(
                      "재생할 수 없는 형식입니다. .mp3 · .wav로 보내 주시거나 글을 붙여 넣어 주세요.",
                    )
                  }
                >
                  <track kind="captions" />
                </audio>
              ) : null}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11 w-full touch-manipulation rounded-xl text-[14px] sm:rounded-lg"
                  onClick={() => void togglePlay()}
                  data-samsung-voice-play
                  disabled={!audioUrl}
                >
                  {playing ? (
                    <Pause className="size-4 shrink-0" aria-hidden />
                  ) : (
                    <Play className="size-4 shrink-0" aria-hidden />
                  )}
                  {playing ? "일시정지" : "재생"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="min-h-11 w-full touch-manipulation rounded-xl bg-[#217346] text-[14px] text-white hover:bg-[#1a5c38] sm:rounded-lg"
                  onClick={startDictation}
                  disabled={listening}
                  data-samsung-voice-dictate
                >
                  <Mic className="size-4 shrink-0" aria-hidden />
                  이 내용으로 받아쓰기
                </Button>
              </div>
              <p className="text-[12.5px] leading-snug text-[var(--ink-muted)]">
                스피커로 재생하며 받아쓰기를 시도합니다. 잘 안 되면 이어폰으로
                들으며 다시 말하거나, 아래 칸에 적으세요.
              </p>
            </div>
          ) : (
            <p className="text-[13.5px] leading-snug text-[var(--ink-muted)]">
              .m4a · .mp3 · .wav · .amr 파일을 고르세요. 같은 이름의 .txt가 있으면
              함께 선택해도 됩니다.
            </p>
          )}

          {pickWarnings.map((w) => (
            <p
              key={w}
              className="rounded-lg bg-[#fff8e8] px-3 py-2 text-[13.5px] text-[#7a4a00] dark:bg-[#2a2410] dark:text-[#ffd89a]"
            >
              {w}
            </p>
          ))}
          {audioError ? (
            <p
              className="rounded-lg bg-[#fff4e5] px-3 py-2.5 text-[14px] text-[#b42318] dark:bg-[#3a2a10] dark:text-[#ffd89a]"
              data-samsung-voice-audio-error
            >
              {audioError}
            </p>
          ) : null}

          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {listening ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-12 w-full touch-manipulation rounded-xl border-[#b42318]/40 text-[15px] text-[#b42318] sm:min-h-11 sm:rounded-lg"
                  onClick={stopRec}
                  data-samsung-voice-stop
                >
                  <Square className="size-4 shrink-0" aria-hidden />
                  받아쓰기 그만
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-12 w-full touch-manipulation rounded-xl text-[15px] sm:min-h-11 sm:rounded-lg"
                  onClick={startDictation}
                  data-samsung-voice-listen
                  disabled={!speechOk && !audioFile}
                >
                  <Mic className="size-4 shrink-0" aria-hidden />
                  {rawText ? "다시 받아쓰기" : "말로 받아쓰기"}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-12 w-full touch-manipulation rounded-xl border-[var(--brand)]/30 text-[15px] text-[var(--brand)] sm:min-h-11 sm:rounded-lg"
                onClick={focusManual}
                data-samsung-voice-manual
                aria-label="직접 적기"
              >
                <Keyboard className="size-4 shrink-0" aria-hidden />
                직접 적기
              </Button>
            </div>
            {listening ? (
              <p
                className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[#b42318]"
                data-samsung-voice-listening
              >
                <MicOff className="size-4 animate-pulse" aria-hidden />
                듣는 중…
              </p>
            ) : (
              <p className="text-[13px] leading-snug text-[var(--ink-muted)]">
                {speechListenHint()}
              </p>
            )}
          </div>

          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-[var(--ink-muted)]">
              받아쓴 글 · 붙여넣기
            </span>
            <textarea
              data-samsung-voice-raw
              value={
                listening && interim
                  ? `${rawText}${rawText ? " " : ""}${interim}`.trim()
                  : rawText
              }
              onChange={(e) => {
                const v = e.target.value;
                setRawText(v);
                if (v.trim()) applyTranscript(v);
                else {
                  setParsedHint(null);
                  setDraft((d) =>
                    d
                      ? { ...emptyDraft(pickedCategory, today), ...d, title: "" }
                      : emptyDraft(pickedCategory, today),
                  );
                }
              }}
              rows={3}
              className="w-full touch-manipulation rounded-xl border border-[#c5ccd3] bg-white px-3 py-2.5 text-[16px] leading-relaxed outline-none focus:border-[var(--toss-blue)] dark:border-[#4a5c52] dark:bg-[#24302a] sm:text-[15px]"
              placeholder="예: 보고서 쓰기 메모 급함 마감 10월 30일부터 11월 2일 중요도 높음"
              enterKeyHint="done"
            />
          </label>

          {error ? (
            <p
              className="whitespace-pre-line rounded-lg bg-[#fff4e5] px-3 py-2.5 text-[14px] text-[#b42318] dark:bg-[#3a2a10] dark:text-[#ffd89a]"
              data-samsung-voice-error
            >
              {error}
            </p>
          ) : null}

          {draft ? (
            <div className="space-y-3" data-samsung-voice-confirm-fields>
              {parsedHint && parsedHint.uncertain.length > 0 ? (
                <p className="rounded-xl bg-[#fff8e8] px-3 py-2.5 text-[14px] text-[#7a4a00] dark:bg-[#2a2410] dark:text-[#ffd89a]">
                  일부 내용을 확실히 이해하지 못했습니다. 아래를 확인·수정한 뒤
                  「추가」를 눌러 주세요.
                </p>
              ) : draft.title.trim() ? (
                <p className="text-[14px] text-[var(--ink-muted)]">
                  맞으면 「추가」, 틀리면 고친 뒤 「추가」를 눌러 주세요.
                </p>
              ) : null}

              <label className="block space-y-1.5">
                <span className="text-[13px] font-medium text-[var(--ink-muted)]">
                  할 일
                </span>
                <input
                  ref={titleInputRef}
                  data-samsung-voice-field-title
                  value={draft.title}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, title: e.target.value } : d))
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
                  data-samsung-voice-field-memo
                  value={draft.memo}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, memo: e.target.value } : d))
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
                somedayTestId="data-samsung-voice-field-someday"
                startTestId="data-samsung-voice-field-start"
                endTestId="data-samsung-voice-field-end"
              />

              <label className="block space-y-1.5">
                <span className="text-[13px] font-medium text-[var(--ink-muted)]">
                  중요도 (1 낮음 · 2 보통 · 3 중요)
                </span>
                <select
                  data-samsung-voice-field-importance
                  value={draft.importance}
                  onChange={(e) =>
                    setDraft((d) =>
                      d
                        ? { ...d, importance: Number(e.target.value) }
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
            data-samsung-voice-cancel
          >
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            className="min-h-12 flex-[1.35] touch-manipulation rounded-xl bg-[#217346] text-[15px] text-white hover:bg-[#1a5c38] sm:min-h-11 sm:flex-none sm:rounded-lg sm:px-6"
            disabled={!draft?.title.trim()}
            onClick={confirm}
            data-samsung-voice-confirm
          >
            추가
          </Button>
        </VoiceSheetFooter>
      </DialogContent>
    </Dialog>
  );
}
