"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExcelImport } from "@/components/excel-import";
import { MemoImport } from "@/components/memo-import";
import { OcrImport } from "@/components/ocr-import";
import type {
  SideListItem,
  SideListKind,
  Task,
  TaskCategory,
} from "@/lib/types";
import { ChevronDown, FileSpreadsheet, ImageIcon, StickyNote } from "lucide-react";

interface ToolbarExtrasProps {
  category: TaskCategory;
  onImport: (tasks: Task[]) => void;
  onReplaceCategory?: (category: TaskCategory, tasks: Task[]) => void;
  onReplaceByCategories?: (tasks: Task[]) => void;
  onImportSide?: (kind: SideListKind, items: SideListItem[]) => void;
  onReplaceSide?: (kind: SideListKind, items: SideListItem[]) => void;
  existingTasks?: Task[];
  existingGuidelines?: SideListItem[];
  existingHabits?: SideListItem[];
  /** 「전체」에서는 엑셀만 (메모·OCR은 틀이 필요) */
  excelOnly?: boolean;
}

/** 작은 「추가 기능」— 엑셀·메모·OCR은 클릭 시에만 메뉴에서 연다 */
export function ToolbarExtras({
  category,
  onImport,
  onReplaceCategory,
  onReplaceByCategories,
  onImportSide,
  onReplaceSide,
  existingTasks,
  existingGuidelines,
  existingHabits,
  excelOnly = false,
}: ToolbarExtrasProps) {
  const [excelOpen, setExcelOpen] = useState(false);
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
              className="h-9 min-h-9 shrink-0 touch-manipulation rounded-sm border-[#8a939a] bg-white px-2 text-[12.5px] text-[#454d48] dark:border-[#4a5c52] dark:bg-[#24302a] dark:text-[#c5cec9] sm:h-9 sm:min-h-9 sm:px-2 sm:text-[13px]"
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
            onClick={() => setExcelOpen(true)}
            data-toolbar-extras-excel
          >
            <FileSpreadsheet className="size-3.5" />
            엑셀 불러오기
          </DropdownMenuItem>
          {!excelOnly ? (
            <>
              <DropdownMenuItem
                className="cursor-pointer gap-2 py-2 text-[14px]"
                onClick={() => setMemoOpen(true)}
                data-toolbar-extras-memo
              >
                <StickyNote className="size-3.5" />
                메모 붙여넣기
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-2 py-2 text-[14px]"
                onClick={() => setOcrOpen(true)}
                data-toolbar-extras-ocr
              >
                <ImageIcon className="size-3.5" />
                사진 OCR
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ExcelImport
        category={category}
        onImport={onImport}
        onReplaceCategory={onReplaceCategory}
        onReplaceByCategories={onReplaceByCategories}
        onImportSide={onImportSide}
        onReplaceSide={onReplaceSide}
        existingTasks={existingTasks}
        existingGuidelines={existingGuidelines}
        existingHabits={existingHabits}
        showTrigger={false}
        open={excelOpen}
        onOpenChange={setExcelOpen}
      />
      {!excelOnly ? (
        <>
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
      ) : null}
    </>
  );
}
