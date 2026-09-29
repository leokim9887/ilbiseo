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
import {
  MOCK_CALENDAR_JSON,
  MOCK_ICS,
  parseIcs,
  parseJsonTasks,
} from "@/lib/import";
import type { Task } from "@/lib/types";
import { CalendarDays } from "lucide-react";

interface CalendarImportProps {
  onImport: (tasks: Task[]) => void;
}

export function CalendarImport({ onImport }: CalendarImportProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const runParse = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) throw new Error("가져올 내용이 비어 있습니다.");
    if (trimmed.includes("BEGIN:VCALENDAR") || trimmed.includes("BEGIN:VEVENT")) {
      return parseIcs(trimmed);
    }
    return parseJsonTasks(trimmed);
  };

  const handleImport = () => {
    try {
      const tasks = runParse(text);
      onImport(tasks);
      setText("");
      setError(null);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "가져오기에 실패했습니다.");
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    try {
      const raw = await file.text();
      setText(raw);
      setError(null);
    } catch {
      setError("파일을 읽지 못했습니다.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <CalendarDays className="size-3.5" />
            캘린더 가져오기
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>구글 캘린더 (mock / 파일)</DialogTitle>
          <DialogDescription>
            OAuth 없이 mock 샘플을 넣거나 ICS·JSON 파일을 가져옵니다.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setText(MOCK_CALENDAR_JSON);
              setError(null);
            }}
          >
            mock JSON 불러오기
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setText(MOCK_ICS);
              setError(null);
            }}
          >
            mock ICS 불러오기
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".ics,.json,text/calendar,application/json"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            파일 선택
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cal-text">ICS 또는 JSON</Label>
          <Textarea
            id="cal-text"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="font-mono text-xs"
            placeholder='{"events":[{"title":"미팅","date":"2026-09-29"}]}'
          />
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
          <Button type="button" onClick={handleImport}>
            일정 반영
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
