"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, RotateCcw, Smartphone, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BannerBgMeta, BannerBgSlot } from "@/lib/banner-bg";
import { DEFAULT_BANNER_MOBILE, DEFAULT_BANNER_PC } from "@/lib/banner-bg";

type BannerBgUrls = { mobile: string; pc: string };

export type BannerBgSettingsProps = {
  meta: BannerBgMeta;
  urls: BannerBgUrls;
  busy: boolean;
  error: string | null;
  onPick: (slot: BannerBgSlot | "both", file: File) => void | Promise<void>;
  onReset: (slot: BannerBgSlot | "all") => void | Promise<void>;
  onClearError?: () => void;
};

function SlotPreview({
  label,
  hint,
  icon: Icon,
  src,
  isCustom,
  defaultSrc,
}: {
  label: string;
  hint: string;
  icon: typeof Smartphone;
  src: string;
  isCustom: boolean;
  defaultSrc: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--grid-line)] bg-[var(--sheet)]">
      <div className="relative aspect-[16/7] w-full bg-[var(--sheet-header)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src || defaultSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,rgba(22,63,57,0.45)_0%,rgba(22,63,57,0.12)_35%,transparent_55%)]"
          aria-hidden
        />
        <div className="absolute left-2.5 top-2.5 max-w-[70%]">
          <p
            className="truncate text-[11px] font-semibold leading-tight sm:text-[12px]"
            style={{
              color: "#C9B27C",
              textShadow: "0 1px 2px rgba(8,20,18,0.72)",
            }}
          >
            진인사대천명…
          </p>
        </div>
        <div className="absolute bottom-2 left-2.5 right-2.5 flex justify-between gap-2">
          <span className="rounded-md bg-black/35 px-1.5 py-0.5 text-[11px] font-medium text-white/95 backdrop-blur-[2px]">
            {isCustom ? "내가 고른 사진" : "기본 사진"}
          </span>
        </div>
      </div>
      <div className="flex items-start gap-2 px-3 py-2.5">
        <Icon
          className="mt-0.5 size-4 shrink-0 text-[var(--ink-muted)]"
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-[var(--ink)]">{label}</p>
          <p className="text-[12px] leading-snug text-[var(--ink-muted)]">
            {hint}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Father-friendly: change only the top banner background photo(s).
 * Motto / cheer / counters stay in the app — not editable here.
 */
export function BannerBgSettings({
  meta,
  urls,
  busy,
  error,
  onPick,
  onReset,
  onClearError,
}: BannerBgSettingsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<BannerBgSlot | "both">("both");
  const anyCustom = meta.mobile || meta.pc;

  const openPicker = (slot: BannerBgSlot | "both") => {
    onClearError?.();
    setTarget(slot);
    // defer so React state settles before click opens picker
    requestAnimationFrame(() => fileRef.current?.click());
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    void onPick(target, file);
  };

  return (
    <div
      className="rounded-xl border border-[var(--grid-line)] bg-[var(--sheet-header)]/60 px-4 py-4"
      data-banner-bg-settings
    >
      <p className="text-[15px] font-semibold text-[var(--ink)]">
        맨 위 배너 사진
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-muted)]">
        배경 사진만 바꿀 수 있습니다. 「진인사대천명」·화이팅·할 일 숫자는
        그대로 보입니다.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SlotPreview
          label="휴대폰 화면"
          hint="세로에 맞게 잘린 배너"
          icon={Smartphone}
          src={urls.mobile}
          isCustom={meta.mobile}
          defaultSrc={DEFAULT_BANNER_MOBILE}
        />
        <SlotPreview
          label="컴퓨터 화면"
          hint="넓은 화면에 쓰는 배너"
          icon={Monitor}
          src={urls.pc}
          isCustom={meta.pc}
          defaultSrc={DEFAULT_BANNER_PC}
        />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={onFileChange}
      />

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="default"
          size="lg"
          className="min-h-12 justify-start gap-3 px-4 text-[15px]"
          disabled={busy}
          data-banner-bg-pick-both
          onClick={() => openPicker("both")}
        >
          <ImagePlus className="size-5 shrink-0" aria-hidden />
          <span className="flex flex-col items-start gap-0.5 text-left">
            <span className="font-semibold leading-none">
              같은 사진으로 바꾸기
            </span>
            <span className="text-[12px] font-normal leading-tight text-[var(--primary-foreground)]/85">
              휴대폰·컴퓨터 둘 다
            </span>
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="min-h-12 justify-start gap-3 px-4 text-[15px]"
          disabled={busy}
          data-banner-bg-pick-mobile
          onClick={() => openPicker("mobile")}
        >
          <Smartphone className="size-5 shrink-0" aria-hidden />
          <span className="flex flex-col items-start gap-0.5 text-left">
            <span className="font-semibold leading-none">휴대폰만 바꾸기</span>
            <span className="text-[12px] font-normal leading-tight text-[var(--ink-muted)]">
              갤러리·파일에서 고르기
            </span>
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="min-h-12 justify-start gap-3 px-4 text-[15px]"
          disabled={busy}
          data-banner-bg-pick-pc
          onClick={() => openPicker("pc")}
        >
          <Monitor className="size-5 shrink-0" aria-hidden />
          <span className="flex flex-col items-start gap-0.5 text-left">
            <span className="font-semibold leading-none">컴퓨터만 바꾸기</span>
            <span className="text-[12px] font-normal leading-tight text-[var(--ink-muted)]">
              갤러리·파일에서 고르기
            </span>
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="min-h-12 justify-start gap-3 px-4 text-[15px]"
          disabled={busy || !anyCustom}
          data-banner-bg-reset-all
          onClick={() => void onReset("all")}
        >
          <RotateCcw className="size-5 shrink-0" aria-hidden />
          <span className="flex flex-col items-start gap-0.5 text-left">
            <span className="font-semibold leading-none">기본 사진으로</span>
            <span className="text-[12px] font-normal leading-tight text-[var(--ink-muted)]">
              처음 가족 사진으로 되돌리기
            </span>
          </span>
        </Button>
      </div>

      {(meta.mobile || meta.pc) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {meta.mobile ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 text-[13px]"
              disabled={busy}
              data-banner-bg-reset-mobile
              onClick={() => void onReset("mobile")}
            >
              휴대폰만 기본으로
            </Button>
          ) : null}
          {meta.pc ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 text-[13px]"
              disabled={busy}
              data-banner-bg-reset-pc
              onClick={() => void onReset("pc")}
            >
              컴퓨터만 기본으로
            </Button>
          ) : null}
        </div>
      )}

      {busy ? (
        <p className="mt-3 text-[13px] text-[var(--ink-muted)]" role="status">
          사진을 넣는 중…
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-[13px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <p className="mt-3 text-[12px] leading-relaxed text-[var(--ink-muted)]">
        이 기기에만 저장됩니다. PC↔폰 할 일 동기화와는 별개입니다.
      </p>
    </div>
  );
}
