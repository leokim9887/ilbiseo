import Image from "next/image";

/**
 * PC/desktop-only family encouragement banner.
 * Hidden below `sm` so phones stay focused on the workbook.
 * Expanded at top on desktop — motto only (no sub-copy).
 */
export function FamilyBanner() {
  return (
    <section
      className="relative -mx-2.5 mb-1 hidden overflow-hidden border-b border-[var(--grid-line)] shadow-[0_1px_0_rgba(26,43,54,0.04)] sm:mx-0 sm:block sm:rounded-2xl sm:border sm:border-[var(--grid-line)]"
      aria-label="가족 응원 배너"
      data-family-banner
    >
      <div className="relative aspect-[1680/660] w-full max-h-[17.5rem] lg:max-h-[20.5rem] xl:max-h-[22rem]">
        <Image
          src="/ilbiseo-family-banner.jpg"
          alt="가족과 반려 — 해변 셀피, 아기, 강아지, 고양이"
          fill
          priority
          sizes="(min-width: 640px) min(72rem, 100vw), 0px"
          className="object-cover object-[center_42%]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[rgba(22,63,57,0.32)] via-[rgba(22,63,57,0.08)] to-transparent" />
        <div className="absolute inset-y-0 left-0 flex max-w-[min(36rem,52%)] flex-col justify-center px-8 py-6 lg:px-10">
          <p className="font-[family-name:var(--font-display)] text-[1.85rem] font-bold leading-snug tracking-tight text-[var(--brand)] drop-shadow-[0_1px_0_rgba(255,252,248,0.6)] lg:text-[2.15rem]">
            진인사대천명(盡人事待天命)
          </p>
        </div>
      </div>
    </section>
  );
}
