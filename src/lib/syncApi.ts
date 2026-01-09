import type { EncryptedPayloadV1, SyncRecordV1 } from './sync';

type SyncGetOk = { ok: true; record: SyncRecordV1 };
type SyncGetErr = { ok: false; error: string; message?: string };
type SyncGetResponse = SyncGetOk | SyncGetErr;

type SyncPutOk = { ok: true; record: SyncRecordV1 };
type SyncPutErr = { ok: false; error: string; message?: string };
type SyncPutResponse = SyncPutOk | SyncPutErr;

async function parseJson(res: Response): Promise<unknown | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function getRemoteRecord(syncId: string): Promise<SyncRecordV1 | null> {
  const res = await fetch(`/api/sync?id=${encodeURIComponent(syncId)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (res.status === 404) return null;
  const body = (await parseJson(res)) as SyncGetResponse | null;
  if (!res.ok) {
    const msg = body && typeof body === 'object' && 'message' in body ? String((body as SyncGetErr).message ?? '') : '';
    throw new Error(msg || `Sync API error (${res.status})`);
  }
  if (!body || typeof body !== 'object' || !('ok' in body) || (body as SyncGetOk).ok !== true) {
    throw new Error('Sync API: invalid response');
  }
  return (body as SyncGetOk).record;
}

export async function putRemoteRecord(syncId: string, modifiedAt: string, payload: EncryptedPayloadV1): Promise<SyncRecordV1> {
  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ id: syncId, modifiedAt, payload }),
  });

  const body = (await parseJson(res)) as SyncPutResponse | null;
  if (!res.ok) {
    const msg = body && typeof body === 'object' && 'message' in body ? String((body as SyncPutErr).message ?? '') : '';
    throw new Error(msg || `Sync API error (${res.status})`);
  }
  if (!body || typeof body !== 'object' || !('ok' in body) || (body as SyncPutOk).ok !== true) {
    throw new Error('Sync API: invalid response');
  }
  return (body as SyncPutOk).record;
}

