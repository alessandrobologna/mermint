import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type { IconifyIcon, IconifyJson } from './build.js';

export type WriteIconCatalogOptions = {
  payload: IconifyJson;
  markdownOutputPath: string;
  svgOutputDir: string;
  title?: string;
};

export type WriteIconCatalogResult = {
  markdownOutputPath: string;
  svgOutputDir: string;
  iconCount: number;
};

function normalizeMarkdownPath(path: string): string {
  const normalized = path.split('\\').join('/');
  if (normalized.startsWith('.') || normalized.startsWith('/')) {
    return normalized;
  }
  return `./${normalized}`;
}

function renderIconSvg(icon: IconifyIcon, previewCanvasSize: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${icon.width} ${icon.height}" ` +
    `width="${previewCanvasSize}" height="${previewCanvasSize}">${icon.body}</svg>\n`
  );
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function writeIconCatalog(options: WriteIconCatalogOptions): WriteIconCatalogResult {
  const markdownOutputPath = resolve(options.markdownOutputPath);
  const svgOutputDir = resolve(options.svgOutputDir);

  mkdirSync(dirname(markdownOutputPath), { recursive: true });
  mkdirSync(svgOutputDir, { recursive: true });

  const iconEntries = Object.entries(options.payload.icons).sort(([a], [b]) => a.localeCompare(b));
  const previewCanvasSize = Math.max(
    1,
    ...iconEntries.map(([, icon]) => Math.max(1, Number(icon.width), Number(icon.height)))
  );
  const aliasesByParent = new Map<string, string[]>();
  for (const [alias, definition] of Object.entries(options.payload.aliases ?? {})) {
    const existing = aliasesByParent.get(definition.parent) ?? [];
    existing.push(alias);
    aliasesByParent.set(definition.parent, existing);
  }

  const rows: string[] = [];
  for (const [name, icon] of iconEntries) {
    const svgFilePath = join(svgOutputDir, `${name}.svg`);
    writeFileSync(svgFilePath, renderIconSvg(icon, previewCanvasSize), 'utf8');

    const previewPath = normalizeMarkdownPath(relative(dirname(markdownOutputPath), svgFilePath));
    const aliases = (aliasesByParent.get(name) ?? []).sort();
    const aliasesCell = aliases.length > 0 ? aliases.map((alias) => `\`${escapeTableCell(alias)}\``).join(', ') : '-';
    rows.push(`| ![${escapeTableCell(name)}](${previewPath}) | \`${escapeTableCell(name)}\` | ${aliasesCell} |`);
  }

  const title = options.title?.trim() || 'AWS Architecture Icon Catalog';
  const markdown = [
    `# ${title}`,
    '',
    `Prefix: \`${options.payload.prefix}\``,
    '',
    `Total icons: **${iconEntries.length}**`,
    '',
    '| Preview | Name | Aliases |',
    '| --- | --- | --- |',
    ...rows,
    ''
  ].join('\n');

  writeFileSync(markdownOutputPath, markdown, 'utf8');

  return {
    markdownOutputPath,
    svgOutputDir,
    iconCount: iconEntries.length
  };
}
