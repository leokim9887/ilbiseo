"use client";

import { Search, X } from "lucide-react";
import type { SideSearchHit } from "@/lib/schedule-search";
import { SIDE_LIST_LABEL } from "@/lib/types";

type ScheduleSearchProps = {
  value: string;
  onChange: (next: string) => void;
  matchCount: number;
  /** Visible when query non-empty */
  searching: boolean;
  sideHits: SideSearchHit[];
  onJumpSide: (hit: SideSearchHit) => void;
  onClear: () => void;
  /** Enter — jump/focus first match */
  onSubmit?: () => void;
};

/**
 * Toolbar-aligned search — Toss shell + brand teal, filter-as-you-type.
 */
export function ScheduleSearch({
  value,
  onChange,
  matchCount,
  searching,
  sideHits,
  onJumpSide,
  onClear,
  onSubmit,
}: ScheduleSearchProps) {
  return (
    <div
      className="flex w-full flex-col gap-1.5 border-b border-[#9aa5ad] bg-[#f7f9fb] px-2.5 py-2 dark:border-[#3a4a42] dark:bg-[#1c2622] sm:border-[var(--grid-line)] sm:bg-[var(--sheet-header)]/70 sm:px-3"
      data-schedule-search
    >
      <label className="relative flex min-w-0 items-center">
        <Search
          className="pointer-events-none absolute left-3 size-4 text-[var(--brand)] opacity-80"
          aria-hidden
        />
        <input
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit?.();
            }
          }}
          placeholder="할 일 · 지침 · 습관 찾기"
          aria-label="할 일 · 지침 · 습관 찾기"
          data-schedule-search-input
          className="h-11 min-h-11 w-full touch-manipulation rounded-xl border border-[#c5ccd3] bg-white py-2 pr-10 pl-10 text-[16px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20 dark:border-[#4a5c52] dark:bg-[#24302a] dark:text-[#e8ece9] sm:h-9 sm:min-h-9 sm:rounded-lg sm:text-[14px]"
        />
        {value ? (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-1.5 inline-flex size-9 touch-manipulation items-center justify-center rounded-lg text-[var(--ink-muted)] hover:bg-[#eef1f4] hover:text-[var(--ink)] dark:hover:bg-[#2a3530]"
            aria-label="검색어 지우기"
            data-schedule-search-clear
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </label>

      {searching ? (
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1 px-0.5 text-[13px] text-[var(--ink-muted)]"
          data-schedule-search-meta
        >
          <span data-schedule-search-count>
            {matchCount > 0
              ? `할 일 ${matchCount}건`
              : "맞는 할 일이 없습니다"}
          </span>
          {sideHits.length > 0 ? (
            <span className="text-[var(--ink-muted)]">·</span>
          ) : null}
          {sideHits.slice(0, 6).map((hit) => (
            <button
              key={`${hit.kind}-${hit.item.id}`}
              type="button"
              onClick={() => onJumpSide(hit)}
              className="inline-flex max-w-[12rem] touch-manipulation items-center truncate rounded-full border border-[var(--brand)]/25 bg-[var(--accent)]/60 px-2.5 py-1 text-[12.5px] font-medium text-[var(--brand)] hover:bg-[var(--accent)]"
              data-schedule-search-side-hit
              data-side-kind={hit.kind}
              title={`${SIDE_LIST_LABEL[hit.kind]}: ${hit.item.title}`}
            >
              {SIDE_LIST_LABEL[hit.kind]} · {hit.item.title || "(제목 없음)"}
            </button>
          ))}
          {sideHits.length > 6 ? (
            <span className="text-[12px]">외 {sideHits.length - 6}건</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
