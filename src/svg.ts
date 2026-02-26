export interface SvgViewport {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

function setStyleDeclaration(styleValue: string, property: string, value: string): string {
  const propertyName = property.trim();
  if (!propertyName) return styleValue;

  const escapedProperty = propertyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const propertyRegex = new RegExp(
    `(^|;)\\s*${escapedProperty}\\s*:\\s*([\\s\\S]*?)(?=(?:;\\s*[-a-zA-Z]+\\s*:)|\\s*$)`,
    'i'
  );

  if (propertyRegex.test(styleValue)) {
    return styleValue
      .replace(propertyRegex, (_match, prefix) => `${prefix}${prefix ? ' ' : ''}${propertyName}: ${value}`)
      .trim()
      .replace(/\s*;?\s*$/, ';');
  }

  const trimmed = styleValue.trim();
  if (!trimmed) {
    return `${propertyName}: ${value};`;
  }
  return `${trimmed.replace(/\s*;?\s*$/, ';')} ${propertyName}: ${value};`;
}

function isTransparentPaint(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'none' || normalized === 'transparent') return true;
  if (/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(?:\.0+)?\s*\)$/.test(normalized)) return true;
  if (/^hsla\(\s*\d+(?:\.\d+)?(?:deg|rad|grad|turn)?\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*,\s*0(?:\.0+)?\s*\)$/.test(normalized)) return true;
  return false;
}

export function ensureOpaqueSvgBackground(svg: string, color: string): string {
  if (!color) return svg;

  let out = svg;
  out = out.replace(/<svg\b([^>]*?)style="([^"]*)"/i, (_m, attrs, style) => {
    let nextStyle = style;
    if (/background-color\s*:/i.test(nextStyle)) {
      nextStyle = nextStyle.replace(/background-color\s*:\s*[^;"]+;?/gi, `background-color: ${color};`);
    } else {
      const trimmed = nextStyle.trim();
      nextStyle = trimmed ? `${trimmed.replace(/\s*;?\s*$/, ';')} background-color: ${color};` : `background-color: ${color};`;
    }
    return `<svg${attrs}style="${nextStyle}"`;
  });

  if (!/<svg\b[^>]*\bstyle="/i.test(out)) {
    out = out.replace(/<svg\b([^>]*?)>/i, (_m, attrs) => `<svg${attrs} style="background-color: ${color};">`);
  }

  let patchedRect = false;
  out = out.replace(
    /<rect\b(?=[^>]*\bwidth="100%")(?=[^>]*\bheight="100%")([^>]*?)\bfill="([^"]+)"([^>]*)>/i,
    (match, before, fill, after) => {
      patchedRect = true;
      if (!isTransparentPaint(fill)) return match;
      return `<rect${before}fill="${color}"${after}>`;
    }
  );

  if (!patchedRect) {
    out = out.replace(/<svg\b([^>]*?)>/i, (_m, attrs) => `<svg${attrs}><rect width="100%" height="100%" fill="${color}"/>`);
  }

  return out;
}

export function forceTransparentSvgBackground(svg: string): string {
  let out = svg;

  out = out.replace(/<svg\b([^>]*?)style="([^"]*)"/i, (_m, attrs, style) => {
    let nextStyle = style;
    if (/background-color\s*:/i.test(nextStyle)) {
      nextStyle = nextStyle.replace(
        /background-color\s*:\s*[^;"]+;?/gi,
        'background-color: transparent;'
      );
    } else {
      const trimmed = nextStyle.trim();
      nextStyle = trimmed
        ? `${trimmed.replace(/\s*;?\s*$/, ';')} background-color: transparent;`
        : 'background-color: transparent;';
    }
    return `<svg${attrs}style="${nextStyle}"`;
  });

  out = out.replace(
    /<rect\b(?=[^>]*\bwidth="100%")(?=[^>]*\bheight="100%")([^>]*?)\bfill="(?:white|#fff(?:fff)?|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)|rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*1(?:\.0+)?\s*\))"/gi,
    '<rect$1fill="transparent"'
  );

  return out;
}

export function injectSvgStyles(svg: string, css: string): string {
  if (!css) return svg;
  const styleBlock = `<style><![CDATA[\n${css}\n]]></style>`;
  return svg.replace(/<svg\b([^>]*?)>/i, (_match, attrs) => `<svg${attrs}>${styleBlock}`);
}

export function buildEmbeddedFontCss(fontFamily: string, dataUri: string, format?: string): string {
  const safeFamily = fontFamily.replace(/"/g, "'");
  const safeFormat = format || 'woff2';
  return `@font-face {\n  font-family: "${safeFamily}";\n  src: url("${dataUri}") format("${safeFormat}");\n  font-weight: 400;\n  font-style: normal;\n  font-display: swap;\n}`;
}

export function injectFontFamily(svg: string, fontFamily: string): string {
  if (!fontFamily) return svg;
  const safeFontFamily = fontFamily.replace(/"/g, "'");
  let out = svg;
  out = out.replace(/style="([^"]*)"/gi, (_match, styleValue) => {
    const nextStyle = setStyleDeclaration(styleValue, 'font-family', safeFontFamily);
    return `style="${nextStyle}"`;
  });
  out = out.replace(/font-family="[^"]*"/gi, `font-family="${safeFontFamily}"`);
  out = injectSvgStyles(
    out,
    `text, tspan, foreignObject .nodeLabel, foreignObject .edgeLabel, foreignObject .labelBkg, foreignObject p, foreignObject span, foreignObject div { font-family: ${safeFontFamily} !important; }`
  );
  return out;
}

export function injectFontSize(svg: string, fontSize: number): string {
  if (!Number.isFinite(fontSize) || fontSize <= 0) return svg;
  const size = `${fontSize}px`;
  let out = svg;
  out = out.replace(/style="([^"]*)"/gi, (_match, styleValue) => {
    const nextStyle = setStyleDeclaration(styleValue, 'font-size', size);
    return `style="${nextStyle}"`;
  });
  out = out.replace(/font-size="[^"]*"/gi, `font-size="${size}"`);
  const css = `text, tspan { font-size: ${size} !important; }\nforeignObject, foreignObject * { font-size: ${size} !important; }\nforeignObject { overflow: visible; }\nforeignObject p, foreignObject .nodeLabel p, foreignObject .edgeLabel p, foreignObject .labelBkg p { margin: 0 !important; }`;
  return injectSvgStyles(out, css);
}

export function brightenDarkRoughStrokes(
  svg: string,
  options: { targetRgb?: string; maxDelta?: number; luminanceThreshold?: number } = {}
): string {
  const targetRgb = options.targetRgb ?? 'rgb(61, 68, 77)';
  const maxDelta = options.maxDelta ?? 8;
  const luminanceThreshold = options.luminanceThreshold ?? 60;
  return svg.replace(
    /\bstroke="rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)"/gi,
    (match, rText, gText, bText) => {
      const r = Number(rText);
      const g = Number(gText);
      const b = Number(bText);
      if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
        return match;
      }
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min > maxDelta) {
        return match;
      }
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (luminance >= luminanceThreshold) {
        return match;
      }
      return `stroke="${targetRgb}"`;
    }
  );
}

export function normalizeDarkRoughTextColors(
  svg: string,
  options: { targetRgb?: string } = {}
): string {
  const targetRgb = options.targetRgb ?? 'rgb(229, 231, 235)';
  const blackColor = '(?:black|#000(?:000)?|rgb\\(\\s*0\\s*,\\s*0\\s*,\\s*0\\s*\\))';
  const blackColorRegex = new RegExp(blackColor, 'gi');
  const textTagRegex = new RegExp(`<(text|tspan)\\b([^>]*?)\\bfill="${blackColor}"([^>]*)>`, 'gi');

  let out = svg;
  out = out.replace(/(?<![-\w])color\s*:\s*([^;"}]+)(;?)/gi, (match, value, suffix) => {
    if (!blackColorRegex.test(value.trim())) {
      blackColorRegex.lastIndex = 0;
      return match;
    }
    blackColorRegex.lastIndex = 0;
    return `color: ${targetRgb}${suffix}`;
  });
  out = out.replace(textTagRegex, `<$1$2fill="${targetRgb}"$3>`);
  out = injectSvgStyles(
    out,
    `text, tspan, foreignObject *, .nodeLabel, .edgeLabel { color: ${targetRgb} !important; fill: ${targetRgb} !important; }`
  );

  return out;
}

export function neutralizeLightThemePalette(
  svg: string,
  options: { borderRgb?: string; fillRgb?: string } = {}
): string {
  const borderRgb = options.borderRgb ?? 'rgb(156, 163, 175)';
  const fillRgb = options.fillRgb ?? 'rgb(229, 231, 235)';

  return svg
    .replace(/rgb\(\s*147\s*,\s*112\s*,\s*219\s*\)/gi, borderRgb)
    .replace(/rgb\(\s*236\s*,\s*236\s*,\s*255\s*\)/gi, fillRgb)
    .replace(/#9370db/gi, borderRgb)
    .replace(/#ececff/gi, fillRgb);
}

export function softenLightHachureStrokes(
  svg: string,
  options: { minStrokeWidth?: number; widthScale?: number; opacity?: number } = {}
): string {
  const minStrokeWidth = options.minStrokeWidth ?? 1.25;
  const widthScale = options.widthScale ?? 0.35;
  const opacity = options.opacity ?? 0.35;

  return svg.replace(/<path\b[^>]*>/gi, (match) => {
    if (!/fill="none"/i.test(match)) return match;
    const widthMatch = match.match(/stroke-width="([0-9.]+)"/i);
    if (!widthMatch) return match;
    const width = Number.parseFloat(widthMatch[1]);
    if (!Number.isFinite(width) || width < minStrokeWidth) return match;

    const nextWidth = Math.max(0.5, width * widthScale);
    let next = match.replace(/stroke-width="[^"]+"/i, `stroke-width="${nextWidth.toFixed(3).replace(/\.?0+$/, '')}"`);

    if (/stroke-opacity="/i.test(next)) {
      next = next.replace(/stroke-opacity="[^"]+"/i, `stroke-opacity="${opacity}"`);
    } else {
      next = next.replace(/<path\b/i, `<path stroke-opacity="${opacity}"`);
    }

    return next;
  });
}

export function sanitizeSvgEntities(svg: string): string {
  if (!svg.includes('&nbsp;')) return svg;
  return svg.replace(/&nbsp;/g, '&#160;');
}

export function sanitizeSvgXmlCompatibility(svg: string): string {
  let out = svg;

  if (/\bxlink:href=/i.test(out) && !/\bxmlns:xlink=/.test(out)) {
    out = out.replace(
      /<svg\b([^>]*?)>/i,
      (_match, attrs) => `<svg${attrs} xmlns:xlink="http://www.w3.org/1999/xlink">`
    );
  }

  // Mermaid can emit XHTML <br> inside foreignObject labels; XML parsing requires <br/>.
  out = out.replace(/<br(\s[^<>]*?)?>/gi, (match, attrs = '') => {
    if (/\/>$/.test(match)) return match;
    return `<br${attrs}/>`;
  });

  return out;
}

export function guessFontFormat(fontPath: string): string {
  const lower = fontPath.toLowerCase();
  if (lower.endsWith('.woff2')) return 'woff2';
  if (lower.endsWith('.woff')) return 'woff';
  if (lower.endsWith('.ttf')) return 'truetype';
  return 'woff2';
}

export function guessFontMime(fontPath: string): string {
  const lower = fontPath.toLowerCase();
  if (lower.endsWith('.woff2')) return 'font/woff2';
  if (lower.endsWith('.woff')) return 'font/woff';
  if (lower.endsWith('.ttf')) return 'font/ttf';
  return 'application/octet-stream';
}

function roundTo(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function normalizeSvgViewport(svg: string, viewport?: SvgViewport | null): string {
  if (!viewport) return svg;

  const minX = roundTo(viewport.minX);
  const minY = roundTo(viewport.minY);
  const width = Math.max(1, roundTo(viewport.width));
  const height = Math.max(1, roundTo(viewport.height));
  const viewBox = `${minX} ${minY} ${width} ${height}`;

  return svg.replace(/<svg\b([^>]*?)>/i, (_match, attrs) => {
    let nextAttrs = attrs;
    nextAttrs = nextAttrs.replace(/\sviewBox="[^"]*"/i, '');
    nextAttrs = nextAttrs.replace(/\swidth="[^"]*"/i, '');
    nextAttrs = nextAttrs.replace(/\sheight="[^"]*"/i, '');
    return `<svg${nextAttrs} viewBox="${viewBox}" width="${Math.ceil(width)}" height="${Math.ceil(height)}">`;
  });
}
