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
import { mockOcrFromImage, parseMemoText } from "@/lib/import";
import type { Task } from "@/lib/types";
import { ImageIcon, Loader2 } from "lucide-react";

interface OcrImportProps {
  onImport: (tasks: Task[]) => void;
}

export function OcrImport({ onImport }: OcrImportProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const apiKey = process.env.NEXT_PUBLIC_OCR_API_KEY;
      if (apiKey) {
        setInfo("OCR API 키가 감지되었으나 v1에서는 목 추출을 사용합니다.");
      } else {
        setInfo("API 키 없음 — 목(mock) OCR로 후보 텍스트를 채웠습니다. 직접 고치세요.");
      }
      const extracted = await mockOcrFromImage(file);
      setText(extracted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "이미지 처리에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleImport = () => {
    try {
      const tasks = parseMemoText(text, "ocr");
      if (tasks.length === 0) {
        setError("추가할 텍스트가 없습니다.");
        return;
      }
      onImport(tasks);
      setText("");
      setError(null);
      setInfo(null);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "변환에 실패했습니다.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <ImageIcon className="size-3.5" />
            사진 OCR
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>종이·손글씨 메모 OCR</DialogTitle>
          <DialogDescription>
            이미지를 올리면 텍스트 후보를 만들고, 확인 후 할 일로 넣습니다.
            실 OCR API는 이후 연동 예정입니다.
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
              placeholder="추출 결과가 여기 나타납니다. 틀린 부분은 직접 고치세요."
            />
          </div>
          {info ? (
            <p className="text-sm text-[var(--ink-muted)]">{info}</p>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
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
