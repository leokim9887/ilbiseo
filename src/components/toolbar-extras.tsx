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
import {
  VoiceRowAddButton,
  type VoiceRowCommit,
} from "@/components/voice-row-add";
import type {
  FrameId,
  SideListItem,
  SideListKind,
  Task,
  TaskCategory,
} from "@/lib/types";
import { ChevronDown, FileSpreadsheet, Mic } from "lucide-react";

interface ToolbarExtrasProps {
  frame: FrameId;
  category: TaskCategory;
  onImport: (tasks: Task[]) => void;
  onReplaceCategory?: (category: TaskCategory, tasks: Task[]) => void;
  onReplaceByCategories?: (tasks: Task[]) => void;
  onTodoDelta?: (payload: {
    add: Task[];
    update: { id: string; patch: Partial<Task> }[];
  }) => void;
  onImportSide?: (kind: SideListKind, items: SideListItem[]) => void;
  onReplaceSide?: (kind: SideListKind, items: SideListItem[]) => void;
  onSideDelta?: (
    kind: SideListKind,
    payload: {
      add: SideListItem[];
      update: { id: string; patch: Partial<SideListItem> }[];
    },
  ) => void;
  onWorkbookDelta?: (payload: {
    todo: {
      add: Task[];
      update: { id: string; patch: Partial<Task> }[];
    };
    guideline: {
      add: SideListItem[];
      update: { id: string; patch: Partial<SideListItem> }[];
    };
    habit: {
      add: SideListItem[];
      update: { id: string; patch: Partial<SideListItem> }[];
    };
  }) => void;
  onWorkbookReplace?: (opts: {
    tasks?: Task[] | null;
    guidelines?: SideListItem[] | null;
    habits?: SideListItem[] | null;
  }) => void;
  existingTasks?: Task[];
  existingGuidelines?: SideListItem[];
  existingHabits?: SideListItem[];
  onVoiceCommit: (fields: VoiceRowCommit) => void;
}

/**
 * 「추가 기능」— 음성으로 입력 · 엑셀 불러오기 only (no memo / OCR).
 */
export function ToolbarExtras({
  frame,
  category,
  onImport,
  onReplaceCategory,
  onReplaceByCategories,
  onTodoDelta,
  onImportSide,
  onReplaceSide,
  onSideDelta,
  onWorkbookDelta,
  onWorkbookReplace,
  existingTasks,
  existingGuidelines,
  existingHabits,
  onVoiceCommit,
}: ToolbarExtrasProps) {
  const [excelOpen, setExcelOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 min-h-9 shrink-0 touch-manipulation rounded-sm border-[#8a939a] bg-white px-2 text-[12.5px] text-[#454d48] dark:border-[#4a5c52] dark:bg-[#24302a] dark:text-[#c5cec9] max-sm:h-11 max-sm:min-h-11 max-sm:rounded-xl sm:h-9 sm:min-h-9 sm:px-2 sm:text-[13px]"
              data-toolbar-extras
              aria-label="추가 기능"
            >
              추가 기능
              <ChevronDown className="size-3.5 opacity-70" />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="min-w-[11rem]">
          <DropdownMenuItem
            className="cursor-pointer gap-2 py-2 text-[14px]"
            onClick={() => setVoiceOpen(true)}
            data-toolbar-extras-voice
          >
            <Mic className="size-3.5" />
            음성으로 입력
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer gap-2 py-2 text-[14px]"
            onClick={() => setExcelOpen(true)}
            data-toolbar-extras-excel
          >
            <FileSpreadsheet className="size-3.5" />
            엑셀 불러오기
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <VoiceRowAddButton
        frame={frame}
        onCommit={onVoiceCommit}
        showTrigger={false}
        open={voiceOpen}
        onOpenChange={setVoiceOpen}
      />

      <ExcelImport
        category={category}
        onImport={onImport}
        onReplaceCategory={onReplaceCategory}
        onReplaceByCategories={onReplaceByCategories}
        onTodoDelta={onTodoDelta}
        onImportSide={onImportSide}
        onReplaceSide={onReplaceSide}
        onSideDelta={onSideDelta}
        onWorkbookDelta={onWorkbookDelta}
        onWorkbookReplace={onWorkbookReplace}
        existingTasks={existingTasks}
        existingGuidelines={existingGuidelines}
        existingHabits={existingHabits}
        showTrigger={false}
        open={excelOpen}
        onOpenChange={setExcelOpen}
      />
    </>
  );
}
