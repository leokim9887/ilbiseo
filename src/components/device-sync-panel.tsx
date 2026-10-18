"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  generateSyncCode,
  isValidSyncCode,
  normalizeSyncCode,
  type DeviceSyncPrefs,
} from "@/lib/device-sync";
import { Check, Copy, Loader2, RefreshCw, Smartphone } from "lucide-react";

type DeviceSyncPanelProps = {
  prefs: DeviceSyncPrefs;
  busy: boolean;
  onPrefsChange: (next: DeviceSyncPrefs) => void;
  onSyncNow: () => void;
  onEnabledPull: (code: string) => void;
};

export function DeviceSyncPanel({
  prefs,
  busy,
  onPrefsChange,
  onSyncNow,
  onEnabledPull,
}: DeviceSyncPanelProps) {
  const [draftCode, setDraftCode] = useState(prefs.code);
  const [copied, setCopied] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const enableWithCode = (code: string) => {
    const normalized = normalizeSyncCode(code);
    if (!isValidSyncCode(normalized)) {
      setHint("코드 형식을 확인해 주세요. (XXXX-XXXX-XXXX)");
      return;
    }
    setDraftCode(normalized);
    setHint(null);
    onPrefsChange({
      ...prefs,
      enabled: true,
      code: normalized,
    });
    onEnabledPull(normalized);
  };

  const handleCreate = () => {
    const code = generateSyncCode();
    setDraftCode(code);
    enableWithCode(code);
    setHint("코드를 만들었습니다. 폰에도 넣어 주세요.");
  };

  const handleConnect = () => {
    enableWithCode(draftCode);
  };

  const handleCopy = async () => {
    const code = prefs.code || normalizeSyncCode(draftCode);
    if (!isValidSyncCode(code)) {
      setHint("먼저 코드를 만들거나 입력하세요.");
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      setHint("복사했습니다. 폰 설정에 붙여 넣으세요.");
    } catch {
      setHint(`복사 실패 — 직접 적으세요: ${code}`);
    }
  };

  const handleDisable = () => {
    onPrefsChange({
      ...prefs,
      enabled: false,
    });
    setHint("동기화를 껐습니다. 이 기기 데이터는 그대로 둡니다.");
  };

  return (
    <div className="rounded-xl border border-[var(--grid-line)] bg-[var(--sheet-header)]/60 px-4 py-4">
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 size-5 shrink-0 text-[var(--brand)]" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-[15px] font-semibold text-[var(--ink)]">
              PC ↔ 폰 동기화
            </p>
            <p className="mt-1 text-[14px] leading-relaxed text-[var(--ink-muted)]">
              같은 코드로 PC와 폰 할 일을 맞춥니다. 편집·화면 전환 시 바로 · 약 10분마다 자동 · 「지금 동기화」.
            </p>
          </div>

          {prefs.enabled && prefs.code ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-[var(--grid-line)] bg-[var(--sheet)] px-3 py-3">
                <p className="text-[13px] text-[var(--ink-muted)]">내 동기화 코드</p>
                <p className="mt-1 font-mono text-xl font-semibold tracking-wider text-[var(--ink)]">
                  {prefs.code}
                </p>
                {prefs.lastSyncedAt ? (
                  <p className="mt-1 text-[13px] text-[var(--ink-muted)]">
                    마지막 동기화 ·{" "}
                    {new Date(prefs.lastSyncedAt).toLocaleString("ko-KR")}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  size="lg"
                  className="min-h-12 w-full touch-manipulation sm:min-h-11 sm:w-auto"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="size-4" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                  {copied ? "복사됨" : "코드 복사"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="min-h-12 w-full touch-manipulation sm:min-h-11 sm:w-auto"
                  disabled={busy}
                  onClick={onSyncNow}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  지금 동기화
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  className="min-h-12 w-full touch-manipulation sm:min-h-11 sm:w-auto"
                  onClick={handleDisable}
                >
                  동기화 끄기
                </Button>
              </div>

              <p className="text-[14px] leading-relaxed text-[var(--ink-muted)]">
                이 코드를 폰 설정에도 넣으세요.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="sync-code" className="text-[14px]">
                  동기화 코드
                </Label>
                <Input
                  id="sync-code"
                  value={draftCode}
                  onChange={(e) => {
                    setDraftCode(e.target.value.toUpperCase());
                    setHint(null);
                  }}
                  placeholder="XXXX-XXXX-XXXX"
                  className="min-h-11 font-mono text-base tracking-wider"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  size="lg"
                  className="min-h-12 w-full touch-manipulation sm:min-h-11 sm:w-auto"
                  onClick={handleCreate}
                >
                  새 코드 만들기
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="min-h-12 w-full touch-manipulation sm:min-h-11 sm:w-auto"
                  disabled={busy}
                  onClick={handleConnect}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  이 코드로 연결
                </Button>
              </div>

            </div>
          )}

          {hint ? (
            <p className="text-[14px] text-[var(--ink)]" role="status">
              {hint}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
