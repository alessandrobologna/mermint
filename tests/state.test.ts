import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { serializeState, toEditUrl } from '../src/state.js';

describe('serializeState', () => {
  it('round trips state payload', () => {
    const state = {
      code: 'flowchart\n  A-->B',
      grid: true,
      mermaid: '{"theme":"dark"}',
      panZoom: true,
      rough: true,
      updateDiagram: true
    };

    const encoded = serializeState(state);
    expect(encoded.startsWith('pako:')).toBe(true);

    const compressed = Buffer.from(encoded.slice(5), 'base64url');
    const json = inflateSync(compressed).toString('utf8');
    expect(JSON.parse(json)).toEqual(state);
  });
});

describe('toEditUrl', () => {
  it('appends /edit when needed', () => {
    expect(toEditUrl('https://mermaid.live', 'hash')).toBe('https://mermaid.live/edit#hash');
  });

  it('respects existing /edit path', () => {
    expect(toEditUrl('https://mermaid.live/edit', 'hash')).toBe('https://mermaid.live/edit#hash');
  });

  it('handles trailing slash', () => {
    expect(toEditUrl('https://mermaid.live/', 'hash')).toBe('https://mermaid.live/edit#hash');
  });
});
