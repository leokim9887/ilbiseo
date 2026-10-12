import Image from "next/image";

/**
 * PC/desktop-only family encouragement banner.
 * Hidden below `sm` so phones stay focused on the workbook.
 */
export function FamilyBanner() {
  return (
    <section
      className="relative mb-1 hidden overflow-hidden rounded-2xl border border-[var(--grid-line)] shadow-[0_1px_0_rgba(26,43,54,0.05)] sm:block"
      aria-label="가족 응원 배너"
      data-family-banner
    >
      <div className="relative aspect-[1680/420] w-full max-h-[13.5rem] lg:max-h-[15.5rem]">
        <Image
          src="/ilbiseo-family-banner.jpg"
          alt="가족과 반려 — 해변 셀피, 아기, 강아지, 고양이"
          fill
          priority
          sizes="(min-width: 640px) min(72rem, 100vw), 0px"
          className="object-cover object-center"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[rgba(22,63,57,0.28)] via-transparent to-transparent" />
        <div className="absolute inset-y-0 left-0 flex max-w-[min(34rem,58%)] flex-col justify-center px-7 py-5 lg:px-9">
          <p className="font-[family-name:var(--font-display)] text-[1.65rem] font-bold leading-snug tracking-tight text-[var(--brand)] drop-shadow-[0_1px_0_rgba(255,252,248,0.55)] lg:text-[1.95rem]">
            진인사대천명(盡人事待天命)
          </p>
          <span
            className="mt-2 h-0.5 w-14 rounded-full bg-[var(--accent-spot)]"
            aria-hidden
          />
          <p className="mt-2.5 text-[14px] leading-relaxed text-[var(--ink-muted)] lg:text-[15px]">
            아들과 가족 · 반려와 함께 — 할 수 있는 일을 다 하고, 결과는 시간에
            맡깁니다.
          </p>
        </div>
      </div>
    </section>
  );
}
