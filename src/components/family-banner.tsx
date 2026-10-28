"use client";

import Image from "next/image";
import {
  DEFAULT_BANNER_MOBILE,
  DEFAULT_BANNER_PC,
} from "@/lib/banner-bg";

export interface FamilyBannerProps {
  activeCount: number;
  doneCount: number;
  calendarCount: number;
  /** Custom phone banner bg (blob: or path). Motto/stats overlays stay fixed. */
  mobileSrc?: string;
  /** Custom desktop banner bg (blob: or path). */
  pcSrc?: string;
}

/** Refined champagne gold — soft metallic, readable on night photo (not neon). */
const MOTTO_GOLD = "#C9B27C";

function isBlobOrDataUrl(src: string): boolean {
  return src.startsWith("blob:") || src.startsWith("data:");
}

function BannerPhoto({
  src,
  alt,
  className,
  sizes,
  priority,
}: {
  src: string;
  alt: string;
  className: string;
  sizes: string;
  priority?: boolean;
}) {
  if (isBlobOrDataUrl(src)) {
    return (
      // Custom uploads use object URLs — next/image is for built-in assets.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={`absolute inset-0 h-full w-full ${className}`}
        decoding="async"
      />
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      priority={priority}
      sizes={sizes}
      className={className}
      unoptimized
    />
  );
}

/**
 * Seamless top surface: family atmosphere + motto + inline stats.
 * Background photo can be customized in 설정; overlays stay fixed.
 */
export function FamilyBanner({
  activeCount,
  doneCount,
  calendarCount,
  mobileSrc = DEFAULT_BANNER_MOBILE,
  pcSrc = DEFAULT_BANNER_PC,
}: FamilyBannerProps) {
  return (
    <section
      className="relative -mx-2 overflow-hidden max-sm:rounded-b-[1rem] sm:mx-0 sm:rounded-lg"
      aria-label="가족 응원 배너"
      data-family-banner
    >
      {/* Phone: taller balanced crop; desktop: wide banner fills fullscreen width */}
      <div className="relative aspect-[1170/780] w-full sm:aspect-[1680/700]">
        {/* Mobile asset */}
        <BannerPhoto
          src={mobileSrc}
          alt="가족과 반려 — 해변 셀피, 아기, 강아지, 고양이"
          sizes="100vw"
          priority
          className="object-cover object-left sm:hidden"
        />
        {/* PC asset */}
        <BannerPhoto
          src={pcSrc}
          alt="가족과 반려 — 해변 셀피, 아기, 강아지, 고양이"
          sizes="(min-width: 640px) min(110rem, 100vw), 100vw"
          priority
          className="hidden object-cover object-center sm:block"
        />
        {/* Soft scrim — keep motto/stats readable on any background */}
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(22,63,57,0.5)_0%,rgba(22,63,57,0.18)_20%,transparent_38%),linear-gradient(100deg,rgba(22,63,57,0.38)_0%,rgba(22,63,57,0.14)_20%,transparent_38%),linear-gradient(to_top,rgba(22,63,57,0.42)_0%,rgba(22,63,57,0.12)_28%,transparent_48%)] sm:bg-[linear-gradient(100deg,rgba(22,63,57,0.52)_0%,rgba(22,63,57,0.24)_22%,rgba(22,63,57,0.06)_40%,transparent_52%),linear-gradient(to_top,rgba(22,63,57,0.45)_0%,rgba(22,63,57,0.14)_30%,transparent_50%)]"
          aria-hidden
        />

        <div className="absolute inset-0 flex flex-col justify-between gap-2 px-3.5 pb-3 pt-3.5 sm:justify-between sm:gap-0 sm:px-6 sm:pb-5 sm:pt-6 lg:px-8 xl:px-10">
          <div className="max-w-[min(20rem,88%)] sm:mt-1 sm:max-w-[min(26rem,40%)]">
            <p
              className="font-sans text-[1.22rem] font-semibold leading-snug tracking-tight sm:text-[1.7rem] sm:font-bold lg:text-[1.9rem]"
              style={{
                color: MOTTO_GOLD,
                textShadow:
                  "0 1px 2px rgba(8,20,18,0.72), 0 0 18px rgba(22,63,57,0.35)",
              }}
              data-family-banner-motto
            >
              진인사대천명(盡人事待天命)
            </p>
            <p
              className="mt-1 font-sans text-[0.92rem] font-medium leading-snug tracking-tight sm:mt-1.5 sm:text-[1.05rem] sm:font-semibold"
              style={{
                color: MOTTO_GOLD,
                textShadow:
                  "0 1px 2px rgba(8,20,18,0.68), 0 0 14px rgba(22,63,57,0.3)",
              }}
              data-family-banner-cheer
            >
              언제나 화이팅입니다!
            </p>
          </div>

          {/* Inline muted stats fused into banner — no white card */}
          <dl
            className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-[14px] sm:ml-auto sm:gap-x-6 sm:text-[15px]"
            data-family-banner-stats
            style={{
              textShadow: "0 1px 2px rgba(8,20,18,0.75), 0 0 12px rgba(8,20,18,0.35)",
            }}
          >
            <div className="flex items-baseline gap-1.5">
              <dt className="text-[12px] font-medium text-[#d5e4df]/95 sm:text-[13px]">
                할 일
              </dt>
              <dd className="text-base font-semibold tabular-nums text-[#fffcf8] sm:text-lg">
                {activeCount}
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-[12px] font-medium text-[#d5e4df]/95 sm:text-[13px]">
                한 일
              </dt>
              <dd className="text-base font-semibold tabular-nums text-[#fffcf8] sm:text-lg">
                {doneCount}
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-[12px] font-medium text-[#d5e4df]/95 sm:text-[13px]">
                일정
              </dt>
              <dd className="text-base font-semibold tabular-nums text-[#fffcf8] sm:text-lg">
                {calendarCount}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
