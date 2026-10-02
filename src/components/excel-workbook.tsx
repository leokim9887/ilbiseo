"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type Task,
  type TaskCategory,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { MemoImport } from "@/components/memo-import";
import { OcrImport } from "@/components/ocr-import";
import { Plus, RotateCcw, Trash2 } from "lucide-react";

export type WorkbookSheet = "todo" | "done";

/** Father’s six columns only */
type ColKey = "order" | "listup" | "deadline" | "importance" | "urgency" | "done";

/** Exact father header row (above the red line in the reference photo). */
const COLS: { key: ColKey; label: string; width: string }[] = [
  { key: "order", label: "순서", width: "56px" },
  { key: "listup", label: "할일 LIST UP", width: "46%" },
  { key: "deadline", label: "마감목표", width: "108px" },
  { key: "importance", label: "중요도", width: "72px" },
  { key: "urgency", label: "시급성", width: "72px" },
  { key: "done", label: "완료여부", width: "84px" },
];

const EDITABLE: ColKey[] = [
  "listup",
  "deadline",
  "importance",
  "urgency",
];

type FocusCell = { rowId: string; col: ColKey };

interface ExcelWorkbookProps {
  sheet: WorkbookSheet;
  onSheetChange: (sheet: WorkbookSheet) => void;
  category: TaskCategory;
  onCategoryChange: (c: TaskCategory) => void;
  activeTasks: Task[];
  doneTasks: Task[];
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onComplete: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onImport: (tasks: Task[]) => void;
}

export function ExcelWorkbook({
  sheet,
  onSheetChange,
  category,
  onCategoryChange,
  activeTasks,
  doneTasks,
  onUpdate,
  onComplete,
  onRestore,
  onDelete,
  onAdd,
  onImport,
}: ExcelWorkbookProps) {
  const [focus, setFocus] = useState<FocusCell | null>(null);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = useMemo(
    () =>
      new Date().toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    [],
  );

  const tasks = sheet === "todo" ? activeTasks : doneTasks;
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);

  const moveFocus = useCallback(
    (rowId: string, col: ColKey, dir: "next" | "prev" | "down" | "up") => {
      const colIdx = EDITABLE.indexOf(col);
      const rowIdx = taskIds.indexOf(rowId);
      if (rowIdx < 0 || colIdx < 0) return;

      if (dir === "next" || dir === "prev") {
        const n = dir === "next" ? colIdx + 1 : colIdx - 1;
        if (n >= 0 && n < EDITABLE.length) {
          setFocus({ rowId, col: EDITABLE[n] });
          return;
        }
        const nr = dir === "next" ? rowIdx + 1 : rowIdx - 1;
        if (nr >= 0 && nr < taskIds.length) {
          setFocus({
            rowId: taskIds[nr],
            col:
              dir === "next"
                ? EDITABLE[0]
                : EDITABLE[EDITABLE.length - 1],
          });
        }
        return;
      }
      const nr = dir === "down" ? rowIdx + 1 : rowIdx - 1;
      if (nr >= 0 && nr < taskIds.length) {
        setFocus({ rowId: taskIds[nr], col });
      }
    },
    [taskIds],
  );

  useEffect(() => {
    setFocus(null);
    setSelectedRow(null);
  }, [sheet, category]);

  useEffect(() => {
    if (!focus) return;
    const el = document.querySelector<HTMLElement>(
      `[data-excel-cell="${focus.rowId}:${focus.col}"]`,
    );
    el?.focus();
  }, [focus]);

  return (
    <div className="excel-wb flex flex-col overflow-hidden rounded-sm border border-[#7a8288] bg-[#dfe3e6] shadow-[0_2px_10px_rgba(26,43,54,0.12)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#9aa5ad] bg-gradient-to-b from-[#f7f8f9] to-[#e4e7ea] px-3 py-2">
        <p className="truncate text-[15px] font-semibold text-[#1a2420]">
          일비서.xlsx
          <span className="ml-2 text-[12px] font-normal text-[#5c655f]">
            — TO DO LIST
          </span>
        </p>
        <p className="text-[13px] tabular-nums text-[#5c655f]">{today}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-[#9aa5ad] bg-[#f0f2f4] px-3 py-2">
        <label className="flex items-center gap-2 text-[13px] text-[#1a2420]">
          <span className="font-semibold">틀</span>
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value as TaskCategory)}
            className="h-9 min-w-[7.5rem] rounded-sm border border-[#8a939a] bg-white px-2 text-[14px] font-medium outline-none focus:border-[#217346]"
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        {sheet === "todo" ? (
          <>
            <Button
              type="button"
              size="sm"
              className="h-9 rounded-sm bg-[#217346] px-3 text-white hover:bg-[#1a5c38]"
              onClick={onAdd}
            >
              <Plus className="size-3.5" />
              행 추가
            </Button>
            <MemoImport category={category} onImport={onImport} />
            <OcrImport category={category} onImport={onImport} />
          </>
        ) : (
          <p className="text-[13px] text-[#5c655f]">
            완료된 항목 · 완료여부 해제(복원) 가능
          </p>
        )}
        {selectedRow ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 rounded-sm border-[#b42318]/40 text-[#b42318]"
            onClick={() => onDelete(selectedRow)}
          >
            <Trash2 className="size-3.5" />
            선택 행 삭제
          </Button>
        ) : null}
        {selectedRow && sheet === "done" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 rounded-sm"
            onClick={() => onRestore(selectedRow)}
          >
            <RotateCcw className="size-3.5" />
            복원
          </Button>
        ) : null}
        <span className="ml-auto text-[12px] text-[#5c655f]">
          {CATEGORY_LABEL[category]} · {tasks.length}행
        </span>
      </div>

      <div
        ref={scrollRef}
        className="relative max-h-[min(70vh,760px)] min-h-[340px] overflow-auto bg-white"
      >
        <table className="w-full min-w-[780px] border-collapse text-[15px] text-black">
          <thead className="sticky top-0 z-20">
            <tr>
              {COLS.map((c) => (
                <th
                  key={`H-${c.key}`}
                  style={
                    c.key === "listup"
                      ? { width: c.width, minWidth: "280px" }
                      : { width: c.width, minWidth: c.width }
                  }
                  className="border border-black bg-[#f3f3f3] px-2 py-3 text-center text-[15px] font-bold leading-tight text-black"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="border border-black px-4 py-16 text-center text-[15px] text-[#555]"
                >
                  {sheet === "todo" ? (
                    <>
                      <p>할 일이 없습니다. 「행 추가」로 첫 줄을 넣으세요.</p>
                      <button
                        type="button"
                        className="mt-2 text-[14px] font-semibold text-[#217346] underline"
                        onClick={onAdd}
                      >
                        행 추가
                      </button>
                    </>
                  ) : (
                    <p>한 일이 없습니다. 할 일에서 완료여부를 체크하세요.</p>
                  )}
                </td>
              </tr>
            ) : (
              tasks.map((task, idx) => {
                const order = idx + 1;
                const selected = selectedRow === task.id;
                const zebra = order % 2 === 0;
                return (
                  <tr
                    key={task.id}
                    onClick={() => setSelectedRow(task.id)}
                    className={
                      selected
                        ? "bg-[#e8f5ee]"
                        : zebra
                          ? "bg-[#fafafa]"
                          : "bg-white"
                    }
                  >
                    {/* 순서 */}
                    <td className="border border-black px-1 py-1 text-center align-middle text-[14px] font-medium tabular-nums">
                      {order}
                    </td>

                    {/* 할일 LIST UP — title + memo under */}
                    <EditCell
                      active={
                        focus?.rowId === task.id && focus.col === "listup"
                      }
                      onFocusCell={() => {
                        setSelectedRow(task.id);
                        setFocus({ rowId: task.id, col: "listup" });
                      }}
                      onKeyNav={(e) =>
                        handleNav(e, task.id, "listup", moveFocus)
                      }
                    >
                      <div className="flex w-full flex-col gap-0.5 px-1.5 py-1.5">
                        <textarea
                          data-excel-cell={`${task.id}:listup`}
                          value={task.title}
                          rows={Math.min(
                            5,
                            Math.max(1, Math.ceil(task.title.length / 36)),
                          )}
                          onChange={(e) =>
                            onUpdate(task.id, { title: e.target.value })
                          }
                          className="excel-textarea font-medium"
                          aria-label="할일 LIST UP"
                        />
                        {task.memo || focus?.rowId === task.id ? (
                          <input
                            value={task.memo}
                            placeholder="메모"
                            onChange={(e) =>
                              onUpdate(task.id, { memo: e.target.value })
                            }
                            className="excel-input min-h-0 py-0.5 text-[12px] text-[#555]"
                            aria-label="메모"
                          />
                        ) : null}
                      </div>
                    </EditCell>

                    {/* 마감목표 */}
                    <EditCell
                      active={
                        focus?.rowId === task.id && focus.col === "deadline"
                      }
                      center
                      onFocusCell={() => {
                        setSelectedRow(task.id);
                        setFocus({ rowId: task.id, col: "deadline" });
                      }}
                      onKeyNav={(e) =>
                        handleNav(e, task.id, "deadline", moveFocus)
                      }
                    >
                      <input
                        data-excel-cell={`${task.id}:deadline`}
                        value={task.targetDate ?? ""}
                        placeholder="예: 9/1"
                        onChange={(e) =>
                          onUpdate(task.id, {
                            targetDate: e.target.value || null,
                          })
                        }
                        className="excel-input text-center"
                        aria-label="마감목표"
                      />
                    </EditCell>

                    {/* 중요도 */}
                    <EditCell
                      active={
                        focus?.rowId === task.id && focus.col === "importance"
                      }
                      center
                      onFocusCell={() => {
                        setSelectedRow(task.id);
                        setFocus({ rowId: task.id, col: "importance" });
                      }}
                      onKeyNav={(e) =>
                        handleNav(e, task.id, "importance", moveFocus)
                      }
                    >
                      <ScoreSelect
                        cellId={`${task.id}:importance`}
                        value={task.importance}
                        onChange={(n) =>
                          onUpdate(task.id, { importance: n })
                        }
                        label="중요도"
                      />
                    </EditCell>

                    {/* 시급성 */}
                    <EditCell
                      active={
                        focus?.rowId === task.id && focus.col === "urgency"
                      }
                      center
                      onFocusCell={() => {
                        setSelectedRow(task.id);
                        setFocus({ rowId: task.id, col: "urgency" });
                      }}
                      onKeyNav={(e) =>
                        handleNav(e, task.id, "urgency", moveFocus)
                      }
                    >
                      <ScoreSelect
                        cellId={`${task.id}:urgency`}
                        value={task.urgency}
                        onChange={(n) => onUpdate(task.id, { urgency: n })}
                        label="시급성"
                      />
                    </EditCell>

                    {/* 완료여부 */}
                    <td className="border border-black px-1 py-1 text-center align-middle">
                      {sheet === "todo" ? (
                        <input
                          type="checkbox"
                          className="size-[18px] accent-[#217346]"
                          aria-label={`${task.title} 완료여부`}
                          onChange={() => onComplete(task.id)}
                        />
                      ) : (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[13px] font-medium text-[#217346]"
                          onClick={() => onRestore(task.id)}
                          title="클릭하면 할 일로 복원"
                        >
                          <input
                            type="checkbox"
                            checked
                            readOnly
                            className="size-[16px] accent-[#217346]"
                            tabIndex={-1}
                          />
                          완료
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col border-t border-[#7a8288] bg-[#f0f2f4]">
        <div className="border-b border-[#c5ccd2] px-3 py-1 text-[11px] text-[#5c655f]">
          헤더(아버지 표와 동일): 순서 · 할일 LIST UP · 마감목표 · 중요도 ·
          시급성 · 완료여부
        </div>
        <div className="flex items-end gap-0 overflow-x-auto px-1 pt-1">
          <SheetTab
            active={sheet === "todo"}
            onClick={() => onSheetChange("todo")}
          >
            할 일
          </SheetTab>
          <SheetTab
            active={sheet === "done"}
            onClick={() => onSheetChange("done")}
          >
            한 일
          </SheetTab>
          <span className="mb-1.5 ml-2 hidden text-[11px] text-[#8a939a] sm:inline">
            캘린더·브리핑은 위 메뉴(장부 밖)
          </span>
        </div>
      </div>
    </div>
  );
}

function SheetTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative min-w-[4.5rem] rounded-t-md border border-b-0 px-4 py-2 text-[13px] font-semibold transition-colors ${
        active
          ? "z-10 -mb-px border-[#7a8288] bg-white text-[#217346]"
          : "border-transparent bg-[#cfd4d8] text-[#5c655f] hover:bg-[#e9ecef]"
      }`}
    >
      {children}
    </button>
  );
}

function EditCell({
  children,
  active,
  center,
  onFocusCell,
  onKeyNav,
}: {
  children: ReactNode;
  active?: boolean;
  center?: boolean;
  onFocusCell: () => void;
  onKeyNav: (e: KeyboardEvent) => void;
}) {
  return (
    <td
      className={`border border-black p-0 align-middle ${
        active ? "bg-[#eef7f1] outline outline-2 outline-[#217346] outline-offset-[-2px]" : ""
      } ${center ? "text-center" : ""}`}
      onClick={onFocusCell}
      onKeyDown={onKeyNav}
    >
      <div
        className={`flex min-h-11 items-stretch ${center ? "justify-center" : ""}`}
      >
        {children}
      </div>
    </td>
  );
}

function ScoreSelect({
  value,
  onChange,
  label,
  cellId,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  cellId?: string;
}) {
  return (
    <select
      data-excel-cell={cellId}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      className="excel-input text-center"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

function handleNav(
  e: KeyboardEvent,
  rowId: string,
  col: ColKey,
  move: (
    rowId: string,
    col: ColKey,
    dir: "next" | "prev" | "down" | "up",
  ) => void,
) {
  if (e.key === "Tab") {
    e.preventDefault();
    move(rowId, col, e.shiftKey ? "prev" : "next");
  } else if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
    e.preventDefault();
    move(rowId, col, e.shiftKey ? "up" : "down");
  }
}
