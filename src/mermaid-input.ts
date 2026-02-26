import { ROUGH_FILL_STYLES } from './types.js';
import type { IconPackSource, RoughFillStyle, RoughOptions } from './types.js';

const HAND_DRAWN_LOOK_ASSIGNMENT_REGEX = /((?:"look"|'look'|look)\s*:\s*)(["']?)handdrawn\2/gi;
const FRONTMATTER_REGEX = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n)?/;
const DIRECTIVE_BLOCK_REGEX = /%%\{[\s\S]*?}%%/g;
const FRONTMATTER_FONT_FAMILY_LINE_REGEX = /^[ \t]*(?:"fontFamily"|'fontFamily'|fontFamily)\s*:\s*(.+?)\s*$/im;
const DIRECTIVE_FONT_FAMILY_REGEX = /(?:"fontFamily"|'fontFamily'|fontFamily)\s*:\s*("[^"]*"|'[^']*'|[^,\r\n}]+)/i;
const ICON_PACKS_KEY_REGEX = /(?:"iconPacks"|'iconPacks'|iconPacks)\s*:/gi;
const X_MERMINT_KEY_REGEX = /(?:"x-mermint"|'x-mermint'|x-mermint)\s*:/gi;
const ROUGH_KEY_REGEX = /(?:"rough"|'rough'|rough)\s*:/gi;
const FRONTMATTER_ICON_PACKS_LINE_REGEX = /^([ \t]*)(?:"iconPacks"|'iconPacks'|iconPacks)\s*:\s*(.*)$/i;
const FRONTMATTER_X_MERMINT_LINE_REGEX = /^([ \t]*)(?:"x-mermint"|'x-mermint'|x-mermint)\s*:\s*(.*)$/i;
const FRONTMATTER_ROUGH_LINE_REGEX = /^([ \t]*)(?:"rough"|'rough'|rough)\s*:\s*(.*)$/i;
const YAML_ICON_PACK_ENTRY_REGEX = /^[ \t]*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))\s*:\s*(.+?)\s*$/;
const YAML_ROUGH_ENTRY_REGEX = /^[ \t]*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))\s*:\s*(.+?)\s*$/;
const INTEGER_PATTERN = /^[+-]?\d+$/;
const FLOAT_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const ROUGH_FILL_STYLE_VALUES = new Set<string>(ROUGH_FILL_STYLES);
const ROUGH_OPTION_KEYS = new Set([
  'roughness',
  'fillWeight',
  'fillStyle',
  'hachureGap',
  'hachureAngle',
  'bowing',
  'strokeWidth',
  'seed',
  'disableMultiStroke',
  'disableMultiStrokeFill',
  'preserveVertices'
]);

interface FrontmatterMatch {
  value: string;
  start: number;
  end: number;
}

function normalizeLookAssignments(segment: string): { segment: string; changed: boolean } {
  let changed = false;
  const normalized = segment.replace(
    HAND_DRAWN_LOOK_ASSIGNMENT_REGEX,
    (_match, prefix: string, quote: string) => {
      changed = true;
      return `${prefix}${quote}classic${quote}`;
    }
  );
  return { segment: normalized, changed };
}

export interface StripHandDrawnLookResult {
  code: string;
  stripped: boolean;
}

export interface ExtractConfiguredRoughOptionsResult {
  options: RoughOptions;
  unknownKeys: string[];
  invalidEntries: Array<{ key: string; value: string }>;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function leadingIndent(line: string): number {
  const match = line.match(/^[ \t]*/);
  return (match?.[0] || '').length;
}

function findMatchingBrace(text: string, startIndex: number): number {
  let depth = 0;
  let inString: '"' | "'" | null = null;
  let escaped = false;

  for (let i = startIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === inString) {
        inString = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }

    if (ch === '{') {
      depth += 1;
      continue;
    }

    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
      if (depth < 0) return -1;
    }
  }

  return -1;
}

function normalizeIconPackSource(value: string, quoted: boolean): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const normalized = quoted ? trimmed : unquote(trimmed);
  if (!normalized) return undefined;

  if (!quoted && !/^https?:\/\//i.test(normalized) && !normalized.includes('/') && !normalized.includes('\\')) {
    return undefined;
  }
  return normalized;
}

function parseQuotedToken(text: string, startIndex: number): { value: string; nextIndex: number } | null {
  const quote = text[startIndex];
  if (quote !== '"' && quote !== "'") return null;

  let escaped = false;
  let value = '';

  for (let i = startIndex + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      value += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === quote) {
      return {
        value,
        nextIndex: i + 1
      };
    }
    value += ch;
  }

  return null;
}

function parseIdentifierToken(text: string, startIndex: number): { value: string; nextIndex: number } | null {
  const match = text.slice(startIndex).match(/^[A-Za-z0-9_-]+/);
  if (!match) return null;
  return {
    value: match[0],
    nextIndex: startIndex + match[0].length
  };
}

function parseObjectLiteralValue(
  text: string,
  startIndex: number
): { value: string; nextIndex: number; quoted: boolean } | null {
  const quotedToken = parseQuotedToken(text, startIndex);
  if (quotedToken) {
    return {
      value: quotedToken.value,
      nextIndex: quotedToken.nextIndex,
      quoted: true
    };
  }

  let inString: '"' | "'" | null = null;
  let escaped = false;
  let depth = 0;
  let i = startIndex;

  for (; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === inString) {
        inString = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') {
      depth += 1;
      continue;
    }
    if (ch === '}' || ch === ']' || ch === ')') {
      if (depth === 0) break;
      depth -= 1;
      continue;
    }
    if (ch === ',' && depth === 0) break;
  }

  const value = text.slice(startIndex, i).trim();
  if (!value) return null;

  return {
    value,
    nextIndex: i,
    quoted: false
  };
}

interface ObjectLiteralEntry {
  key: string;
  value: string;
  quoted: boolean;
}

function parseObjectLiteralEntries(objectLiteral: string): ObjectLiteralEntry[] {
  const entries: ObjectLiteralEntry[] = [];
  let i = 0;

  const skipWhitespace = () => {
    while (i < objectLiteral.length && /\s/.test(objectLiteral[i])) {
      i += 1;
    }
  };

  skipWhitespace();
  if (objectLiteral[i] !== '{') return entries;
  i += 1;

  while (i < objectLiteral.length) {
    skipWhitespace();
    if (objectLiteral[i] === ',') {
      i += 1;
      continue;
    }
    if (objectLiteral[i] === '}') {
      break;
    }

    const keyToken = parseQuotedToken(objectLiteral, i) ?? parseIdentifierToken(objectLiteral, i);
    if (!keyToken) break;
    i = keyToken.nextIndex;

    skipWhitespace();
    if (objectLiteral[i] !== ':') {
      while (i < objectLiteral.length && objectLiteral[i] !== ',' && objectLiteral[i] !== '}') {
        i += 1;
      }
      continue;
    }
    i += 1;

    skipWhitespace();
    const valueToken = parseObjectLiteralValue(objectLiteral, i);
    if (!valueToken) break;
    i = valueToken.nextIndex;

    entries.push({
      key: keyToken.value.trim(),
      value: valueToken.value,
      quoted: valueToken.quoted
    });
  }

  return entries;
}

function parseIconPackObjectLiteral(objectLiteral: string): IconPackSource[] {
  const packs: IconPackSource[] = [];
  for (const entry of parseObjectLiteralEntries(objectLiteral)) {
    const source = normalizeIconPackSource(entry.value, entry.quoted);
    const name = entry.key.trim();
    if (name && source) {
      packs.push({ name, source });
    }
  }

  return packs;
}

function extractObjectLiteralsForKey(segment: string, keyRegex: RegExp): string[] {
  const literals: string[] = [];
  keyRegex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = keyRegex.exec(segment)) !== null) {
    let cursor = match.index + match[0].length;
    while (cursor < segment.length && /\s/.test(segment[cursor])) {
      cursor += 1;
    }
    if (segment[cursor] !== '{') continue;

    const end = findMatchingBrace(segment, cursor);
    if (end === -1) continue;
    literals.push(segment.slice(cursor, end + 1));
    keyRegex.lastIndex = end + 1;
  }
  return literals;
}

function extractIconPackObjectLiterals(segment: string): string[] {
  return extractObjectLiteralsForKey(segment, ICON_PACKS_KEY_REGEX);
}

function extractFrontmatterYamlIconPacks(frontmatter: string): IconPackSource[] {
  const lines = frontmatter.split(/\r?\n/);
  const packs: IconPackSource[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const match = (lines[i] || '').match(FRONTMATTER_ICON_PACKS_LINE_REGEX);
    if (!match) continue;

    const iconPacksIndent = (match[1] || '').length;
    const trailing = (match[2] || '').trim();
    if (trailing.startsWith('{')) {
      continue;
    }

    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j] || '';
      const trimmed = line.trim();
      if (!trimmed) continue;

      const indent = leadingIndent(line);
      if (indent <= iconPacksIndent) {
        i = j - 1;
        break;
      }
      if (trimmed.startsWith('#')) continue;

      const entry = line.match(YAML_ICON_PACK_ENTRY_REGEX);
      if (!entry) continue;
      const name = (entry[1] || entry[2] || entry[3] || '').trim();
      const rawValue = (entry[4] || '').trim();
      const source = normalizeIconPackSource(rawValue, rawValue.startsWith('"') || rawValue.startsWith("'"));
      if (name && source) {
        packs.push({ name, source });
      }
    }
  }

  return packs;
}

function normalizeRoughFillStyle(value: string): RoughFillStyle | undefined {
  const normalized = value.trim().toLowerCase();
  if (!ROUGH_FILL_STYLE_VALUES.has(normalized)) {
    return undefined;
  }
  return normalized as RoughFillStyle;
}

function parseRoughNumberValue(value: string, quoted: boolean): number | undefined {
  const token = (quoted ? value : unquote(value)).trim();
  if (!FLOAT_PATTERN.test(token)) return undefined;
  const parsed = Number(token);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function parseRoughIntegerValue(value: string, quoted: boolean): number | undefined {
  const token = (quoted ? value : unquote(value)).trim();
  if (!INTEGER_PATTERN.test(token)) return undefined;
  const parsed = Number(token);
  if (!Number.isSafeInteger(parsed)) return undefined;
  return parsed;
}

function parseRoughBooleanValue(value: string, quoted: boolean): boolean | undefined {
  const token = (quoted ? value : unquote(value)).trim().toLowerCase();
  if (token === 'true') return true;
  if (token === 'false') return false;
  return undefined;
}

function assignRoughOptionFromValue(
  key: string,
  value: string,
  quoted: boolean,
  options: RoughOptions,
  invalidEntries: Array<{ key: string; value: string }>,
  unknownKeys: Set<string>
): void {
  const normalizedKey = key.trim();
  if (!normalizedKey) return;
  if (!ROUGH_OPTION_KEYS.has(normalizedKey)) {
    unknownKeys.add(normalizedKey);
    return;
  }

  const invalid = () => invalidEntries.push({ key: normalizedKey, value: value.trim() });
  switch (normalizedKey) {
    case 'roughness': {
      const parsed = parseRoughNumberValue(value, quoted);
      if (parsed === undefined) invalid();
      else options.roughness = parsed;
      break;
    }
    case 'fillWeight': {
      const parsed = parseRoughNumberValue(value, quoted);
      if (parsed === undefined) invalid();
      else options.fillWeight = parsed;
      break;
    }
    case 'fillStyle': {
      const parsed = normalizeRoughFillStyle(quoted ? value : unquote(value));
      if (!parsed) invalid();
      else options.fillStyle = parsed;
      break;
    }
    case 'hachureGap': {
      const parsed = parseRoughNumberValue(value, quoted);
      if (parsed === undefined) invalid();
      else options.hachureGap = parsed;
      break;
    }
    case 'hachureAngle': {
      const parsed = parseRoughNumberValue(value, quoted);
      if (parsed === undefined) invalid();
      else options.hachureAngle = parsed;
      break;
    }
    case 'bowing': {
      const parsed = parseRoughNumberValue(value, quoted);
      if (parsed === undefined) invalid();
      else options.bowing = parsed;
      break;
    }
    case 'strokeWidth': {
      const parsed = parseRoughNumberValue(value, quoted);
      if (parsed === undefined) invalid();
      else options.strokeWidth = parsed;
      break;
    }
    case 'seed': {
      const parsed = parseRoughIntegerValue(value, quoted);
      if (parsed === undefined) invalid();
      else options.seed = parsed;
      break;
    }
    case 'disableMultiStroke': {
      const parsed = parseRoughBooleanValue(value, quoted);
      if (parsed === undefined) invalid();
      else options.disableMultiStroke = parsed;
      break;
    }
    case 'disableMultiStrokeFill': {
      const parsed = parseRoughBooleanValue(value, quoted);
      if (parsed === undefined) invalid();
      else options.disableMultiStrokeFill = parsed;
      break;
    }
    case 'preserveVertices': {
      const parsed = parseRoughBooleanValue(value, quoted);
      if (parsed === undefined) invalid();
      else options.preserveVertices = parsed;
      break;
    }
    default:
      unknownKeys.add(normalizedKey);
  }
}

function applyRoughOptionsObjectLiteral(
  objectLiteral: string,
  options: RoughOptions,
  invalidEntries: Array<{ key: string; value: string }>,
  unknownKeys: Set<string>
): void {
  for (const entry of parseObjectLiteralEntries(objectLiteral)) {
    assignRoughOptionFromValue(entry.key, entry.value, entry.quoted, options, invalidEntries, unknownKeys);
  }
}

function extractRoughObjectLiterals(segment: string): string[] {
  const roughLiterals: string[] = [];
  for (const extensionLiteral of extractObjectLiteralsForKey(segment, X_MERMINT_KEY_REGEX)) {
    roughLiterals.push(...extractObjectLiteralsForKey(extensionLiteral, ROUGH_KEY_REGEX));
  }
  return roughLiterals;
}

function extractFrontmatterYamlRoughOptions(
  frontmatter: string,
  options: RoughOptions,
  invalidEntries: Array<{ key: string; value: string }>,
  unknownKeys: Set<string>
): void {
  const lines = frontmatter.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const extensionMatch = (lines[i] || '').match(FRONTMATTER_X_MERMINT_LINE_REGEX);
    if (!extensionMatch) continue;

    const extensionIndent = (extensionMatch[1] || '').length;
    const extensionTrailing = (extensionMatch[2] || '').trim();
    if (extensionTrailing.startsWith('{')) {
      for (const roughLiteral of extractRoughObjectLiterals(extensionTrailing)) {
        applyRoughOptionsObjectLiteral(roughLiteral, options, invalidEntries, unknownKeys);
      }
      continue;
    }

    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j] || '';
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const indent = leadingIndent(line);
      if (indent <= extensionIndent) {
        i = j - 1;
        break;
      }

      const roughMatch = line.match(FRONTMATTER_ROUGH_LINE_REGEX);
      if (!roughMatch) continue;
      const roughIndent = (roughMatch[1] || '').length;
      const roughTrailing = (roughMatch[2] || '').trim();

      if (roughTrailing.startsWith('{')) {
        applyRoughOptionsObjectLiteral(roughTrailing, options, invalidEntries, unknownKeys);
      } else if (roughTrailing) {
        invalidEntries.push({ key: 'rough', value: roughTrailing });
      }

      for (let k = j + 1; k < lines.length; k += 1) {
        const nestedLine = lines[k] || '';
        const nestedTrimmed = nestedLine.trim();
        if (!nestedTrimmed || nestedTrimmed.startsWith('#')) continue;

        const nestedIndent = leadingIndent(nestedLine);
        if (nestedIndent <= roughIndent) {
          j = k - 1;
          break;
        }

        const entryMatch = nestedLine.match(YAML_ROUGH_ENTRY_REGEX);
        if (!entryMatch) continue;

        const key = (entryMatch[1] || entryMatch[2] || entryMatch[3] || '').trim();
        const rawValue = (entryMatch[4] || '').trim();
        const isQuoted = rawValue.startsWith('"') || rawValue.startsWith("'");
        assignRoughOptionFromValue(key, rawValue, isQuoted, options, invalidEntries, unknownKeys);
      }
    }
  }
}

function matchLeadingFrontmatter(code: string): FrontmatterMatch | null {
  let offset = code.startsWith('\uFEFF') ? 1 : 0;
  const leadingBlankLines = code.slice(offset).match(/^(?:[ \t]*\r?\n)+/);
  if (leadingBlankLines) {
    offset += leadingBlankLines[0].length;
  }

  const frontmatter = code.slice(offset).match(FRONTMATTER_REGEX);
  if (!frontmatter) return null;

  const value = frontmatter[0];
  return {
    value,
    start: offset,
    end: offset + value.length
  };
}

function normalizeLeadingFrontmatterWhitespace(code: string): string {
  const frontmatter = matchLeadingFrontmatter(code);
  if (!frontmatter || frontmatter.start === 0) return code;

  const prefix = code.slice(0, frontmatter.start);
  if (!/^\uFEFF?(?:[ \t]*\r?\n)*$/.test(prefix)) {
    return code;
  }

  const bom = prefix.startsWith('\uFEFF') ? '\uFEFF' : '';
  return `${bom}${code.slice(frontmatter.start)}`;
}

export function extractConfiguredFontFamilyFromInput(code: string): string | undefined {
  const frontmatter = matchLeadingFrontmatter(normalizeLeadingFrontmatterWhitespace(code));
  if (frontmatter) {
    const frontmatterMatch = frontmatter.value.match(FRONTMATTER_FONT_FAMILY_LINE_REGEX);
    const value = frontmatterMatch?.[1];
    if (value) {
      const normalized = unquote(value);
      if (normalized) return normalized;
    }
  }

  const directiveMatches = code.match(DIRECTIVE_BLOCK_REGEX);
  if (!directiveMatches) return undefined;

  for (const directive of directiveMatches) {
    const match = directive.match(DIRECTIVE_FONT_FAMILY_REGEX);
    const value = match?.[1];
    if (!value) continue;
    const normalized = unquote(value);
    if (normalized) return normalized;
  }

  return undefined;
}

export function extractConfiguredIconPacksFromInput(code: string): IconPackSource[] {
  const normalizedCode = normalizeLeadingFrontmatterWhitespace(code);
  const packs: IconPackSource[] = [];

  const frontmatter = matchLeadingFrontmatter(normalizedCode);
  if (frontmatter) {
    packs.push(...extractFrontmatterYamlIconPacks(frontmatter.value));
    for (const literal of extractIconPackObjectLiterals(frontmatter.value)) {
      packs.push(...parseIconPackObjectLiteral(literal));
    }
  }

  const directiveMatches = normalizedCode.match(DIRECTIVE_BLOCK_REGEX);
  if (!directiveMatches) return packs;

  for (const directive of directiveMatches) {
    for (const literal of extractIconPackObjectLiterals(directive)) {
      packs.push(...parseIconPackObjectLiteral(literal));
    }
  }

  return packs;
}

export function extractConfiguredRoughOptionsFromInput(code: string): ExtractConfiguredRoughOptionsResult {
  const normalizedCode = normalizeLeadingFrontmatterWhitespace(code);
  const options: RoughOptions = {};
  const unknownKeys = new Set<string>();
  const invalidEntries: Array<{ key: string; value: string }> = [];

  const frontmatter = matchLeadingFrontmatter(normalizedCode);
  if (frontmatter) {
    for (const roughLiteral of extractRoughObjectLiterals(frontmatter.value)) {
      applyRoughOptionsObjectLiteral(roughLiteral, options, invalidEntries, unknownKeys);
    }
    extractFrontmatterYamlRoughOptions(frontmatter.value, options, invalidEntries, unknownKeys);
  }

  const directiveMatches = normalizedCode.match(DIRECTIVE_BLOCK_REGEX);
  if (directiveMatches) {
    for (const directive of directiveMatches) {
      for (const roughLiteral of extractRoughObjectLiterals(directive)) {
        applyRoughOptionsObjectLiteral(roughLiteral, options, invalidEntries, unknownKeys);
      }
    }
  }

  return {
    options,
    unknownKeys: [...unknownKeys],
    invalidEntries
  };
}

export function stripHandDrawnLookFromInput(code: string): StripHandDrawnLookResult {
  let stripped = false;
  let next = normalizeLeadingFrontmatterWhitespace(code);

  const frontmatter = matchLeadingFrontmatter(next);
  if (frontmatter) {
    const normalized = normalizeLookAssignments(frontmatter.value);
    if (normalized.changed) {
      stripped = true;
      next = `${next.slice(0, frontmatter.start)}${normalized.segment}${next.slice(frontmatter.end)}`;
    }
  }

  next = next.replace(DIRECTIVE_BLOCK_REGEX, (directive) => {
    const normalized = normalizeLookAssignments(directive);
    if (normalized.changed) {
      stripped = true;
    }
    return normalized.segment;
  });

  return { code: next, stripped };
}
