import { describe, expect, it } from 'vitest';
import {
  extractSvgBackgroundColor,
  fontFamilyIncludesExcalifont,
  resolveRoughBackgroundColor,
  validateNoEmbedExcalifontOption
} from '../src/render.js';

describe('fontFamilyIncludesExcalifont', () => {
  it('detects excalifont in font-family lists', () => {
    expect(fontFamilyIncludesExcalifont('Excalifont')).toBe(true);
    expect(fontFamilyIncludesExcalifont('"Excalifont", sans-serif')).toBe(true);
    expect(fontFamilyIncludesExcalifont('Arial, Excalifont, sans-serif')).toBe(true);
    expect(fontFamilyIncludesExcalifont('Inter, sans-serif')).toBe(false);
    expect(fontFamilyIncludesExcalifont(undefined)).toBe(false);
  });
});

describe('validateNoEmbedExcalifontOption', () => {
  it('allows disabling bundled Excalifont when hand-drawn pipeline is active', () => {
    expect(() =>
      validateNoEmbedExcalifontOption({
        embedExcalifont: false,
        usesHandDrawnPipeline: true,
        fontFamily: undefined
      })
    ).not.toThrow();
  });

  it('allows disabling bundled Excalifont when font-family includes Excalifont', () => {
    expect(() =>
      validateNoEmbedExcalifontOption({
        embedExcalifont: false,
        usesHandDrawnPipeline: false,
        fontFamily: 'Excalifont, cursive'
      })
    ).not.toThrow();
  });

  it('rejects disabling bundled Excalifont when Excalifont is inactive', () => {
    expect(() =>
      validateNoEmbedExcalifontOption({
        embedExcalifont: false,
        usesHandDrawnPipeline: false,
        fontFamily: 'Inter, sans-serif'
      })
    ).toThrow('--no-embed-excalifont requires Excalifont to be active');
  });

  it('does not enforce validation unless --no-embed-excalifont is used', () => {
    expect(() =>
      validateNoEmbedExcalifontOption({
        embedExcalifont: true,
        usesHandDrawnPipeline: false,
        fontFamily: 'Inter, sans-serif'
      })
    ).not.toThrow();
    expect(() =>
      validateNoEmbedExcalifontOption({
        usesHandDrawnPipeline: false,
        fontFamily: 'Inter, sans-serif'
      })
    ).not.toThrow();
  });
});

describe('extractSvgBackgroundColor', () => {
  it('reads non-transparent svg style background color', () => {
    const svg = '<svg style="max-width: 200px; background-color: rgb(10, 20, 30);"></svg>';
    expect(extractSvgBackgroundColor(svg)).toBe('rgb(10, 20, 30)');
  });

  it('reads non-transparent full-size rect fill', () => {
    const svg = '<svg><rect width="100%" height="100%" fill="#111"/></svg>';
    expect(extractSvgBackgroundColor(svg)).toBe('#111');
  });

  it('ignores transparent backgrounds', () => {
    const svg = '<svg style="background-color: transparent;"><rect width="100%" height="100%" fill="none"/></svg>';
    expect(extractSvgBackgroundColor(svg)).toBeUndefined();
  });
});

describe('resolveRoughBackgroundColor', () => {
  it('returns null when transparent background is requested', () => {
    expect(
      resolveRoughBackgroundColor({
        svg: '<svg style="background-color: #fff;"></svg>',
        transparentBg: true,
        theme: 'default'
      })
    ).toBeNull();
  });

  it('falls back to theme defaults when source has no explicit background', () => {
    expect(
      resolveRoughBackgroundColor({
        svg: '<svg></svg>',
        transparentBg: false,
        theme: 'default'
      })
    ).toBe('#ffffff');
    expect(
      resolveRoughBackgroundColor({
        svg: '<svg></svg>',
        transparentBg: false,
        theme: 'dark'
      })
    ).toBe('#1f2020');
  });
});
