/**
 * Pure unit checks for Google auth error mapping + reconnect UX helpers.
 * Run: npx tsx scripts/smoke-gcal-token-expired.ts
 */
import assert from "node:assert/strict";
import {
  formatGoogleApiError,
  GOOGLE_RECONNECT_MESSAGE,
  isGoogleTokenRevokedError,
  mapGoogleAuthError,
} from "../src/lib/google-oauth";

function ok(name: string, cond: boolean, detail?: unknown) {
  if (!cond) {
    console.error("FAIL", name, detail);
    process.exitCode = 1;
    return;
  }
  console.log("ok", name);
}

ok(
  "detect-english-revoked",
  isGoogleTokenRevokedError("Token has been expired or revoked."),
);
ok(
  "detect-invalid-grant",
  isGoogleTokenRevokedError("invalid_grant"),
);
ok(
  "map-refresh-revoked",
  mapGoogleAuthError("invalid_grant", "Token has been expired or revoked.") ===
    GOOGLE_RECONNECT_MESSAGE,
);
ok(
  "map-never-raw-english",
  !mapGoogleAuthError("invalid_grant", "Token has been expired or revoked.").includes(
    "Token has been",
  ),
);

const apiMsg = formatGoogleApiError(
  401,
  JSON.stringify({
    error: { message: "Token has been expired or revoked.", status: "UNAUTHENTICATED" },
  }),
  "일정",
);
ok("api-error-korean", apiMsg === GOOGLE_RECONNECT_MESSAGE, apiMsg);
ok("api-error-no-english", !apiMsg.includes("Token has been"), apiMsg);

const creds = formatGoogleApiError(
  401,
  JSON.stringify({ error: { message: "Invalid Credentials" } }),
  "캘린더 목록",
);
ok("invalid-credentials-korean", isGoogleTokenRevokedError(creds) || creds === GOOGLE_RECONNECT_MESSAGE, creds);

assert.equal(GOOGLE_RECONNECT_MESSAGE.includes("다시 연결"), true);

if (process.exitCode) {
  console.error("smoke-gcal-token-expired: FAILED");
  process.exit(1);
}
console.log("smoke-gcal-token-expired: PASS");
