/**
 * Client-side sync crypto: hash code for lookup, AES-GCM encrypt payload.
 * Works in browser and Node 20+ (globalThis.crypto.subtle).
 */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-f]/gi, "");
  if (clean.length % 2 !== 0) throw new Error("잘못된 hex");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  if (typeof btoa === "function") return btoa(bin);
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/** Father-friendly code: XXXX-XXXX-XXXX (12 chars, no ambiguous letters). */
export function generateSyncCode(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}`;
}

export function normalizeSyncCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^(.{4})(.{4})(.{4}).*$/, "$1-$2-$3");
}

export function isValidSyncCode(code: string): boolean {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalizeSyncCode(code));
}

export async function hashSyncCode(code: string): Promise<string> {
  const normalized = normalizeSyncCode(code);
  const data = new TextEncoder().encode(`ilbiseo-sync-v1:${normalized}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

async function deriveAesKey(code: string): Promise<CryptoKey> {
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

export type EncryptedBlob = {
  ciphertext: string; // base64
  iv: string; // base64
};

export async function encryptJson(
  code: string,
  value: unknown,
): Promise<EncryptedBlob> {
  const key = await deriveAesKey(code);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plain,
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(cipher)),
    iv: bytesToBase64(iv),
  };
}

export async function decryptJson<T>(
  code: string,
  blob: EncryptedBlob,
): Promise<T> {
  const key = await deriveAesKey(code);
  const iv = base64ToBytes(blob.iv);
  const cipher = base64ToBytes(blob.ciphertext);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    cipher as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export function isCodeHash(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

export { hexToBytes, bytesToHex };
