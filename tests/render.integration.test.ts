import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderMermaidLive } from '../src/render.js';

function extractPathData(svg: string): string[] {
  const matches = svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g);
  return [...matches].map((match) => match[1]).sort();
}

describe('renderMermaidLive integration', () => {
  it('enforces opaque background when transparentBg is false in classic rendering', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'mermint-render-it-'));

    try {
      const input = join(tempRoot, 'input.mmd');
      const output = join(tempRoot, 'output.svg');
      await writeFile(
        input,
        `flowchart LR
  A --> B
`,
        'utf8'
      );

      await renderMermaidLive({
        input,
        output,
        baseUrl: 'https://mermaid.live',
        theme: 'default',
        rough: false,
        look: undefined,
        fontFamily: undefined,
        fontSize: 13,
        roughness: undefined,
        fillWeight: undefined,
        embedFontPath: undefined,
        embedFontFamily: undefined,
        embedExcalifont: true,
        transparentBg: false,
        settleMs: 0,
        timeoutMs: 60000,
        headed: false
      });

      const svg = await readFile(output, 'utf8');
      expect(svg).toContain('background-color: #ffffff;');
      expect(svg).toContain('fill="#ffffff"');
      expect(svg).not.toContain('background-color: transparent');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 120000);

  it('renders flowchart icon shapes when icon pack JSON is provided', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'mermint-render-icon-pack-it-'));

    try {
      const input = join(tempRoot, 'icon-input.mmd');
      const output = join(tempRoot, 'icon-output.svg');
      const iconPack = join(tempRoot, 'icon-pack.json');

      await writeFile(
        input,
        `flowchart TD
  A@{ icon: "test:box", form: "square", label: "Custom", pos: "b", h: 80 }
`,
        'utf8'
      );

      await writeFile(
        iconPack,
        JSON.stringify({
          prefix: 'test',
          icons: {
            box: {
              body: '<path d="M0 0h16v16H0z" fill="currentColor"/>',
              width: 16,
              height: 16
            }
          }
        }),
        'utf8'
      );

      await renderMermaidLive({
        input,
        output,
        baseUrl: 'https://mermaid.live',
        theme: 'default',
        rough: false,
        look: undefined,
        iconPacks: [{ source: iconPack }],
        fontFamily: undefined,
        fontSize: 13,
        roughness: undefined,
        fillWeight: undefined,
        embedFontPath: undefined,
        embedFontFamily: undefined,
        embedExcalifont: true,
        transparentBg: true,
        settleMs: 0,
        timeoutMs: 60000,
        headed: false
      });

      const svg = await readFile(output, 'utf8');
      expect(svg).toContain('M0 0h16v16H0z');
      expect(svg).not.toContain('translate(21.16 64.67)');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 120000);

  it('loads the built-in aws architecture icon pack without explicit config', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'mermint-render-built-in-aws-it-'));

    try {
      const input = join(tempRoot, 'architecture.mmd');
      const output = join(tempRoot, 'architecture.svg');

      await writeFile(
        input,
        `architecture-beta
  group api(aws:aws-api-gateway)[API Layer]
`,
        'utf8'
      );

      await renderMermaidLive({
        input,
        output,
        baseUrl: 'https://mermaid.live',
        theme: 'default',
        rough: false,
        look: undefined,
        fontFamily: undefined,
        fontSize: 13,
        roughness: undefined,
        fillWeight: undefined,
        embedFontPath: undefined,
        embedFontFamily: undefined,
        embedExcalifont: true,
        transparentBg: true,
        settleMs: 0,
        timeoutMs: 60000,
        headed: false
      });

      const svg = await readFile(output, 'utf8');
      expect(svg).toContain('fill="#8C4FFF"');
      expect(svg).toContain('M28 43.9999H31V41.9999H28V43.9999Z');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 120000);

  it('lets init config override the built-in aws icon pack', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'mermint-render-init-icon-pack-it-'));

    try {
      const input = join(tempRoot, 'architecture.mmd');
      const output = join(tempRoot, 'architecture.svg');
      const iconPack = join(tempRoot, 'icons.json');

      await writeFile(
        iconPack,
        JSON.stringify({
          prefix: 'aws',
          icons: {
            'aws-api-gateway': {
              body: '<path d="M1 1h22v22H1z" fill="currentColor"/>',
              width: 24,
              height: 24
            }
          }
        }),
        'utf8'
      );

      await writeFile(
        input,
        `%%{init: {
  "theme": "default",
  "architecture": {
    "iconPacks": {
      "aws": "./icons.json"
    }
  }
}}%%
architecture-beta
  group api(aws:aws-api-gateway)[API Layer]
`,
        'utf8'
      );

      await renderMermaidLive({
        input,
        output,
        baseUrl: 'https://mermaid.live',
        theme: 'default',
        rough: false,
        look: undefined,
        fontFamily: undefined,
        fontSize: 13,
        roughness: undefined,
        fillWeight: undefined,
        embedFontPath: undefined,
        embedFontFamily: undefined,
        embedExcalifont: true,
        transparentBg: true,
        settleMs: 0,
        timeoutMs: 60000,
        headed: false
      });

      const svg = await readFile(output, 'utf8');
      expect(svg).toContain('M1 1h22v22H1z');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 120000);

  it('defaults hand-drawn architecture icon diagrams to solid fills for legibility', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'mermint-render-architecture-solid-it-'));

    try {
      const input = join(tempRoot, 'architecture.mmd');
      const output = join(tempRoot, 'architecture.svg');

      await writeFile(
        input,
        `---
config:
  look: handDrawn
---
architecture-beta
  group api(aws:aws-api-gateway)[API]
  service rest(aws:aws-api-gateway)[REST API] in api
`,
        'utf8'
      );

      await renderMermaidLive({
        input,
        output,
        baseUrl: 'https://mermaid.live',
        theme: 'default',
        rough: false,
        look: undefined,
        fontFamily: undefined,
        fontSize: 13,
        roughness: undefined,
        fillWeight: undefined,
        fillStyle: undefined,
        hachureGap: undefined,
        hachureAngle: undefined,
        bowing: undefined,
        strokeWidth: undefined,
        seed: undefined,
        disableMultiStroke: undefined,
        disableMultiStrokeFill: undefined,
        preserveVertices: undefined,
        embedFontPath: undefined,
        embedFontFamily: undefined,
        embedExcalifont: true,
        transparentBg: true,
        settleMs: 0,
        timeoutMs: 60000,
        headed: false
      });

      const svg = await readFile(output, 'utf8');
      expect(svg).toContain('fill="rgb(140, 79, 255)"');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 120000);

  it('preserves explicit fillStyle overrides for hand-drawn architecture icon diagrams', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'mermint-render-architecture-fill-style-it-'));

    try {
      const input = join(tempRoot, 'architecture.mmd');
      const output = join(tempRoot, 'architecture.svg');

      await writeFile(
        input,
        `---
config:
  look: handDrawn
x-mermint:
  rough:
    fillStyle: hachure
---
architecture-beta
  group api(aws:aws-api-gateway)[API]
  service rest(aws:aws-api-gateway)[REST API] in api
`,
        'utf8'
      );

      await renderMermaidLive({
        input,
        output,
        baseUrl: 'https://mermaid.live',
        theme: 'default',
        rough: false,
        look: undefined,
        fontFamily: undefined,
        fontSize: 13,
        roughness: undefined,
        fillWeight: undefined,
        fillStyle: undefined,
        hachureGap: undefined,
        hachureAngle: undefined,
        bowing: undefined,
        strokeWidth: undefined,
        seed: undefined,
        disableMultiStroke: undefined,
        disableMultiStrokeFill: undefined,
        preserveVertices: undefined,
        embedFontPath: undefined,
        embedFontFamily: undefined,
        embedExcalifont: true,
        transparentBg: true,
        settleMs: 0,
        timeoutMs: 60000,
        headed: false
      });

      const svg = await readFile(output, 'utf8');
      expect(svg).not.toContain('fill="rgb(140, 79, 255)"');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 120000);

  it('surfaces Mermaid parse errors for invalid architecture syntax', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'mermint-render-architecture-error-it-'));

    try {
      const input = join(tempRoot, 'architecture.mmd');
      const output = join(tempRoot, 'architecture.svg');

      await writeFile(
        input,
        `architecture-beta
  service demoapi(aws:aws-lambda)[demo-api]
`,
        'utf8'
      );

      await expect(
        renderMermaidLive({
          input,
          output,
          baseUrl: 'https://mermaid.live',
          theme: 'default',
          rough: false,
          look: undefined,
          fontFamily: undefined,
          fontSize: 13,
          roughness: undefined,
          fillWeight: undefined,
          embedFontPath: undefined,
          embedFontFamily: undefined,
          embedExcalifont: true,
          transparentBg: true,
          settleMs: 0,
          timeoutMs: 60000,
          headed: false
        })
      ).rejects.toThrow(/Parsing failed/);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 120000);

  it('rejects negative fill weight values', async () => {
    await expect(
      renderMermaidLive({
        input: 'input.mmd',
        output: 'output.svg',
        baseUrl: 'https://mermaid.live',
        theme: 'default',
        rough: false,
        look: undefined,
        fontFamily: undefined,
        fontSize: 13,
        roughness: 0.5,
        fillWeight: -0.1,
        embedFontPath: undefined,
        embedFontFamily: undefined,
        embedExcalifont: true,
        transparentBg: true,
        settleMs: 0,
        timeoutMs: 60000,
        headed: false
      })
    ).rejects.toThrow('--fill-weight must be a non-negative number');
  });

  it('rejects source rough overrides when --look classic is set', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'mermint-render-rough-classic-it-'));

    try {
      const input = join(tempRoot, 'input.mmd');
      const output = join(tempRoot, 'output.svg');
      await writeFile(
        input,
        `---
x-mermint:
  rough:
    fillWeight: 8
---
flowchart LR
  A --> B
`,
        'utf8'
      );

      await expect(
        renderMermaidLive({
          input,
          output,
          baseUrl: 'https://mermaid.live',
          theme: 'default',
          rough: false,
          look: 'classic',
          fontFamily: undefined,
          fontSize: 13,
          roughness: undefined,
          fillWeight: undefined,
          fillStyle: undefined,
          hachureGap: undefined,
          hachureAngle: undefined,
          bowing: undefined,
          strokeWidth: undefined,
          seed: undefined,
          disableMultiStroke: undefined,
          disableMultiStrokeFill: undefined,
          preserveVertices: undefined,
          embedFontPath: undefined,
          embedFontFamily: undefined,
          embedExcalifont: true,
          transparentBg: true,
          settleMs: 0,
          timeoutMs: 60000,
          headed: false
        })
      ).rejects.toThrow('Rough options cannot be used with --look classic');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 120000);

  it('produces deterministic rough path output when seed is set', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'mermint-render-seed-it-'));

    try {
      const input = join(tempRoot, 'input.mmd');
      const outputA = join(tempRoot, 'output-a.svg');
      const outputB = join(tempRoot, 'output-b.svg');

      await writeFile(
        input,
        `flowchart LR
  A --> B
  B --> C
`,
        'utf8'
      );

      const base = {
        input,
        baseUrl: 'https://mermaid.live',
        theme: 'default',
        rough: false,
        look: 'handDrawn',
        fontFamily: undefined,
        fontSize: 13,
        roughness: 0.5,
        fillWeight: undefined,
        fillStyle: undefined,
        hachureGap: undefined,
        hachureAngle: undefined,
        bowing: undefined,
        strokeWidth: undefined,
        seed: 42,
        disableMultiStroke: undefined,
        disableMultiStrokeFill: undefined,
        preserveVertices: undefined,
        embedFontPath: undefined,
        embedFontFamily: undefined,
        embedExcalifont: true,
        transparentBg: true,
        settleMs: 0,
        timeoutMs: 60000,
        headed: false
      };

      await renderMermaidLive({
        ...base,
        output: outputA
      });
      await renderMermaidLive({
        ...base,
        output: outputB
      });

      const [svgA, svgB] = await Promise.all([readFile(outputA, 'utf8'), readFile(outputB, 'utf8')]);
      expect(extractPathData(svgA)).toEqual(extractPathData(svgB));
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 120000);
});
