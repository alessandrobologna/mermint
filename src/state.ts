import { deflateSync } from 'node:zlib';

export function serializeState(state: unknown): string {
  const json = JSON.stringify(state);
  const compressed = deflateSync(Buffer.from(json), { level: 9 });
  return `pako:${compressed.toString('base64url')}`;
}

export function toEditUrl(baseUrl: string, hash: string): string {
  const trimmed = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  if (trimmed.endsWith('/edit')) {
    return `${trimmed}#${hash}`;
  }
  return `${trimmed}/edit#${hash}`;
}
