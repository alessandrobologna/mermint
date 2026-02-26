import { InvalidArgumentError } from 'commander';
import { extname } from 'node:path';
import { UserFacingError } from './errors.js';
import { ROUGH_FILL_STYLES } from './types.js';
import type { IconPackSource, RoughFillStyle, RoughOptions } from './types.js';

const INTEGER_PATTERN = /^[+-]?\d+$/;
const FLOAT_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const ICON_PACK_NAME_PATTERN = /^[a-z][a-z0-9_-]*$/i;
const ROUGH_FILL_STYLE_VALUES = new Set<string>(ROUGH_FILL_STYLES);
const LOOK_VALUES = new Map<string, 'classic' | 'handDrawn'>([
  ['classic', 'classic'],
  ['handdrawn', 'handDrawn']
]);
const MODE_VALUES = new Map<string, CliMode>([
  ['diagram', 'diagram'],
  ['markdown', 'markdown']
]);
const DIAGRAM_INPUT_EXTENSIONS = new Set(['.mmd', '.mermaid']);
const MARKDOWN_INPUT_EXTENSIONS = new Set(['.md', '.markdown', '.mdx']);

export type CliMode = 'diagram' | 'markdown';

export function parseIntegerOption(value: string, name: string): number {
  const normalized = value.trim();
  if (!INTEGER_PATTERN.test(normalized)) {
    throw new InvalidArgumentError(`Invalid ${name}: ${value}`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new InvalidArgumentError(`Invalid ${name}: ${value}`);
  }
  return parsed;
}

export function parseFloatOption(value: string, name: string): number {
  const normalized = value.trim();
  if (!FLOAT_PATTERN.test(normalized)) {
    throw new InvalidArgumentError(`Invalid ${name}: ${value}`);
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new InvalidArgumentError(`Invalid ${name}: ${value}`);
  }
  return parsed;
}

export function parseLookOption(value: string): 'classic' | 'handDrawn' {
  const normalized = value.trim().toLowerCase();
  const parsed = LOOK_VALUES.get(normalized);
  if (!parsed) {
    throw new InvalidArgumentError(`Invalid look: ${value}. Expected classic or handDrawn`);
  }
  return parsed;
}

export function parseModeOption(value: string): CliMode {
  const normalized = value.trim().toLowerCase();
  const parsed = MODE_VALUES.get(normalized);
  if (!parsed) {
    throw new InvalidArgumentError(`Invalid mode: ${value}. Expected diagram or markdown`);
  }
  return parsed;
}

export function inferModeFromInputPath(inputPath: string): CliMode | undefined {
  const extension = extname(inputPath.trim()).toLowerCase();
  if (DIAGRAM_INPUT_EXTENSIONS.has(extension)) {
    return 'diagram';
  }
  if (MARKDOWN_INPUT_EXTENSIONS.has(extension)) {
    return 'markdown';
  }
  return undefined;
}

export function resolveModeFromInput(options: { inputPath: string; explicitMode?: CliMode }): CliMode {
  if (options.explicitMode) {
    return options.explicitMode;
  }
  const inferred = inferModeFromInputPath(options.inputPath);
  if (inferred) {
    return inferred;
  }
  throw new UserFacingError(
    `Unable to infer mode from input extension: ${options.inputPath}. Use --mode diagram or --mode markdown.`
  );
}

export function validateModeSpecificOptions(options: {
  mode: CliMode;
  output?: string;
  markdownOnlyOptions?: string[];
}): void {
  if (options.mode === 'diagram') {
    if (!options.output?.trim()) {
      throw new UserFacingError('--output is required in diagram mode');
    }
    if (options.markdownOnlyOptions && options.markdownOnlyOptions.length > 0) {
      throw new UserFacingError(`${options.markdownOnlyOptions.join(', ')} can only be used in markdown mode`);
    }
  }
}

export function parseFillStyleOption(value: string): RoughFillStyle {
  const normalized = value.trim().toLowerCase();
  if (!ROUGH_FILL_STYLE_VALUES.has(normalized)) {
    throw new InvalidArgumentError(
      `Invalid fill-style: ${value}. Expected one of: ${ROUGH_FILL_STYLES.join(', ')}`
    );
  }
  return normalized as RoughFillStyle;
}

export function hasExplicitRoughOptions(options: Partial<RoughOptions>): boolean {
  if (Number.isFinite(options.roughness)) return true;
  if (Number.isFinite(options.fillWeight)) return true;
  if (typeof options.fillStyle === 'string' && options.fillStyle.trim()) return true;
  if (Number.isFinite(options.hachureGap)) return true;
  if (Number.isFinite(options.hachureAngle)) return true;
  if (Number.isFinite(options.bowing)) return true;
  if (Number.isFinite(options.strokeWidth)) return true;
  if (Number.isSafeInteger(options.seed)) return true;
  if (typeof options.disableMultiStroke === 'boolean') return true;
  if (typeof options.disableMultiStrokeFill === 'boolean') return true;
  if (typeof options.preserveVertices === 'boolean') return true;
  return false;
}

export function validateLookRoughnessCompatibility(options: {
  look?: string;
} & Partial<RoughOptions>): void {
  const look = options.look?.trim().toLowerCase();
  if (look === 'classic' && hasExplicitRoughOptions(options)) {
    throw new UserFacingError('Rough options cannot be used with --look classic');
  }
}

export function parseIconPackOption(value: string): IconPackSource {
  const normalized = value.trim();
  if (!normalized) {
    throw new InvalidArgumentError('Invalid icon-pack: expected name=path-or-url or path-or-url');
  }

  const equalIndex = normalized.indexOf('=');
  if (equalIndex >= 0) {
    const left = normalized.slice(0, equalIndex).trim();
    const right = normalized.slice(equalIndex + 1).trim();
    const leftLooksLikeSource = /^https?:\/\//i.test(left) || left.includes('/') || left.includes('\\');

    if (!leftLooksLikeSource) {
      if (!left) {
        throw new InvalidArgumentError('Invalid icon-pack: expected name=path-or-url or path-or-url');
      }
      if (!ICON_PACK_NAME_PATTERN.test(left)) {
        throw new InvalidArgumentError(`Invalid icon-pack name: ${left}`);
      }
      if (!right) {
        throw new InvalidArgumentError('Invalid icon-pack: source is required after "="');
      }
      return {
        name: left,
        source: right
      };
    }
  }

  return {
    source: normalized
  };
}
