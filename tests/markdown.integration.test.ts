import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderMarkdownFile } from '../src/markdown.js';

const baseRenderOptions = {
  baseUrl: 'https://mermaid.live',
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
};

describe('renderMarkdownFile integration', () => {
  it('renders classic and hand-drawn blocks into picture markup and svg files', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'mermint-markdown-it-'));

    try {
      const markdownPath = join(tempRoot, 'source.md');
      const outputPath = join(tempRoot, 'output.md');
      const svgDir = join(tempRoot, 'svgs');

      const source = `# Integration Test

## Flowchart classic

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`

## Sequence hand-drawn

\`\`\`mermaid

---
config:
  look: handDrawn
---
sequenceDiagram
  participant U as User
  participant S as Service
  U->>S: ping
  S-->>U: pong
\`\`\`
`;

      await writeFile(markdownPath, source, 'utf8');

      const result = await renderMarkdownFile({
        markdownPath,
        outputPath,
        svgDir,
        keepMermaid: false,
        lightTheme: 'default',
        darkTheme: 'dark',
        renderOptions: baseRenderOptions
      });

      expect(result.diagrams).toHaveLength(2);
      expect(result.diagrams[0]?.alt).toBe('Flowchart diagram');
      expect(result.diagrams[1]?.alt).toBe('Sequence diagram');

      const output = await readFile(outputPath, 'utf8');
      expect(output).toContain('<picture>');
      expect(output).toContain('alt="Flowchart diagram"');
      expect(output).toContain('alt="Sequence diagram"');
      expect(output).not.toMatch(/<img[^>]*\sheight="/);

      for (const diagram of result.diagrams) {
        const lightStat = await stat(diagram.lightPath);
        const darkStat = await stat(diagram.darkPath);
        expect(lightStat.size).toBeGreaterThan(0);
        expect(darkStat.size).toBeGreaterThan(0);
      }
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 120000);

  it('reprocesses generated blocks after details summary and attribute edits without nesting', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'mermint-markdown-reprocess-it-'));

    try {
      const markdownPath = join(tempRoot, 'source.md');
      const svgDir = join(tempRoot, 'svgs');
      const source = `# Reprocess Test

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`
`;

      await writeFile(markdownPath, source, 'utf8');

      await renderMarkdownFile({
        markdownPath,
        svgDir,
        keepMermaid: true,
        lightTheme: 'default',
        darkTheme: 'dark',
        renderOptions: baseRenderOptions
      });

      const firstPass = await readFile(markdownPath, 'utf8');
      const edited = firstPass
        .replace('<details data-mermint-source="true">', '<details open>')
        .replace('<summary>Mermaid source</summary>', '<summary>Source</summary>');
      await writeFile(markdownPath, edited, 'utf8');

      await renderMarkdownFile({
        markdownPath,
        svgDir,
        keepMermaid: true,
        lightTheme: 'default',
        darkTheme: 'dark',
        renderOptions: baseRenderOptions
      });

      const secondPass = await readFile(markdownPath, 'utf8');
      expect((secondPass.match(/<picture>/g) || []).length).toBe(1);
      expect((secondPass.match(/<details\b/g) || []).length).toBe(1);
      expect(secondPass).toContain('<details data-mermint-source="true">');
      expect(secondPass).not.toContain('<summary>Source</summary>\n\n<div align="center">');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 120000);

  it('resolves relative architecture icon packs from the markdown file directory', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'mermint-markdown-icon-pack-it-'));

    try {
      const docsDir = join(tempRoot, 'docs');
      const markdownPath = join(docsDir, 'README.md');
      const svgDir = join(tempRoot, 'svgs');
      const iconPackPath = join(docsDir, 'aws-icons.json');
      await mkdir(docsDir, { recursive: true });

      await writeFile(
        iconPackPath,
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

      const source = `# Architecture

\`\`\`mermaid
---
config:
  architecture:
    iconPacks:
      aws: ./aws-icons.json
---
architecture-beta
  group api(aws:aws-api-gateway)[API Layer]
\`\`\`
`;

      await writeFile(markdownPath, source, 'utf8');

      const result = await renderMarkdownFile({
        markdownPath,
        svgDir,
        keepMermaid: true,
        lightTheme: 'default',
        darkTheme: 'dark',
        renderOptions: baseRenderOptions
      });

      expect(result.diagrams).toHaveLength(1);
      const lightSvg = await readFile(result.diagrams[0].lightPath, 'utf8');
      expect(lightSvg).toContain('M1 1h22v22H1z');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 120000);
});
