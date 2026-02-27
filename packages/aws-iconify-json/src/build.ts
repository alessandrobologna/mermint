import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';

const ARCH_FILE_PATTERN = /^Arch_(?<service>.+)_(?<size>\d+)\.svg$/;
const SVG_WRAPPER_PATTERN = /<svg\b(?<attrs>[^>]*)>(?<body>[\s\S]*)<\/svg>\s*$/i;
const ATTRIBUTE_PATTERN = /([A-Za-z_][A-Za-z0-9:._-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const NUMBER_PATTERN = /^-?\d+(?:\.\d+)?$/;

export type IconifyIcon = {
  body: string;
  width: number;
  height: number;
};

export type IconifyAlias = {
  parent: string;
};

export type IconifyJson = {
  prefix: string;
  icons: Record<string, IconifyIcon>;
  aliases?: Record<string, IconifyAlias>;
};

export type BuildAwsIconifyOptions = {
  source?: string;
  sourceDir?: string;
  size?: number;
  prefix?: string;
};

type ParsedSvg = {
  body: string;
  width: number;
  height: number;
};

type SvgSourceFile = {
  rawSvg: string;
  sourcePath: string;
  scopePath: string;
};

function isDirectory(path: string): boolean {
  try {
    return readdirSync(path, { withFileTypes: true }) !== undefined;
  } catch {
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function walkFiles(root: string, callback: (path: string) => void): void {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    const entries = readdirSync(current, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name)
    );
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(path);
      } else if (entry.isFile()) {
        callback(path);
      }
    }
  }
}

function normalizeIconName(serviceName: string): string {
  return serviceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

function parseNumeric(raw: string): number {
  const cleaned = raw.trim().replace(/px$/i, '');
  if (!NUMBER_PATTERN.test(cleaned)) {
    throw new Error(`Invalid numeric SVG value: ${raw}`);
  }
  return Number(cleaned);
}

function parseAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of raw.matchAll(ATTRIBUTE_PATTERN)) {
    const key = match[1];
    const value = match[2] ?? match[3] ?? '';
    attributes[key] = value;
  }
  return attributes;
}

function parseDimensions(attributes: Record<string, string>): { width: number; height: number } {
  const viewBox = attributes.viewBox ?? attributes.viewbox;
  if (viewBox) {
    const parts = viewBox
      .split(/[\s,]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 4) {
      return {
        width: parseNumeric(parts[2]),
        height: parseNumeric(parts[3])
      };
    }
  }

  if (attributes.width && attributes.height) {
    return {
      width: parseNumeric(attributes.width),
      height: parseNumeric(attributes.height)
    };
  }

  throw new Error('SVG is missing viewBox and width/height attributes');
}

function parseSvg(raw: string, path: string): ParsedSvg {
  const match = raw.match(SVG_WRAPPER_PATTERN);
  if (!match?.groups) {
    throw new Error(`Unable to parse SVG wrapper: ${path}`);
  }

  const attributes = parseAttributes(match.groups.attrs ?? '');
  const { width, height } = parseDimensions(attributes);
  const body = (match.groups.body ?? '').trim();
  if (!body) {
    throw new Error(`SVG body is empty: ${path}`);
  }
  return { body, width, height };
}

function resolveSourceDir(sourceDir: string): string {
  const resolved = resolve(sourceDir);
  if (!isDirectory(resolved)) {
    throw new Error(`Source directory not found: ${resolved}`);
  }

  const rootName = basename(resolved);
  if (rootName.startsWith('Architecture-Service-Icons_')) {
    return resolved;
  }

  const architectureDirs: string[] = [];
  const stack = [resolved];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    const dirName = basename(current);
    if (dirName.startsWith('Architecture-Service-Icons_')) {
      architectureDirs.push(current);
      continue;
    }

    const entries = readdirSync(current, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name)
    );
    for (const entry of entries) {
      if (entry.isDirectory()) {
        stack.push(join(current, entry.name));
      }
    }
  }

  const uniqueArchitectureDirs = [...new Set(architectureDirs)].sort();
  if (uniqueArchitectureDirs.length === 1) {
    return uniqueArchitectureDirs[0];
  }
  if (uniqueArchitectureDirs.length > 1) {
    throw new Error(
      `Found multiple Architecture-Service-Icons_* directories under ${resolved}: ${uniqueArchitectureDirs.join(', ')}. ` +
        'Use --source to point to exactly one directory.'
    );
  }

  return resolved;
}

function resolveSourceInput(options: BuildAwsIconifyOptions): string {
  const source = options.source?.trim();
  const sourceDir = options.sourceDir?.trim();

  if (source && sourceDir && resolve(source) !== resolve(sourceDir)) {
    throw new Error('Provide only one of source or sourceDir');
  }

  const rawSource = source ?? sourceDir;
  if (!rawSource) {
    throw new Error('Missing source path');
  }
  return resolve(rawSource);
}

function collectSourceFilesFromDirectory(sourceDir: string, size: number): SvgSourceFile[] {
  const files: SvgSourceFile[] = [];
  walkFiles(sourceDir, (path) => {
    const fileName = basename(path);
    const match = fileName.match(ARCH_FILE_PATTERN);
    if (!match?.groups) {
      return;
    }
    if (Number(match.groups.size) !== size) {
      return;
    }

    files.push({
      rawSvg: readFileSync(path, 'utf8'),
      sourcePath: path,
      scopePath: path
    });
  });
  return files;
}

function collectSourceFilesFromZip(sourceZipPath: string, size: number): SvgSourceFile[] {
  let archive: Record<string, Uint8Array>;
  try {
    const raw = readFileSync(sourceZipPath);
    archive = unzipSync(raw);
  } catch {
    throw new Error(`Source file is not a valid zip archive: ${sourceZipPath}`);
  }

  const files: SvgSourceFile[] = [];
  for (const entryPath of Object.keys(archive).sort()) {
    const normalizedPath = entryPath.replace(/\\/g, '/');
    if (!normalizedPath || normalizedPath.endsWith('/')) {
      continue;
    }

    const fileName = basename(normalizedPath);
    const match = fileName.match(ARCH_FILE_PATTERN);
    if (!match?.groups) {
      continue;
    }
    if (Number(match.groups.size) !== size) {
      continue;
    }

    files.push({
      rawSvg: strFromU8(archive[entryPath]),
      sourcePath: `${sourceZipPath}:${normalizedPath}`,
      scopePath: normalizedPath
    });
  }
  return files;
}

function collectSourceFiles(sourcePath: string, size: number): SvgSourceFile[] {
  if (isDirectory(sourcePath)) {
    const resolvedDir = resolveSourceDir(sourcePath);
    return collectSourceFilesFromDirectory(resolvedDir, size);
  }

  if (isFile(sourcePath)) {
    return collectSourceFilesFromZip(sourcePath, size);
  }

  throw new Error(`Source path must be a directory or zip file: ${sourcePath}`);
}

function scopedIconName(baseName: string, path: string, existing: Set<string>): string {
  const immediateDir = basename(dirname(path));
  const category = immediateDir.startsWith('Arch_') ? immediateDir.slice('Arch_'.length) : '';
  const normalizedCategory = normalizeIconName(category);
  const baseCandidate = normalizedCategory ? `${baseName}-${normalizedCategory}` : `${baseName}-alt`;

  if (!existing.has(baseCandidate)) {
    return baseCandidate;
  }

  let index = 2;
  while (existing.has(`${baseCandidate}-${index}`)) {
    index += 1;
  }
  return `${baseCandidate}-${index}`;
}

function addAlias(
  aliases: Record<string, IconifyAlias>,
  alias: string,
  parent: string,
  iconNames: Set<string>
): void {
  if (!alias || alias === parent || iconNames.has(alias) || aliases[alias]) {
    return;
  }
  aliases[alias] = { parent };
}

function derivedAliases(iconName: string): string[] {
  const aliases: string[] = [];
  if (iconName.startsWith('amazon-')) {
    aliases.push(iconName.slice('amazon-'.length));
  }
  if (iconName.startsWith('aws-')) {
    aliases.push(iconName.slice('aws-'.length));
  }
  if (iconName.includes('agentcore')) {
    aliases.push(iconName.replace(/agentcore/g, 'agent-core'));
  }
  return aliases;
}

function manualAliases(iconNames: Set<string>): Record<string, string> {
  const aliases: Record<string, string> = {};
  if (iconNames.has('amazon-api-gateway')) {
    aliases['aws-api-gateway'] = 'amazon-api-gateway';
  }
  if (iconNames.has('amazon-bedrock-agentcore')) {
    aliases['bedrock-agentcore'] = 'amazon-bedrock-agentcore';
    aliases['bedrock-agent-core'] = 'amazon-bedrock-agentcore';
    aliases['aws-bedrock-agentcore'] = 'amazon-bedrock-agentcore';
  }
  if (iconNames.has('amazon-ec2')) {
    aliases.ec2 = 'amazon-ec2';
    aliases['aws-ec2'] = 'amazon-ec2';
  }
  return aliases;
}

export function buildAwsArchitectureIconifyJson(options: BuildAwsIconifyOptions): IconifyJson {
  const size = options.size ?? 48;
  const prefix = options.prefix ?? 'aws-arch';
  const sourcePath = resolveSourceInput(options);
  const sourceFiles = collectSourceFiles(sourcePath, size);

  const icons: Record<string, IconifyIcon> = {};

  for (const sourceFile of sourceFiles) {
    const fileName = basename(sourceFile.scopePath);
    const match = fileName.match(ARCH_FILE_PATTERN);
    if (!match?.groups) {
      continue;
    }

    const parsed = parseSvg(sourceFile.rawSvg, sourceFile.sourcePath);
    const iconData: IconifyIcon = {
      body: parsed.body,
      width: parsed.width,
      height: parsed.height
    };

    const baseName = normalizeIconName(match.groups.service);
    let iconName = baseName;

    if (icons[iconName]) {
      const existing = icons[iconName];
      const same =
        existing.body === iconData.body && existing.width === iconData.width && existing.height === iconData.height;
      if (same) {
        continue;
      }
      iconName = scopedIconName(baseName, sourceFile.scopePath, new Set(Object.keys(icons)));
    }

    icons[iconName] = iconData;
  }

  if (Object.keys(icons).length === 0) {
    throw new Error(`No Arch_*_${size}.svg files found under ${sourcePath}`);
  }

  const iconNames = new Set(Object.keys(icons));
  const aliases: Record<string, IconifyAlias> = {};

  for (const [alias, parent] of Object.entries(manualAliases(iconNames))) {
    addAlias(aliases, alias, parent, iconNames);
  }
  for (const iconName of [...iconNames].sort()) {
    for (const alias of derivedAliases(iconName)) {
      addAlias(aliases, alias, iconName, iconNames);
    }
  }

  const sortedIcons = Object.fromEntries(Object.entries(icons).sort(([a], [b]) => a.localeCompare(b)));
  const payload: IconifyJson = {
    prefix,
    icons: sortedIcons
  };

  if (Object.keys(aliases).length > 0) {
    payload.aliases = Object.fromEntries(Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b)));
  }

  return payload;
}
