"use client";

import {
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

type AutoGrowTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value: string;
};

/** Content-sized textarea — no manual resize handle. */
export function AutoGrowTextarea({
  className,
  value,
  onChange,
  onInput,
  ...props
}: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

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
      className={cn("resize-none overflow-hidden", className)}
    />
  );
}
