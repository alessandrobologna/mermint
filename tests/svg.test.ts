import { describe, expect, it } from 'vitest';
import {
  buildEmbeddedFontCss,
  ensureOpaqueSvgBackground,
  forceTransparentSvgBackground,
  injectFontFamily,
  injectFontSize,
  normalizeDarkRoughTextColors,
  normalizeSvgViewport,
  sanitizeSvgEntities,
  sanitizeSvgXmlCompatibility
} from '../src/svg.js';

describe('forceTransparentSvgBackground', () => {
  it('replaces svg background color and full rect fill', () => {
    const svg = '<svg style="background-color: rgb(255, 255, 255);"><rect width="100%" height="100%" fill="white"/></svg>';
    const result = forceTransparentSvgBackground(svg);
    expect(result).toContain('background-color: transparent');
    expect(result).toContain('fill="transparent"');
  });
});

describe('ensureOpaqueSvgBackground', () => {
  it('injects opaque background style and rect when none exists', () => {
    const svg = '<svg><g/></svg>';
    const result = ensureOpaqueSvgBackground(svg, '#ffffff');
    expect(result).toContain('style="background-color: #ffffff;"');
    expect(result).toContain('<rect width="100%" height="100%" fill="#ffffff"/>');
  });

  it('replaces transparent full-size rect fill with opaque color', () => {
    const svg = '<svg style="background-color: transparent;"><rect width="100%" height="100%" fill="transparent"/></svg>';
    const result = ensureOpaqueSvgBackground(svg, '#1f2020');
    expect(result).toContain('background-color: #1f2020;');
    expect(result).toContain('fill="#1f2020"');
  });
});

describe('injectFontFamily', () => {
  it('applies font-family to styles and attributes', () => {
    const svg = '<svg><text style="font-family: Arial;">Hello</text><text font-family="Arial">World</text></svg>';
    const result = injectFontFamily(svg, 'Excalifont, cursive');
    expect(result).toContain('font-family: Excalifont, cursive;');
    expect(result).toContain('font-family="Excalifont, cursive"');
    expect(result).toContain('text, tspan, foreignObject .nodeLabel');
  });

  it('replaces quoted font-family declarations without leaving trailing fragments', () => {
    const svg =
      '<svg><g style="font-family: &quot;trebuchet ms&quot;, verdana, arial; font-size: 13px;"><foreignObject><div>Hi</div></foreignObject></g></svg>';
    const result = injectFontFamily(svg, 'virgil, excalifont, cursive');
    expect(result).toContain('font-family: virgil, excalifont, cursive; font-size: 13px;');
    expect(result).not.toContain('&quot;trebuchet ms&quot;');
  });

  it('does not corrupt embedded @font-face declarations', () => {
    const svg =
      '<svg><style><![CDATA[@font-face { font-family: "Excalifont"; src: url("x") format("woff2"); }]]></style><text style="font-family: Arial;">Hello</text></svg>';
    const result = injectFontFamily(svg, 'virgil, excalifont, cursive');
    expect(result).toContain('font-family: "Excalifont";');
    expect(result).not.toContain('virgil, excalifont, cursive;"Excalifont"');
  });
});

describe('injectFontSize', () => {
  it('adds font-size styles for svg and html labels', () => {
    const svg = '<svg><text style="font-size: 16px;">Hello</text><text font-size="16px">Yo</text><foreignObject><div>Hi</div></foreignObject></svg>';
    const result = injectFontSize(svg, 14);
    expect(result).toContain('font-size: 14px');
    expect(result).toContain('font-size="14px"');
    expect(result).toContain('foreignObject');
    expect(result).toContain('foreignObject p');
    expect(result).toContain('margin: 0 !important;');
  });
});

describe('buildEmbeddedFontCss', () => {
  it('builds @font-face block', () => {
    const css = buildEmbeddedFontCss('Excalifont', 'data:font/woff2;base64,AAA', 'woff2');
    expect(css).toContain('@font-face');
    expect(css).toContain('font-family: "Excalifont"');
    expect(css).toContain('format("woff2")');
  });
});

describe('sanitizeSvgEntities', () => {
  it('replaces nbsp entity with numeric entity', () => {
    const svg = '<svg><text>&nbsp;&nbsp;</text></svg>';
    const result = sanitizeSvgEntities(svg);
    expect(result).toContain('&#160;&#160;');
  });
});

describe('sanitizeSvgXmlCompatibility', () => {
  it('adds xlink namespace when xlink:href is used', () => {
    const svg = '<svg><image xlink:href="data:image/png;base64,AAA"/></svg>';
    const result = sanitizeSvgXmlCompatibility(svg);
    expect(result).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
  });

  it('self-closes br tags for XML parsing', () => {
    const svg = '<svg><foreignObject><div><p>a<br>b</p></div></foreignObject></svg>';
    const result = sanitizeSvgXmlCompatibility(svg);
    expect(result).toContain('<br/>');
  });
});

describe('normalizeSvgViewport', () => {
  it('sets viewBox and dimensions', () => {
    const svg = '<svg width="100" height="100"></svg>';
    const result = normalizeSvgViewport(svg, { minX: 10.2, minY: 5.9, width: 200.3, height: 99.7 });
    expect(result).toContain('viewBox="10.2 5.9 200.3 99.7"');
    expect(result).toContain('width="201"');
    expect(result).toContain('height="100"');
  });
});

describe('normalizeDarkRoughTextColors', () => {
  it('replaces black text colors and injects readable dark-mode text styles', () => {
    const svg = '<svg><g style="color: rgb(0, 0, 0);"><text fill="#000">X</text><foreignObject><div style="color: black;">Y</div></foreignObject></g></svg>';
    const result = normalizeDarkRoughTextColors(svg);
    expect(result).toContain('color: rgb(229, 231, 235);');
    expect(result).toContain('fill="rgb(229, 231, 235)"');
    expect(result).toContain('text, tspan, foreignObject *, .nodeLabel, .edgeLabel');
  });

  it('does not rewrite non-text color properties', () => {
    const svg = '<svg><style>.x{background-color: black; border-color: #000; color: black;}</style></svg>';
    const result = normalizeDarkRoughTextColors(svg);
    expect(result).toContain('background-color: black;');
    expect(result).toContain('border-color: #000;');
    expect(result).toContain('color: rgb(229, 231, 235);');
  });
});
