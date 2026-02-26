import { describe, expect, it } from 'vitest';
import {
  hasExplicitRoughOptions,
  inferModeFromInputPath,
  parseFillStyleOption,
  parseIconPackOption,
  parseFloatOption,
  parseIntegerOption,
  parseLookOption,
  parseModeOption,
  resolveModeFromInput,
  validateLookRoughnessCompatibility
} from '../src/cli-parse.js';

describe('parseIntegerOption', () => {
  it('accepts valid integer strings', () => {
    expect(parseIntegerOption('14', 'font-size')).toBe(14);
    expect(parseIntegerOption(' 60000 ', 'timeout-ms')).toBe(60000);
  });

  it('rejects invalid integer strings', () => {
    expect(() => parseIntegerOption('14px', 'font-size')).toThrow('Invalid font-size: 14px');
    expect(() => parseIntegerOption('1.5', 'settle-ms')).toThrow('Invalid settle-ms: 1.5');
    expect(() => parseIntegerOption('abc', 'timeout-ms')).toThrow('Invalid timeout-ms: abc');
  });
});

describe('parseFloatOption', () => {
  it('accepts valid numeric strings', () => {
    expect(parseFloatOption('1.25', 'roughness')).toBe(1.25);
    expect(parseFloatOption('2', 'roughness')).toBe(2);
    expect(parseFloatOption('1e-2', 'roughness')).toBe(0.01);
  });

  it('rejects invalid numeric strings', () => {
    expect(() => parseFloatOption('1.2.3', 'roughness')).toThrow('Invalid roughness: 1.2.3');
    expect(() => parseFloatOption('abc', 'roughness')).toThrow('Invalid roughness: abc');
    expect(() => parseFloatOption('1.5px', 'roughness')).toThrow('Invalid roughness: 1.5px');
  });
});

describe('parseFillStyleOption', () => {
  it('accepts supported fill-style values', () => {
    expect(parseFillStyleOption('hachure')).toBe('hachure');
    expect(parseFillStyleOption('CROSS-HATCH')).toBe('cross-hatch');
    expect(parseFillStyleOption(' zigzag-line ')).toBe('zigzag-line');
  });

  it('rejects unsupported fill-style values', () => {
    expect(() => parseFillStyleOption('diagonal')).toThrow(
      'Invalid fill-style: diagonal. Expected one of: hachure, solid, zigzag, cross-hatch, dots, dashed, zigzag-line'
    );
  });
});

describe('parseLookOption', () => {
  it('accepts supported look values', () => {
    expect(parseLookOption('classic')).toBe('classic');
    expect(parseLookOption(' handDrawn ')).toBe('handDrawn');
    expect(parseLookOption('HANDDRAWN')).toBe('handDrawn');
  });

  it('rejects unsupported look values', () => {
    expect(() => parseLookOption('sketch')).toThrow('Invalid look: sketch. Expected classic or handDrawn');
    expect(() => parseLookOption('')).toThrow('Invalid look: . Expected classic or handDrawn');
  });
});

describe('parseModeOption', () => {
  it('accepts supported mode values', () => {
    expect(parseModeOption('diagram')).toBe('diagram');
    expect(parseModeOption(' MARKDOWN ')).toBe('markdown');
  });

  it('rejects unsupported mode values', () => {
    expect(() => parseModeOption('md')).toThrow('Invalid mode: md. Expected diagram or markdown');
    expect(() => parseModeOption('')).toThrow('Invalid mode: . Expected diagram or markdown');
  });
});

describe('inferModeFromInputPath', () => {
  it('detects diagram extensions case-insensitively', () => {
    expect(inferModeFromInputPath('diagram.mmd')).toBe('diagram');
    expect(inferModeFromInputPath('diagram.MERMAID')).toBe('diagram');
  });

  it('detects markdown extensions case-insensitively', () => {
    expect(inferModeFromInputPath('README.md')).toBe('markdown');
    expect(inferModeFromInputPath('guide.MDX')).toBe('markdown');
    expect(inferModeFromInputPath('notes.markdown')).toBe('markdown');
  });

  it('returns undefined for unknown extensions', () => {
    expect(inferModeFromInputPath('diagram.txt')).toBeUndefined();
  });
});

describe('resolveModeFromInput', () => {
  it('prefers explicit mode override', () => {
    expect(resolveModeFromInput({ inputPath: 'README.md', explicitMode: 'diagram' })).toBe('diagram');
  });

  it('falls back to extension inference', () => {
    expect(resolveModeFromInput({ inputPath: 'README.md' })).toBe('markdown');
  });

  it('throws for unknown extension without explicit mode', () => {
    expect(() => resolveModeFromInput({ inputPath: 'notes.txt' })).toThrow(
      'Unable to infer mode from input extension: notes.txt. Use --mode diagram or --mode markdown.'
    );
  });
});

describe('validateLookRoughnessCompatibility', () => {
  it('rejects roughness with classic look override', () => {
    expect(() =>
      validateLookRoughnessCompatibility({
        look: 'classic',
        roughness: 0.5
      })
    ).toThrow('Rough options cannot be used with --look classic');
  });

  it('rejects fill-weight with classic look override', () => {
    expect(() =>
      validateLookRoughnessCompatibility({
        look: 'classic',
        fillWeight: 1.2
      })
    ).toThrow('Rough options cannot be used with --look classic');
  });

  it('rejects additional rough options with classic look override', () => {
    expect(() =>
      validateLookRoughnessCompatibility({
        look: 'classic',
        hachureGap: 2,
        preserveVertices: true
      })
    ).toThrow('Rough options cannot be used with --look classic');
  });

  it('allows roughness when look is handDrawn or unset', () => {
    expect(() =>
      validateLookRoughnessCompatibility({
        look: 'handDrawn',
        roughness: 0.5
      })
    ).not.toThrow();
    expect(() =>
      validateLookRoughnessCompatibility({
        roughness: 0.5
      })
    ).not.toThrow();
  });
});

describe('hasExplicitRoughOptions', () => {
  it('detects numeric rough options', () => {
    expect(hasExplicitRoughOptions({ roughness: 0.5 })).toBe(true);
    expect(hasExplicitRoughOptions({ seed: 42 })).toBe(true);
  });

  it('detects boolean rough options', () => {
    expect(hasExplicitRoughOptions({ disableMultiStroke: false })).toBe(true);
  });

  it('returns false when no rough options are explicitly set', () => {
    expect(hasExplicitRoughOptions({})).toBe(false);
  });
});

describe('parseIconPackOption', () => {
  it('parses name=source format', () => {
    expect(parseIconPackOption('logos=./icons/logos.json')).toEqual({
      name: 'logos',
      source: './icons/logos.json'
    });
    expect(parseIconPackOption('custom-pack=https://example.com/icons.json')).toEqual({
      name: 'custom-pack',
      source: 'https://example.com/icons.json'
    });
  });

  it('parses source-only format', () => {
    expect(parseIconPackOption('./icons/logos.json')).toEqual({
      source: './icons/logos.json'
    });
    expect(parseIconPackOption('https://example.com/icons.json?x=y')).toEqual({
      source: 'https://example.com/icons.json?x=y'
    });
    expect(parseIconPackOption('https://example.com/icons.json?token=a=b')).toEqual({
      source: 'https://example.com/icons.json?token=a=b'
    });
  });

  it('rejects invalid name format', () => {
    expect(() => parseIconPackOption('bad name=./icons.json')).toThrow('Invalid icon-pack name: bad name');
  });

  it('rejects empty input', () => {
    expect(() => parseIconPackOption('   ')).toThrow('Invalid icon-pack: expected name=path-or-url or path-or-url');
  });

  it('rejects malformed name=source inputs', () => {
    expect(() => parseIconPackOption('=./icons.json')).toThrow('Invalid icon-pack: expected name=path-or-url or path-or-url');
    expect(() => parseIconPackOption('logos=')).toThrow('Invalid icon-pack: source is required after "="');
  });
});
