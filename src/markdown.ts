import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createRenderRuntime,
  disposeRenderRuntime,
  renderMermaidLiveWithRuntime,
  type RenderRuntime
} from './render.js';
import type { RenderOptions, Ui } from './types.js';

export interface MarkdownRenderOptions {
  markdownPath: string;
  outputPath?: string;
  svgDir: string;
  keepMermaid: boolean;
  lightTheme: string;
  darkTheme: string;
  renderOptions: Omit<RenderOptions, 'input' | 'output' | 'theme'>;
}

export interface MarkdownDiagramResult {
  index: number;
  lightPath: string;
  darkPath: string;
  alt: string;
}

export interface MarkdownRenderResult {
  outputPath: string;
  svgDir: string;
  diagrams: MarkdownDiagramResult[];
}

interface ParsedGeneratedBlock {
  code: string;
  endIndex: number;
  indent: string;
}

interface ParsedDiagramCandidate {
  code: string;
  endIndex: number;
  indent: string;
}

interface RenderedDiagramAssets {
  lightPath: string;
  darkPath: string;
  relativeLight: string;
  relativeDark: string;
  imgHeight?: number;
  alt: string;
}

const GENERATED_MERMAID_SOURCE_ATTR = 'data-mermint-source';

const silentUi: Ui = {
  header: () => undefined,
  step: () => ({ succeed: () => undefined, fail: () => undefined }),
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  success: () => undefined,
  detail: () => undefined
};

function normalizeMarkdownPath(path: string): string {
  const normalized = path.split('\\').join('/');
  if (normalized.startsWith('.') || normalized.startsWith('/')) {
    return normalized;
  }
  return `./${normalized}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function extractDiagramHead(code: string): string {
  const lines = code.split(/\r?\n/);
  let i = 0;
  let frontmatterChecked = false;

  while (i < lines.length) {
    const trimmed = (lines[i] || '').trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (!frontmatterChecked && trimmed === '---') {
      i += 1;
      while (i < lines.length && (lines[i] || '').trim() !== '---') {
        i += 1;
      }
      if (i < lines.length) {
        i += 1;
      }
      frontmatterChecked = true;
      continue;
    }

    frontmatterChecked = true;

    if (trimmed.startsWith('%%{')) {
      if (!trimmed.includes('}%%')) {
        i += 1;
        while (i < lines.length && !(lines[i] || '').includes('}%%')) {
          i += 1;
        }
        if (i < lines.length) {
          i += 1;
        }
      } else {
        i += 1;
      }
      continue;
    }

    if (trimmed.startsWith('%%')) {
      i += 1;
      continue;
    }

    return trimmed.toLowerCase();
  }

  return '';
}

export function inferDiagramAlt(code: string, index: number): string {
  const head = extractDiagramHead(code);

  const matchers: Array<[RegExp, string]> = [
    [/^architecture\b/, 'Architecture diagram'],
    [/^block\b/, 'Block diagram'],
    [/^c4/i, 'C4 diagram'],
    [/^classdiagram\b/, 'Class diagram'],
    [/^erdiagram\b/, 'Entity Relationship diagram'],
    [/^flowchart\b|^graph\b/, 'Flowchart diagram'],
    [/^gantt\b/, 'Gantt diagram'],
    [/^gitgraph\b/, 'Git diagram'],
    [/^kanban\b/, 'Kanban diagram'],
    [/^mindmap\b/, 'Mindmap diagram'],
    [/^packet\b/, 'Packet diagram'],
    [/^pie\b/, 'Pie chart'],
    [/^quadrant\b/, 'Quadrant diagram'],
    [/^radar\b/, 'Radar diagram'],
    [/^requirementdiagram\b/, 'Requirement diagram'],
    [/^sankey\b/, 'Sankey diagram'],
    [/^sequencediagram\b/, 'Sequence diagram'],
    [/^statediagram\b/, 'State diagram'],
    [/^timeline\b/, 'Timeline diagram'],
    [/^treemap\b/, 'Treemap diagram'],
    [/^journey\b/, 'User Journey diagram'],
    [/^xychart\b/, 'XY diagram'],
    [/^zenuml\b/, 'Zen UML diagram']
  ];

  for (const [regex, label] of matchers) {
    if (regex.test(head)) return label;
  }

  return `Mermaid diagram ${index}`;
}

function buildPictureBlock(
  relativeDark: string,
  relativeLight: string,
  alt: string,
  keepMermaid: boolean,
  code: string,
  imgHeight?: number
): string[] {
  const heightAttr = Number.isFinite(imgHeight) ? ` height="${Math.max(1, Math.round(Number(imgHeight)))}"` : '';
  const lines = [
    '<div align="center">',
    '<picture>',
    `  <source media="(prefers-color-scheme: dark)" srcset="${relativeDark}">`,
    `  <img src="${relativeLight}" alt="${alt}"${heightAttr}>`,
    '</picture>',
    '</div>'
  ];

  if (!keepMermaid) return lines;

  return [
    ...lines,
    '',
    `<details ${GENERATED_MERMAID_SOURCE_ATTR}="true">`,
    '  <summary>Mermaid source</summary>',
    '',
    '```mermaid',
    ...code.split(/\r?\n/),
    '```',
    '',
    '</details>'
  ];
}

function indentLines(lines: string[], indent: string): string[] {
  if (!indent) return lines;
  return lines.map((line) => `${indent}${line}`);
}

function isFenceLine(line: string): { indent: string; fence: string; info: string } | null {
  const match = line.match(/^(\s*)(```+|~~~+)\s*([^`~]*)$/);
  if (!match) return null;
  return {
    indent: match[1] || '',
    fence: match[2],
    info: (match[3] || '').trim()
  };
}

function isClosingFence(line: string, fence: string): boolean {
  return line.trim().startsWith(fence);
}

function extractSvgViewBoxHeight(svg: string): number | undefined {
  const viewBoxMatch = svg.match(/\bviewBox="([^"]+)"/i);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/\s+/).map(Number);
    if (parts.length === 4 && Number.isFinite(parts[3]) && parts[3] > 0) {
      return Math.round(parts[3]);
    }
  }

  const heightMatch = svg.match(/\bheight="([0-9.]+)"/i);
  if (heightMatch) {
    const parsed = Number(heightMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  }

  return undefined;
}

function isDetailsOpen(line: string): boolean {
  return /^<details(?:\s[^>]*)?>\s*$/i.test(line.trim());
}

function isDetailsClose(line: string): boolean {
  return /^<\/details>\s*$/i.test(line.trim());
}

function isMermaidSourceSummary(line: string): boolean {
  return /<summary>\s*Mermaid source\s*<\/summary>/i.test(line);
}

function isGeneratedMermaidSourceDetailsOpen(line: string): boolean {
  return new RegExp(`<details\\b[^>]*\\b${GENERATED_MERMAID_SOURCE_ATTR}\\s*=`, 'i').test(line.trim());
}

function isMermaidFenceInSourceDetails(lines: string[], fenceIndex: number): boolean {
  let detailsStart = -1;
  for (let i = fenceIndex - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (isDetailsClose(line)) {
      return false;
    }
    if (isDetailsOpen(line)) {
      detailsStart = i;
      break;
    }
  }

  if (detailsStart === -1) return false;
  if (isGeneratedMermaidSourceDetailsOpen(lines[detailsStart] ?? '')) return true;

  for (let i = detailsStart + 1; i < fenceIndex; i += 1) {
    const line = lines[i];
    if (isDetailsClose(line)) return false;
    if (isMermaidSourceSummary(line)) return true;
  }
  return false;
}

function parseGeneratedMermaidBlock(lines: string[], startIndex: number): ParsedGeneratedBlock | null {
  const startLine = lines[startIndex] ?? '';
  const startMatch = startLine.match(/^(\s*)<div align="center">\s*$/);
  if (!startMatch) return null;
  const indent = startMatch[1] || '';

  let i = startIndex + 1;
  if ((lines[i] ?? '').trim() !== '<picture>') return null;

  i += 1;
  while (i < lines.length && (lines[i] ?? '').trim() !== '</picture>') {
    i += 1;
  }
  if (i >= lines.length) return null;

  i += 1;
  if ((lines[i] ?? '').trim() !== '</div>') return null;

  i += 1;
  while (i < lines.length && (lines[i] ?? '').trim() === '') {
    i += 1;
  }
  if (!isDetailsOpen(lines[i] ?? '')) return null;

  i += 1;
  while (i < lines.length && !isDetailsClose(lines[i] ?? '')) {
    const fence = isFenceLine(lines[i] ?? '');
    if (fence && fence.info.toLowerCase().startsWith('mermaid')) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !isClosingFence(lines[i] ?? '', fence.fence)) {
        const line = lines[i] ?? '';
        codeLines.push(line.startsWith(indent) ? line.slice(indent.length) : line);
        i += 1;
      }
      if (i >= lines.length) return null;

      i += 1;
      while (i < lines.length && !isDetailsClose(lines[i] ?? '')) {
        i += 1;
      }
      if (i >= lines.length) return null;

      return {
        code: codeLines.join('\n'),
        endIndex: i,
        indent
      };
    }
    i += 1;
  }
  return null;
}

async function renderDiagramAssets(options: {
  code: string;
  diagramIndex: number;
  basePrefix: string;
  tempRoot: string;
  svgDir: string;
  markdownDir: string;
  renderRuntime: RenderRuntime;
  markdownOptions: MarkdownRenderOptions;
}): Promise<RenderedDiagramAssets> {
  const fileBase = `${options.basePrefix}-${options.diagramIndex}`;
  const lightPath = resolve(options.svgDir, `${fileBase}-light.svg`);
  const darkPath = resolve(options.svgDir, `${fileBase}-dark.svg`);

  const tempFile = resolve(options.tempRoot, `${fileBase}.mmd`);
  await writeFile(tempFile, options.code, 'utf8');

  await renderMermaidLiveWithRuntime(
    {
      ...options.markdownOptions.renderOptions,
      input: tempFile,
      output: lightPath,
      theme: options.markdownOptions.lightTheme
    },
    options.renderRuntime,
    silentUi
  );

  await renderMermaidLiveWithRuntime(
    {
      ...options.markdownOptions.renderOptions,
      input: tempFile,
      output: darkPath,
      theme: options.markdownOptions.darkTheme
    },
    options.renderRuntime,
    silentUi
  );

  const relativeLight = normalizeMarkdownPath(relative(options.markdownDir, lightPath));
  const relativeDark = normalizeMarkdownPath(relative(options.markdownDir, darkPath));
  const lightSvg = await readFile(lightPath, 'utf8');
  const imgHeight = extractSvgViewBoxHeight(lightSvg);
  const alt = inferDiagramAlt(options.code, options.diagramIndex);

  return {
    lightPath,
    darkPath,
    relativeLight,
    relativeDark,
    imgHeight,
    alt
  };
}

export async function renderMarkdownFile(options: MarkdownRenderOptions, ui: Ui = silentUi): Promise<MarkdownRenderResult> {
  const readStep = ui.step('Read Markdown', options.markdownPath);
  const markdown = await readFile(options.markdownPath, 'utf8').then((content) => {
    readStep.succeed();
    return content;
  }).catch((error) => {
    readStep.fail();
    throw error;
  });

  const outputPath = options.outputPath ? resolve(options.outputPath) : resolve(options.markdownPath);
  const markdownDir = dirname(outputPath);
  const svgDir = isAbsolute(options.svgDir) ? options.svgDir : resolve(process.cwd(), options.svgDir);
  await mkdir(svgDir, { recursive: true });

  const tempRoot = await mkdtemp(join(tmpdir(), 'mermint-'));
  const basePrefix = slugify(basename(outputPath, extname(outputPath)) || 'diagram');

  const lines = markdown.split(/\r?\n/);
  const outputLines: string[] = [];
  const diagrams: MarkdownDiagramResult[] = [];
  let diagramIndex = 0;

  let runtime: RenderRuntime | undefined;

  try {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const generatedBlock = parseGeneratedMermaidBlock(lines, i);

      let candidate: ParsedDiagramCandidate | null = null;

      if (generatedBlock) {
        candidate = {
          code: generatedBlock.code,
          endIndex: generatedBlock.endIndex,
          indent: generatedBlock.indent
        };
      } else {
        const fence = isFenceLine(line);
        if (!fence) {
          outputLines.push(line);
          continue;
        }

        const infoLower = fence.info.toLowerCase();
        const skipTransform = !infoLower.startsWith('mermaid') || isMermaidFenceInSourceDetails(lines, i);
        if (skipTransform) {
          outputLines.push(line);
          i += 1;
          while (i < lines.length) {
            outputLines.push(lines[i]);
            if (isClosingFence(lines[i], fence.fence)) {
              break;
            }
            i += 1;
          }
          continue;
        }

        const codeLines: string[] = [];
        let j = i + 1;
        for (; j < lines.length; j += 1) {
          if (isClosingFence(lines[j], fence.fence)) {
            break;
          }
          codeLines.push(lines[j]);
        }

        if (j >= lines.length) {
          outputLines.push(line, ...codeLines);
          break;
        }

        candidate = {
          code: codeLines.join('\n'),
          endIndex: j,
          indent: fence.indent
        };
      }

      diagramIndex += 1;
      if (!runtime) {
        runtime = await createRenderRuntime({
          headed: options.renderOptions.headed,
          timeoutMs: options.renderOptions.timeoutMs
        });
      }
      const renderStep = ui.step(`Render diagram ${diagramIndex}`);

      try {
        const assets = await renderDiagramAssets({
          code: candidate.code,
          diagramIndex,
          basePrefix,
          tempRoot,
          svgDir,
          markdownDir,
          renderRuntime: runtime,
          markdownOptions: options
        });

        renderStep.succeed();

        const pictureLines = buildPictureBlock(
          assets.relativeDark,
          assets.relativeLight,
          assets.alt,
          options.keepMermaid,
          candidate.code,
          assets.imgHeight
        );
        outputLines.push(...indentLines(pictureLines, candidate.indent));
        diagrams.push({
          index: diagramIndex,
          lightPath: assets.lightPath,
          darkPath: assets.darkPath,
          alt: assets.alt
        });
      } catch (error) {
        renderStep.fail();
        throw error;
      }

      i = candidate.endIndex;
    }
  } finally {
    if (runtime) {
      await disposeRenderRuntime(runtime);
    }
    await rm(tempRoot, { recursive: true, force: true });
  }

  const writeStep = ui.step('Write Markdown', outputPath);
  await writeFile(outputPath, outputLines.join('\n'), 'utf8').then(() => {
    writeStep.succeed();
  }).catch((error) => {
    writeStep.fail();
    throw error;
  });

  return { outputPath, svgDir, diagrams };
}
