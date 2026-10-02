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
  KIND_LABEL,
  type Task,
  type TaskCategory,
  type TaskKind,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { MemoImport } from "@/components/memo-import";
import { OcrImport } from "@/components/ocr-import";
import { Plus, RotateCcw, Trash2 } from "lucide-react";

export type WorkbookSheet = "todo" | "done";

type ColKey =
  | "done"
  | "title"
  | "kind"
  | "date"
  | "importance"
  | "urgency"
  | "memo"
  | "actions";

const TODO_COLS: { key: ColKey; letter: string; label: string; width: string }[] =
  [
    { key: "done", letter: "A", label: "완료", width: "56px" },
    { key: "title", letter: "B", label: "제목", width: "220px" },
    { key: "kind", letter: "C", label: "종류", width: "130px" },
    { key: "date", letter: "D", label: "목표기일", width: "128px" },
    { key: "importance", letter: "E", label: "중요", width: "64px" },
    { key: "urgency", letter: "F", label: "시급", width: "64px" },
    { key: "memo", letter: "G", label: "메모", width: "180px" },
    { key: "actions", letter: "H", label: "", width: "52px" },
  ];

const DONE_COLS: { key: ColKey; letter: string; label: string; width: string }[] =
  [
    { key: "date", letter: "A", label: "완료일", width: "140px" },
    { key: "title", letter: "B", label: "한 일", width: "240px" },
    { key: "kind", letter: "C", label: "종류", width: "120px" },
    { key: "memo", letter: "D", label: "메모", width: "200px" },
    { key: "actions", letter: "E", label: "", width: "120px" },
  ];

const KIND_ORDER: TaskKind[] = ["spot", "ongoing", "someday"];
const KIND_BAND: Record<TaskKind, string> = {
  spot: "① 스팟성 할일 — 오늘 안에 마무리",
  ongoing: "② 지속성 할일 — 오늘부터 목표기일까지",
  someday: "③ 언젠가 해야할 일 — 시급·중요 순",
};

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

  const cols = sheet === "todo" ? TODO_COLS : DONE_COLS;
  const editableCols: ColKey[] =
    sheet === "todo"
      ? ["title", "kind", "date", "importance", "urgency", "memo"]
      : ["title", "memo"];

  const todoRows = useMemo(() => {
    const rows: Array<
      | { type: "band"; kind: TaskKind; label: string }
      | { type: "task"; task: Task }
    > = [];
    for (const kind of KIND_ORDER) {
      const items = activeTasks.filter((t) => t.kind === kind);
      rows.push({ type: "band", kind, label: KIND_BAND[kind] });
      if (items.length === 0) {
        // empty band still shown for partition clarity
      } else {
        for (const task of items) rows.push({ type: "task", task });
      }
    }
    return rows;
  }, [activeTasks]);

  const moveFocus = useCallback(
    (rowId: string, col: ColKey, dir: "next" | "prev" | "down" | "up") => {
      const taskIds =
        sheet === "todo"
          ? todoRows.filter((r) => r.type === "task").map((r) => r.task.id)
          : doneTasks.map((t) => t.id);
      const colIdx = editableCols.indexOf(col);
      const rowIdx = taskIds.indexOf(rowId);
      if (rowIdx < 0) return;

      if (dir === "next" || dir === "prev") {
        const n = dir === "next" ? colIdx + 1 : colIdx - 1;
        if (n >= 0 && n < editableCols.length) {
          setFocus({ rowId, col: editableCols[n] });
          return;
        }
        const nr = dir === "next" ? rowIdx + 1 : rowIdx - 1;
        if (nr >= 0 && nr < taskIds.length) {
          setFocus({
            rowId: taskIds[nr],
            col: dir === "next" ? editableCols[0] : editableCols[editableCols.length - 1],
          });
        }
        return;
      }
      const nr = dir === "down" ? rowIdx + 1 : rowIdx - 1;
      if (nr >= 0 && nr < taskIds.length) {
        setFocus({ rowId: taskIds[nr], col });
      }
    },
    [sheet, todoRows, doneTasks, editableCols],
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
    <div className="excel-wb flex flex-col overflow-hidden rounded-sm border border-[#9aa5ad] bg-[#e9ecef] shadow-[0_2px_10px_rgba(26,43,54,0.12)]">
      {/* Title bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#b0b8bf] bg-gradient-to-b from-[#f7f8f9] to-[#e4e7ea] px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-[#1a2420]">
            일비서.xlsx
            <span className="ml-2 text-[12px] font-normal text-[#5c655f]">
              — 할 일 계획 및 정리
            </span>
          </p>
        </div>
        <p className="text-[13px] tabular-nums text-[#5c655f]">{today}</p>
      </div>

      {/* Ribbon / meta band */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#b0b8bf] bg-[#f3f4f6] px-3 py-2.5">
        <label className="flex items-center gap-2 text-[13px] text-[#1a2420]">
          <span className="font-semibold">틀</span>
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value as TaskCategory)}
            className="h-9 min-w-[7.5rem] rounded-sm border border-[#8a939a] bg-white px-2 text-[14px] font-medium shadow-inner outline-none focus:border-[#217346] focus:ring-1 focus:ring-[#217346]"
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <div className="mx-1 hidden h-6 w-px bg-[#c5ccd2] sm:block" />
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
            완료된 항목 · 복원하면 할 일 시트로 돌아갑니다
          </p>
        )}
        <span className="ml-auto text-[12px] text-[#5c655f]">
          {CATEGORY_LABEL[category]} ·{" "}
          {sheet === "todo"
            ? `할 일 ${activeTasks.length}행`
            : `한 일 ${doneTasks.length}행`}
        </span>
      </div>

      {/* Sheet frame */}
      <div
        ref={scrollRef}
        className="relative max-h-[min(68vh,720px)] min-h-[320px] overflow-auto bg-white"
      >
        <table className="w-full min-w-[860px] border-separate border-spacing-0 text-[15px] text-[#1a2420]">
          <thead className="sticky top-0 z-20">
            {/* Excel column letters */}
            <tr className="bg-[#f3f4f6]">
              <th className="sticky left-0 z-30 w-10 border-b border-r border-[#d0d4d9] bg-[#e9ecef] px-1 py-1 text-center text-[11px] font-normal text-[#6b736c]" />
              {cols.map((c) => (
                <th
                  key={`L-${c.key}`}
                  style={{ width: c.width, minWidth: c.width }}
                  className="border-b border-r border-[#d0d4d9] px-1 py-1 text-center text-[11px] font-semibold tracking-wide text-[#5c655f]"
                >
                  {c.letter}
                </th>
              ))}
            </tr>
            {/* Korean headers */}
            <tr className="bg-[#e8f0ea]">
              <th className="sticky left-0 z-30 border-b-2 border-r border-[#217346]/40 bg-[#dce8df] px-1 py-2 text-center text-[12px] font-semibold text-[#217346]">
                #
              </th>
              {cols.map((c) => (
                <th
                  key={`H-${c.key}`}
                  style={{ width: c.width, minWidth: c.width }}
                  className="border-b-2 border-r border-[#217346]/40 px-2 py-2 text-left text-[13px] font-bold text-[#163f39]"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet === "todo" ? (
              activeTasks.length === 0 ? (
                <EmptySheetRows
                  colSpan={cols.length + 1}
                  message="이 틀에 할 일이 없습니다. 「행 추가」로 첫 줄을 넣으세요."
                  action={
                    <button
                      type="button"
                      className="mt-2 text-[14px] font-semibold text-[#217346] underline"
                      onClick={onAdd}
                    >
                      행 추가
                    </button>
                  }
                />
              ) : (
                (() => {
                  let dataRow = 0;
                  return todoRows.map((row) => {
                    if (row.type === "band") {
                      const count = activeTasks.filter(
                        (t) => t.kind === row.kind,
                      ).length;
                      return (
                        <tr key={`band-${row.kind}`}>
                          <td
                            colSpan={cols.length + 1}
                            className="border-b border-r border-[#c5ccd2] bg-[#fff8e8] px-3 py-2 text-[13px] font-bold text-[#8a5420]"
                          >
                            {row.label}
                            <span className="ml-2 font-normal text-[#a07840]">
                              ({count}건)
                            </span>
                          </td>
                        </tr>
                      );
                    }
                    dataRow += 1;
                    const task = row.task;
                    const zebra = dataRow % 2 === 0;
                    const selected = selectedRow === task.id;
                    return (
                      <DataRow
                        key={task.id}
                        rowNum={dataRow}
                        selected={selected}
                        zebra={zebra}
                        onSelect={() => setSelectedRow(task.id)}
                      >
                        <Cell
                          active={focus?.rowId === task.id && focus.col === "done"}
                          center
                        >
                          <input
                            type="checkbox"
                            className="size-[18px] accent-[#217346]"
                            aria-label={`${task.title} 완료`}
                            onChange={() => onComplete(task.id)}
                          />
                        </Cell>
                        <EditCell
                          active={focus?.rowId === task.id && focus.col === "title"}
                          onFocusCell={() => {
                            setSelectedRow(task.id);
                            setFocus({ rowId: task.id, col: "title" });
                          }}
                          onKeyNav={(e) =>
                            handleNav(e, task.id, "title", moveFocus)
                          }
                        >
                          <input
                            data-excel-cell={`${task.id}:title`}
                            value={task.title}
                            onChange={(e) =>
                              onUpdate(task.id, { title: e.target.value })
                            }
                            className="excel-input"
                            aria-label="제목"
                          />
                        </EditCell>
                        <EditCell
                          active={focus?.rowId === task.id && focus.col === "kind"}
                          onFocusCell={() => {
                            setSelectedRow(task.id);
                            setFocus({ rowId: task.id, col: "kind" });
                          }}
                          onKeyNav={(e) =>
                            handleNav(e, task.id, "kind", moveFocus)
                          }
                        >
                          <select
                            data-excel-cell={`${task.id}:kind`}
                            value={task.kind}
                            onChange={(e) => {
                              const v = e.target.value as TaskKind;
                              onUpdate(task.id, {
                                kind: v,
                                targetDate:
                                  v === "someday"
                                    ? null
                                    : task.targetDate ??
                                      new Date().toISOString().slice(0, 10),
                              });
                            }}
                            className="excel-input"
                            aria-label="종류"
                          >
                            {(Object.keys(KIND_LABEL) as TaskKind[]).map((k) => (
                              <option key={k} value={k}>
                                {KIND_LABEL[k]}
                              </option>
                            ))}
                          </select>
                        </EditCell>
                        <EditCell
                          active={focus?.rowId === task.id && focus.col === "date"}
                          onFocusCell={() => {
                            setSelectedRow(task.id);
                            setFocus({ rowId: task.id, col: "date" });
                          }}
                          onKeyNav={(e) =>
                            handleNav(e, task.id, "date", moveFocus)
                          }
                        >
                          <input
                            data-excel-cell={`${task.id}:date`}
                            type="date"
                            value={task.targetDate ?? ""}
                            disabled={task.kind === "someday"}
                            onChange={(e) =>
                              onUpdate(task.id, {
                                targetDate: e.target.value || null,
                              })
                            }
                            className="excel-input disabled:opacity-40"
                            aria-label="목표기일"
                          />
                        </EditCell>
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
                            label="중요"
                          />
                        </EditCell>
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
                            label="시급"
                          />
                        </EditCell>
                        <EditCell
                          active={focus?.rowId === task.id && focus.col === "memo"}
                          onFocusCell={() => {
                            setSelectedRow(task.id);
                            setFocus({ rowId: task.id, col: "memo" });
                          }}
                          onKeyNav={(e) =>
                            handleNav(e, task.id, "memo", moveFocus)
                          }
                        >
                          <input
                            data-excel-cell={`${task.id}:memo`}
                            value={task.memo}
                            placeholder="메모"
                            onChange={(e) =>
                              onUpdate(task.id, { memo: e.target.value })
                            }
                            className="excel-input"
                            aria-label="메모"
                          />
                        </EditCell>
                        <Cell center>
                          <button
                            type="button"
                            className="inline-flex size-8 items-center justify-center text-[#6b736c] hover:text-[#b42318]"
                            aria-label="삭제"
                            onClick={() => onDelete(task.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </Cell>
                      </DataRow>
                    );
                  });
                })()
              )
            ) : doneTasks.length === 0 ? (
              <EmptySheetRows
                colSpan={cols.length + 1}
                message="한 일이 없습니다. 할 일 시트에서 완료하면 여기로 옵니다."
              />
            ) : (
              doneTasks.map((task, i) => {
                const zebra = (i + 1) % 2 === 0;
                const selected = selectedRow === task.id;
                return (
                  <DataRow
                    key={task.id}
                    rowNum={i + 1}
                    selected={selected}
                    zebra={zebra}
                    onSelect={() => setSelectedRow(task.id)}
                  >
                    <Cell>
                      <span className="px-1 text-[13px] text-[#5c655f]">
                        {task.completedAt
                          ? new Date(task.completedAt).toLocaleString("ko-KR", {
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </span>
                    </Cell>
                    <EditCell
                      active={focus?.rowId === task.id && focus.col === "title"}
                      onFocusCell={() => {
                        setSelectedRow(task.id);
                        setFocus({ rowId: task.id, col: "title" });
                      }}
                      onKeyNav={(e) =>
                        handleNav(e, task.id, "title", moveFocus)
                      }
                    >
                      <input
                        data-excel-cell={`${task.id}:title`}
                        value={task.title}
                        onChange={(e) =>
                          onUpdate(task.id, { title: e.target.value })
                        }
                        className="excel-input font-medium"
                        aria-label="한 일 제목"
                      />
                    </EditCell>
                    <Cell>
                      <span className="px-1 text-[13px]">
                        {KIND_LABEL[task.kind]}
                      </span>
                    </Cell>
                    <EditCell
                      active={focus?.rowId === task.id && focus.col === "memo"}
                      onFocusCell={() => {
                        setSelectedRow(task.id);
                        setFocus({ rowId: task.id, col: "memo" });
                      }}
                      onKeyNav={(e) =>
                        handleNav(e, task.id, "memo", moveFocus)
                      }
                    >
                      <input
                        data-excel-cell={`${task.id}:memo`}
                        value={task.memo}
                        onChange={(e) =>
                          onUpdate(task.id, { memo: e.target.value })
                        }
                        className="excel-input"
                        aria-label="메모"
                      />
                    </EditCell>
                    <Cell>
                      <div className="flex items-center gap-0.5 px-0.5">
                        <button
                          type="button"
                          className="inline-flex h-8 items-center gap-1 rounded-sm px-2 text-[12px] font-medium text-[#217346] hover:bg-[#e8f0ea]"
                          onClick={() => onRestore(task.id)}
                        >
                          <RotateCcw className="size-3" />
                          복원
                        </button>
                        <button
                          type="button"
                          className="inline-flex size-8 items-center justify-center text-[#6b736c] hover:text-[#b42318]"
                          aria-label="삭제"
                          onClick={() => onDelete(task.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </Cell>
                  </DataRow>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Formula-ish status + sheet tabs */}
      <div className="flex flex-col border-t border-[#9aa5ad] bg-[#f3f4f6]">
        <div className="border-b border-[#d0d4d9] px-3 py-1 text-[11px] text-[#5c655f]">
          {focus
            ? `셀 ${cols.find((c) => c.key === focus.col)?.letter ?? ""} · Tab/Enter로 이동 · 자동 저장`
            : "셀을 누르면 바로 고칩니다 · 비슷한 일은 위→아래 스팟·지속·언젠가 순"}
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
          ? "z-10 -mb-px border-[#9aa5ad] bg-white text-[#217346]"
          : "border-transparent bg-[#dfe3e6] text-[#5c655f] hover:bg-[#e9ecef]"
      }`}
    >
      {children}
    </button>
  );
}

function DataRow({
  rowNum,
  selected,
  zebra,
  onSelect,
  children,
}: {
  rowNum: number;
  selected: boolean;
  zebra: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <tr
      onClick={onSelect}
      className={`${selected ? "bg-[#e3f0e8]" : zebra ? "bg-[#fafafa]" : "bg-white"}`}
    >
      <td className="sticky left-0 z-10 border-b border-r border-[#d0d4d9] bg-inherit px-1 py-0 text-center text-[12px] tabular-nums text-[#6b736c]">
        {rowNum}
      </td>
      {children}
    </tr>
  );
}

function Cell({
  children,
  center,
  active,
}: {
  children: ReactNode;
  center?: boolean;
  active?: boolean;
}) {
  return (
    <td
      className={`border-b border-r border-[#d0d4d9] px-1 py-0 align-middle ${
        center ? "text-center" : ""
      } ${active ? "outline outline-2 outline-[#217346] outline-offset-[-2px]" : ""}`}
    >
      <div className={`flex min-h-10 items-center ${center ? "justify-center" : ""}`}>
        {children}
      </div>
    </td>
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
      className={`border-b border-r border-[#d0d4d9] p-0 align-middle ${
        active ? "outline outline-2 outline-[#217346] outline-offset-[-2px] bg-[#eef7f1]" : ""
      }`}
      onClick={onFocusCell}
      onKeyDown={onKeyNav}
    >
      <div
        className={`flex min-h-10 items-stretch ${center ? "justify-center" : ""}`}
      >
        {children}
      </div>
    </td>
  );
}

function EmptySheetRows({
  colSpan,
  message,
  action,
}: {
  colSpan: number;
  message: string;
  action?: ReactNode;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="border-b border-[#d0d4d9] px-4 py-16 text-center text-[15px] text-[#5c655f]"
      >
        <p>{message}</p>
        {action}
      </td>
    </tr>
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
  } else if (e.key === "Enter") {
    e.preventDefault();
    move(rowId, col, e.shiftKey ? "up" : "down");
  }
}
