import { NextResponse } from "next/server";
import { isCodeHash } from "@/lib/sync-crypto";
import {
  loadSyncRecord,
  saveSyncRecord,
  syncStoreMode,
  type SyncRecord,
} from "@/lib/sync-store";

export const runtime = "nodejs";

/**
 * GET /api/sync?codeHash=...
 * Returns encrypted blob (ciphertext + iv + updatedAt). Server never sees plaintext.
 */
export async function GET(request: Request) {
  const codeHash = new URL(request.url).searchParams.get("codeHash") ?? "";
  if (!isCodeHash(codeHash)) {
    return NextResponse.json(
      { ok: false, error: "동기화 코드 해시가 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const mode = syncStoreMode();
  if (mode === "none") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "서버 저장소가 없습니다. UPSTASH_REDIS_REST_URL / TOKEN을 설정하세요.",
        storeMode: mode,
      },
      { status: 503 },
    );
  }

  const record = await loadSyncRecord(codeHash);
  if (!record) {
    return NextResponse.json({
      ok: true,
      empty: true,
      storeMode: mode,
      updatedAt: null,
      ciphertext: null,
      iv: null,
    });
  }

  return NextResponse.json({
    ok: true,
    empty: false,
    storeMode: mode,
    updatedAt: record.updatedAt,
    ciphertext: record.ciphertext,
    iv: record.iv,
  });
}

/**
 * PUT /api/sync
 * Body: { codeHash, ciphertext, iv, updatedAt }
 * Last-write-wins by updatedAt ISO timestamp.
 */
export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      codeHash?: string;
      ciphertext?: string;
      iv?: string;
      updatedAt?: string;
    };

    const codeHash = String(body.codeHash ?? "");
    const ciphertext = String(body.ciphertext ?? "");
    const iv = String(body.iv ?? "");
    const updatedAt = String(body.updatedAt ?? "");

    if (!isCodeHash(codeHash)) {
      return NextResponse.json(
        { ok: false, error: "동기화 코드 해시가 올바르지 않습니다." },
        { status: 400 },
      );
    }
    if (!ciphertext || !iv || !updatedAt) {
      return NextResponse.json(
        { ok: false, error: "ciphertext / iv / updatedAt이 필요합니다." },
        { status: 400 },
      );
    }
    const t = Date.parse(updatedAt);
    if (Number.isNaN(t)) {
      return NextResponse.json(
        { ok: false, error: "updatedAt이 올바른 시각이 아닙니다." },
        { status: 400 },
      );
    }
    if (ciphertext.length > 2_500_000) {
      return NextResponse.json(
        { ok: false, error: "데이터가 너무 큽니다." },
        { status: 413 },
      );
    }

    const mode = syncStoreMode();
    if (mode === "none") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "서버 저장소가 없습니다. UPSTASH_REDIS_REST_URL / TOKEN을 설정하세요.",
          storeMode: mode,
        },
        { status: 503 },
      );
    }

    const existing = await loadSyncRecord(codeHash);
    if (existing && Date.parse(existing.updatedAt) > t) {
      return NextResponse.json(
        {
          ok: false,
          conflict: true,
          message: "서버에 더 새 데이터가 있습니다. 먼저 불러오세요.",
          updatedAt: existing.updatedAt,
          ciphertext: existing.ciphertext,
          iv: existing.iv,
          storeMode: mode,
        },
        { status: 409 },
      );
    }

    const record: SyncRecord = { ciphertext, iv, updatedAt };
    const result = await saveSyncRecord(codeHash, record);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.message, store: result.store },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      store: result.store,
      storeMode: mode,
      updatedAt,
      message: "동기화됨",
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "동기화 저장 실패",
      },
      { status: 400 },
    );
  }
}
