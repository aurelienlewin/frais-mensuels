import type { AppState } from '../state/types';

export type EncryptedPayloadV1 = {
  v: 1;
  kdf: 'PBKDF2-SHA256';
  iter: number;
  saltB64: string;
  ivB64: string;
  ctB64: string;
};

export type SyncRecordV1 = {
  v: 1;
  modifiedAt: string; // ISO string (comes from AppState.modifiedAt)
  updatedAt: string; // ISO string (server-side)
  payload: EncryptedPayloadV1;
};

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function isSyncCryptoSupported() {
  return (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.getRandomValues === 'function' &&
    typeof TextEncoder !== 'undefined' &&
    typeof TextDecoder !== 'undefined'
  );
}

export async function deriveSyncId(passphrase: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(passphrase));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function deriveAesKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptState(state: AppState, passphrase: string): Promise<EncryptedPayloadV1> {
  const iter = 120_000;
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const key = await deriveAesKey(passphrase, salt, iter);
  const encoded = new TextEncoder().encode(JSON.stringify(state));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iter,
    saltB64: bytesToBase64(salt),
    ivB64: bytesToBase64(iv),
    ctB64: bytesToBase64(new Uint8Array(ct)),
  };
}

export async function decryptState(payload: EncryptedPayloadV1, passphrase: string): Promise<AppState> {
  if (payload.v !== 1 || payload.kdf !== 'PBKDF2-SHA256') throw new Error('Unsupported payload');
  const salt = base64ToBytes(payload.saltB64);
  const iv = base64ToBytes(payload.ivB64);
  const ct = base64ToBytes(payload.ctB64);
  const key = await deriveAesKey(passphrase, salt, payload.iter);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  const raw = new TextDecoder().decode(pt);
  return JSON.parse(raw) as AppState;
}
