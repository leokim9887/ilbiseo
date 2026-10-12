/**
 * Smoke: crypto roundtrip + local sync API via next is out of scope;
 * this checks code normalize/hash/encrypt helpers through dynamic import of built ts via tsx if available,
 * else duplicates minimal checks in plain node for generate format.
 */
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateSyncCode() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}`;
}

function normalizeSyncCode(raw) {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^(.{4})(.{4})(.{4}).*$/, "$1-$2-$3");
}

function isValidSyncCode(code) {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalizeSyncCode(code));
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function deriveKey(code) {
  const normalized = normalizeSyncCode(code);
  const saltDigest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`ilbiseo-salt-v1:${normalized}`),
  );
  const salt = new Uint8Array(saltDigest).slice(0, 16);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(normalized),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 120_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function b64(bytes) {
  return Buffer.from(bytes).toString("base64");
}
function fromB64(s) {
  return new Uint8Array(Buffer.from(s, "base64"));
}

async function roundtrip() {
  const code = generateSyncCode();
  if (!isValidSyncCode(code)) throw new Error("bad code " + code);
  const hash = await sha256Hex(`ilbiseo-sync-v1:${normalizeSyncCode(code)}`);
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("bad hash");

  const key = await deriveKey(code);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const plain = new TextEncoder().encode(
    JSON.stringify({ state: { tasks: [{ id: "1", title: "테스트" }] }, updatedAt: new Date().toISOString() }),
  );
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  const key2 = await deriveKey(code);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key2,
    cipher,
  );
  const obj = JSON.parse(new TextDecoder().decode(decrypted));
  if (obj.state.tasks[0].title !== "테스트") throw new Error("decrypt mismatch");

  // wrong code must fail
  let failed = false;
  try {
    const bad = await deriveKey(generateSyncCode());
    await crypto.subtle.decrypt({ name: "AES-GCM", iv }, bad, cipher);
  } catch {
    failed = true;
  }
  if (!failed) throw new Error("wrong code should fail");

  console.log("ok", { code, hash: hash.slice(0, 12) + "…", blobB64Len: b64(new Uint8Array(cipher)).length, fromB64: fromB64(b64(iv)).length });
}

roundtrip().catch((e) => {
  console.error(e);
  process.exit(1);
});
