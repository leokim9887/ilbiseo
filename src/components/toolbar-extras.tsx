"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MemoImport } from "@/components/memo-import";
import { OcrImport } from "@/components/ocr-import";
import type { Task, TaskCategory } from "@/lib/types";
import { ChevronDown, ImageIcon, StickyNote } from "lucide-react";

interface ToolbarExtrasProps {
  category: TaskCategory;
  onImport: (tasks: Task[]) => void;
}

/** 작은 「추가 기능」— 메모·OCR은 메뉴에서만 연다 */
export function ToolbarExtras({ category, onImport }: ToolbarExtrasProps) {
  const [memoOpen, setMemoOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 min-h-9 touch-manipulation rounded-sm border-[#8a939a] bg-white px-2 text-[13px] text-[#454d48] sm:h-8 sm:min-h-8 sm:px-2"
              data-toolbar-extras
              aria-label="추가 기능"
            >
              추가 기능
              <ChevronDown className="size-3.5 opacity-70" />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="min-w-[10.5rem]">
          <DropdownMenuItem
            className="cursor-pointer gap-2 py-2 text-[14px]"
            onClick={() => setMemoOpen(true)}
          >
            <StickyNote className="size-3.5" />
            메모 붙여넣기
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer gap-2 py-2 text-[14px]"
            onClick={() => setOcrOpen(true)}
          >
            <ImageIcon className="size-3.5" />
            사진 OCR
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <MemoImport
        category={category}
        onImport={onImport}
        showTrigger={false}
        open={memoOpen}
        onOpenChange={setMemoOpen}
      />
      <OcrImport
        category={category}
        onImport={onImport}
        showTrigger={false}
        open={ocrOpen}
        onOpenChange={setOcrOpen}
      />
    </>
  );
}
