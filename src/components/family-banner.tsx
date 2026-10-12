import Image from "next/image";

export interface FamilyBannerProps {
  activeCount: number;
  doneCount: number;
  calendarCount: number;
}

/**
 * Seamless top surface: family atmosphere + motto + inline stats.
 * Shown on PC and mobile (shorter on phone). No separate title strip / stats card.
 */
export function FamilyBanner({
  activeCount,
  doneCount,
  calendarCount,
}: FamilyBannerProps) {
  return (
    <section
      className="relative -mx-2.5 overflow-hidden sm:mx-0 sm:rounded-xl"
      aria-label="가족 응원 배너"
      data-family-banner
    >
      {/* Phone: shorter crop; desktop: full banner aspect */}
      <div className="relative aspect-[1680/980] w-full sm:aspect-[1680/700]">
        <Image
          src="/ilbiseo-family-banner.jpg"
          alt="가족과 반려 — 해변 셀피, 아기, 강아지, 고양이"
          fill
          priority
          sizes="(min-width: 640px) min(72rem, 100vw), 100vw"
          className="object-cover object-[22%_40%] sm:object-center"
        />
        {/* Soft scrim only — calm left/bottom for motto + stats (same surface) */}
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,rgba(22,63,57,0.58)_0%,rgba(22,63,57,0.3)_26%,rgba(22,63,57,0.08)_46%,transparent_58%),linear-gradient(to_top,rgba(22,63,57,0.5)_0%,rgba(22,63,57,0.18)_34%,transparent_55%)]"
          aria-hidden
        />

        <div className="absolute inset-0 flex flex-col justify-end gap-2.5 px-3.5 pb-3 pt-8 sm:justify-between sm:gap-0 sm:px-8 sm:pb-5 sm:pt-7 lg:px-10">
          <p className="max-w-[min(22rem,94%)] font-sans text-[1.28rem] font-semibold leading-snug tracking-tight text-[#f4faf8] sm:mt-1 sm:max-w-[min(28rem,46%)] sm:text-[1.7rem] sm:font-bold lg:text-[1.9rem]">
            진인사대천명(盡人事待天命)
          </p>

          {/* Inline muted stats fused into banner — no white card */}
          <dl
            className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-[14px] sm:ml-auto sm:gap-x-6 sm:text-[15px]"
            data-family-banner-stats
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
