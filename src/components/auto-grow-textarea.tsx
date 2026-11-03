"use client";

import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

type AutoGrowTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value: string;
};

/** Content-sized textarea — no manual resize handle. */
export const AutoGrowTextarea = forwardRef<
  HTMLTextAreaElement,
  AutoGrowTextareaProps
>(function AutoGrowTextarea(
  { className, value, onChange, onInput, ...props },
  forwardedRef,
) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(forwardedRef, () => ref.current as HTMLTextAreaElement);

  const syncHeight = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    syncHeight();
  }, [value]);

  return (
    <textarea
      {...props}
      ref={ref}
      rows={1}
      value={value}
      onChange={onChange}
      onInput={(e) => {
        syncHeight();
        onInput?.(e);
      }}
      className={cn(
        "resize-none overflow-hidden [field-sizing:fixed]",
        className,
      )}
    />
  );
});
