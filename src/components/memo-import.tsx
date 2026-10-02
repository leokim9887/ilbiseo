"use client";

import { useState } from "react";
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
import { parseMemoText } from "@/lib/import";
import type { Task, TaskCategory } from "@/lib/types";
import { StickyNote } from "lucide-react";

interface MemoImportProps {
  onImport: (tasks: Task[]) => void;
  category: TaskCategory;
}

export function MemoImport({ onImport, category }: MemoImportProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleImport = () => {
    try {
      const tasks = parseMemoText(text, "memo", category);
      if (tasks.length === 0) {
        setError("변환할 줄이 없습니다.");
        return;
      }
      onImport(tasks);
      setText("");
      setError(null);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "메모 변환 실패");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="lg" className="min-h-11">
            <StickyNote className="size-3.5" />
            메모 붙여넣기
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>휴대폰 메모 → 할 일</DialogTitle>
          <DialogDescription>
            현재 틀에 추가됩니다. 한 줄에 하나씩.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="memo-text">메모 텍스트</Label>
          <Textarea
            id="memo-text"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`예)\n오늘 후보자 전화\nJD 초안 — 이번 주`}
          />
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button type="button" onClick={handleImport}>
            할 일로 추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
