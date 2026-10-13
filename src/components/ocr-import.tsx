"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { mockOcrFromImage } from "@/lib/ocr-mock";
import { parseMemoText } from "@/lib/import";
import type { Task, TaskCategory } from "@/lib/types";
import { ImageIcon, Loader2 } from "lucide-react";

interface OcrImportProps {
  onImport: (tasks: Task[]) => void;
  category: TaskCategory;
  showTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function OcrImport({
  onImport,
  category,
  showTrigger = true,
  open: openProp,
  onOpenChange,
}: OcrImportProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const controlled = openProp !== undefined;
  const open = controlled ? openProp : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!controlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setInfo(
        process.env.NEXT_PUBLIC_OCR_API_KEY
          ? "OCR 키 있음 — v1은 목 추출 사용"
          : "API 키 없음 — 목 OCR 후보를 채웠습니다.",
      );
      setText(await mockOcrFromImage(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "이미지 처리 실패");
    } finally {
      setBusy(false);
    }
  };

  const handleImport = () => {
    try {
      const tasks = parseMemoText(text, "ocr", category);
      if (tasks.length === 0) {
        setError("추가할 텍스트가 없습니다.");
        return;
      }
      onImport(tasks);
      setText("");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "변환 실패");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {showTrigger ? (
        <DialogTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-sm border-[#8a939a] bg-white"
            >
              <ImageIcon className="size-3.5" />
              사진 OCR
            </Button>
          }
        />
      ) : null}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>종이·손글씨 OCR</DialogTitle>
          <DialogDescription>
            추출 후 확인하고 현재 틀 할 일로 넣습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ImageIcon className="size-3.5" />
            )}
            {busy ? "추출 중…" : "이미지 선택"}
          </Button>
          <div className="space-y-2">
            <Label htmlFor="ocr-text">추출·수정 텍스트</Label>
            <Textarea
              id="ocr-text"
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          {info ? (
            <p className="text-sm text-[var(--ink-muted)]">{info}</p>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button type="button" onClick={handleImport} disabled={!text.trim()}>
            할 일로 추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
