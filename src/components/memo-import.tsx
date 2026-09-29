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
import type { Task } from "@/lib/types";
import { StickyNote } from "lucide-react";

interface MemoImportProps {
  onImport: (tasks: Task[]) => void;
}

export function MemoImport({ onImport }: MemoImportProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleImport = () => {
    try {
      const tasks = parseMemoText(text, "memo");
      if (tasks.length === 0) {
        setError("변환할 줄이 없습니다. 한 줄에 하나의 할 일을 적어 주세요.");
        return;
      }
      onImport(tasks);
      setText("");
      setError(null);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "메모 변환에 실패했습니다.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <StickyNote className="size-3.5" />
            메모 붙여넣기
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>휴대폰 메모 → 할 일</DialogTitle>
          <DialogDescription>
            한 줄에 하나씩 붙여넣으면 유형·기한·시급성을 추정해 반영합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="memo-text">메모 텍스트</Label>
          <Textarea
            id="memo-text"
            rows={8}
            placeholder={`예)\n오늘 후보자 A 전화\nJD 초안 — 이번 주\n언젠가 명함 정리`}
            value={text}
            onChange={(e) => setText(e.target.value)}
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
            할 일로 추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
