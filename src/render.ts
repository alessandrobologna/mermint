import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Browser, BrowserContext, chromium, Page } from 'playwright';
import { UserFacingError } from './errors.js';
import { serializeState, toEditUrl } from './state.js';
import {
  buildEmbeddedFontCss,
  brightenDarkRoughStrokes,
  ensureOpaqueSvgBackground,
  forceTransparentSvgBackground,
  guessFontFormat,
  guessFontMime,
  injectFontFamily,
  injectFontSize,
  injectSvgStyles,
  normalizeDarkRoughTextColors,
  neutralizeLightThemePalette,
  softenLightHachureStrokes,
  normalizeSvgViewport,
  sanitizeSvgXmlCompatibility,
  sanitizeSvgEntities,
  type SvgViewport
} from './svg.js';
import {
  extractConfiguredFontFamilyFromInput,
  extractConfiguredIconPacksFromInput,
  extractConfiguredRoughOptionsFromInput,
  stripHandDrawnLookFromInput
} from './mermaid-input.js';
import { ROUGH_FILL_STYLES } from './types.js';
import type { IconPackSource, RenderOptions, RenderResult, RoughOptions, StepHandle, Ui } from './types.js';

const require = createRequire(import.meta.url);

const GITHUB_LIKE_MERMAID_INIT: Record<string, unknown> = {
  startOnLoad: false,
  securityLevel: 'antiscript',
  secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize'],
  flowchart: { diagramPadding: 48 },
  gantt: { useWidth: 1200 },
  pie: { useWidth: 1200 },
  sequence: { diagramMarginY: 40 }
};

const DEFAULT_BROWSER_VIEWPORT = { width: 1200, height: 900 };
const DEFAULT_HAND_DRAWN_ROUGHNESS = 0.5;
const DEFAULT_HAND_DRAWN_FONT_FAMILY_WITHOUT_EMBED =
  'virgil, excalifont, segoe print, bradley hand, chalkboard se, marker felt, comic sans ms, cursive';
const ROUGH_FILL_STYLE_VALUES = new Set<string>(ROUGH_FILL_STYLES);
const BUILT_IN_AWS_ICON_PACK_NAME = 'aws';

const silentUi: Ui = {
  header: () => undefined,
  step: () => ({ succeed: () => undefined, fail: () => undefined }),
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  success: () => undefined,
  detail: () => undefined
};

export interface RenderRuntime {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  timeoutMs: number;
}

interface ResolvedIconPack {
  name: string;
  icons: Record<string, unknown>;
}

const iconPackCache = new Map<string, Promise<ResolvedIconPack>>();

async function runStep<T>(step: StepHandle, action: () => Promise<T>, successMessage?: string): Promise<T> {
  try {
    const result = await action();
    step.succeed(successMessage);
    return result;
  } catch (error) {
    step.fail();
    throw error;
  }
}

function pickExplicitRoughOptions(options: Partial<RoughOptions>): RoughOptions {
  const picked: RoughOptions = {};
  if (Number.isFinite(options.roughness)) picked.roughness = Number(options.roughness);
  if (Number.isFinite(options.fillWeight)) picked.fillWeight = Number(options.fillWeight);
  if (typeof options.fillStyle === 'string' && options.fillStyle.trim()) {
    picked.fillStyle = options.fillStyle.trim().toLowerCase() as RoughOptions['fillStyle'];
  }
  if (Number.isFinite(options.hachureGap)) picked.hachureGap = Number(options.hachureGap);
  if (Number.isFinite(options.hachureAngle)) picked.hachureAngle = Number(options.hachureAngle);
  if (Number.isFinite(options.bowing)) picked.bowing = Number(options.bowing);
  if (Number.isFinite(options.strokeWidth)) picked.strokeWidth = Number(options.strokeWidth);
  if (Number.isSafeInteger(options.seed)) picked.seed = Number(options.seed);
  if (typeof options.disableMultiStroke === 'boolean') picked.disableMultiStroke = options.disableMultiStroke;
  if (typeof options.disableMultiStrokeFill === 'boolean') picked.disableMultiStrokeFill = options.disableMultiStrokeFill;
  if (typeof options.preserveVertices === 'boolean') picked.preserveVertices = options.preserveVertices;
  return picked;
}

function hasExplicitRoughOptions(options: Partial<RoughOptions>): boolean {
  return Object.keys(pickExplicitRoughOptions(options)).length > 0;
}

function mergeRoughOptions(base: RoughOptions, override: RoughOptions): RoughOptions {
  return {
    ...base,
    ...pickExplicitRoughOptions(override)
  };
}

function validateRoughOptions(options: Partial<RoughOptions>): void {
  if (options.roughness !== undefined) {
    if (!Number.isFinite(options.roughness) || options.roughness < 0) {
      throw new UserFacingError('--roughness must be a non-negative number');
    }
  }
  if (options.fillWeight !== undefined) {
    if (!Number.isFinite(options.fillWeight) || options.fillWeight < 0) {
      throw new UserFacingError('--fill-weight must be a non-negative number');
    }
  }
  if (options.fillStyle !== undefined) {
    const normalized = options.fillStyle.trim().toLowerCase();
    if (!ROUGH_FILL_STYLE_VALUES.has(normalized)) {
      throw new UserFacingError(`--fill-style must be one of: ${ROUGH_FILL_STYLES.join(', ')}`);
    }
  }
  if (options.hachureGap !== undefined) {
    if (!Number.isFinite(options.hachureGap)) {
      throw new UserFacingError('--hachure-gap must be a valid number');
    }
  }
  if (options.hachureAngle !== undefined) {
    if (!Number.isFinite(options.hachureAngle)) {
      throw new UserFacingError('--hachure-angle must be a valid number');
    }
  }
  if (options.bowing !== undefined) {
    if (!Number.isFinite(options.bowing)) {
      throw new UserFacingError('--bowing must be a valid number');
    }
  }
  if (options.strokeWidth !== undefined) {
    if (!Number.isFinite(options.strokeWidth) || options.strokeWidth < 0) {
      throw new UserFacingError('--stroke-width must be a non-negative number');
    }
  }
  if (options.seed !== undefined) {
    if (!Number.isSafeInteger(options.seed)) {
      throw new UserFacingError('--seed must be an integer');
    }
  }
  if (options.disableMultiStroke !== undefined) {
    if (typeof options.disableMultiStroke !== 'boolean') {
      throw new UserFacingError('--multi-stroke must be a boolean');
    }
  }
  if (options.disableMultiStrokeFill !== undefined) {
    if (typeof options.disableMultiStrokeFill !== 'boolean') {
      throw new UserFacingError('--multi-stroke-fill must be a boolean');
    }
  }
  if (options.preserveVertices !== undefined) {
    if (typeof options.preserveVertices !== 'boolean') {
      throw new UserFacingError('--preserve-vertices must be a boolean');
    }
  }
}

async function measureSvgViewportForSvg(page: Page, svg: string, padding = 24): Promise<SvgViewport | null> {
  return page.evaluate(
    ({ svg, padding }) => {
      const container = document.getElementById('container');
      if (!container) return null;
      container.innerHTML = svg;
      const svgEl = container.querySelector('svg') as SVGSVGElement | null;
      if (!svgEl) return null;

      const viewport = (svgEl.querySelector('.svg-pan-zoom_viewport') as SVGGraphicsElement | null) || svgEl;
      const bbox = viewport.getBBox();
      const minX = bbox.x - padding;
      const minY = bbox.y - padding;
      const maxX = bbox.x + bbox.width + padding;
      const maxY = bbox.y + bbox.height + padding;

      if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
        return null;
      }

      return {
        minX,
        minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY)
      };
    },
    { svg, padding }
  );
}

function buildState(code: string, options: RenderOptions): { code: string; grid: boolean; mermaid: string; panZoom: boolean; rough: boolean; updateDiagram: boolean } {
  const mermaidConfig: Record<string, unknown> = { theme: options.theme };
  if (options.look) {
    mermaidConfig.look = options.look;
  }
  if (options.fontFamily) {
    mermaidConfig.fontFamily = options.fontFamily;
  }
  const rough = hasExplicitRoughOptions(options) ? false : options.rough;
  return {
    code,
    grid: true,
    mermaid: JSON.stringify(mermaidConfig),
    panZoom: true,
    rough,
    updateDiagram: true
  };
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function normalizeIconPackCacheKey(spec: IconPackSource): string {
  const source = spec.source.trim();
  const resolvedSource = isHttpUrl(source) ? source : resolve(source);
  const name = spec.name?.trim().toLowerCase() ?? '';
  return `${name}::${resolvedSource}`;
}

function resolveInputIconPackSources(
  iconPacks: IconPackSource[],
  inputPath: string,
  iconPackBaseDir?: string
): IconPackSource[] {
  const inputDir = iconPackBaseDir ? resolve(iconPackBaseDir) : dirname(inputPath);
  return iconPacks.map((pack) => {
    const source = pack.source.trim();
    if (!source) return pack;
    if (isHttpUrl(source) || isAbsolute(source) || /^[A-Za-z]:[\\/]/.test(source)) {
      return { ...pack, source };
    }
    return {
      ...pack,
      source: resolve(inputDir, source)
    };
  });
}

function mergeConfiguredAndCliIconPacks(
  configuredIconPacks: IconPackSource[],
  cliIconPacks: IconPackSource[] | undefined
): IconPackSource[] | undefined {
  if (configuredIconPacks.length === 0) {
    return cliIconPacks && cliIconPacks.length > 0 ? cliIconPacks : undefined;
  }
  if (!cliIconPacks || cliIconPacks.length === 0) {
    return configuredIconPacks;
  }

  const cliNames = new Set(
    cliIconPacks
      .map((pack) => pack.name?.trim().toLowerCase())
      .filter((name): name is string => Boolean(name))
  );

  const filteredConfigured = configuredIconPacks.filter((pack) => {
    const configuredName = pack.name?.trim().toLowerCase();
    return !configuredName || !cliNames.has(configuredName);
  });

  return [...filteredConfigured, ...cliIconPacks];
}

function parseIconPackJson(
  text: string,
  spec: IconPackSource
): { name: string; icons: Record<string, unknown> } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new UserFacingError(`Invalid icon pack JSON: ${spec.source}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new UserFacingError(`Invalid icon pack format: ${spec.source}`);
  }

  const iconifyJson = parsed as Record<string, unknown>;
  if (!iconifyJson.icons || typeof iconifyJson.icons !== 'object' || Array.isArray(iconifyJson.icons)) {
    throw new UserFacingError(`Invalid icon pack format: ${spec.source} (expected Iconify JSON with an "icons" object)`);
  }
  const configuredName = spec.name?.trim();
  const prefix = typeof iconifyJson.prefix === 'string' ? iconifyJson.prefix.trim() : '';
  const name = configuredName || prefix;

  if (!name) {
    throw new UserFacingError(
      `Icon pack name is required for ${spec.source} (provide name=source or include "prefix" in JSON).`
    );
  }

  return {
    name,
    icons: iconifyJson
  };
}

async function loadIconPack(spec: IconPackSource): Promise<ResolvedIconPack> {
  const source = spec.source.trim();
  if (!source) {
    throw new UserFacingError('Icon pack source cannot be empty');
  }

  if (isHttpUrl(source)) {
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(source);
    } catch (error) {
      throw new UserFacingError(`Unable to fetch icon pack: ${source} (${String(error)})`);
    }
    if (!response.ok) {
      throw new UserFacingError(`Unable to fetch icon pack: ${source} (HTTP ${response.status})`);
    }
    const body = await response.text();
    return parseIconPackJson(body, spec);
  }

  const resolvedPath = resolve(source);
  try {
    const body = await readFile(resolvedPath, 'utf8');
    return parseIconPackJson(body, spec);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      throw new UserFacingError(`Icon pack file not found: ${resolvedPath}`);
    }
    throw error;
  }
}

async function resolveIconPacks(iconPackSources: IconPackSource[] | undefined, ui: Ui): Promise<ResolvedIconPack[]> {
  if (!iconPackSources || iconPackSources.length === 0) return [];

  const step = ui.step('Load icon packs');
  return runStep(step, async () => {
    const resolved = await Promise.all(
      iconPackSources.map((spec) => {
        const cacheKey = normalizeIconPackCacheKey(spec);
        const cached = iconPackCache.get(cacheKey);
        if (cached) return cached;
        const next = loadIconPack(spec).catch((error) => {
          iconPackCache.delete(cacheKey);
          throw error;
        });
        iconPackCache.set(cacheKey, next);
        return next;
      })
    );

    const names = new Set<string>();
    for (const pack of resolved) {
      const key = pack.name.toLowerCase();
      if (names.has(key)) {
        throw new UserFacingError(`Duplicate icon pack name: ${pack.name}`);
      }
      names.add(key);
      ui.detail(`Loaded icon pack "${pack.name}"`);
    }

    return resolved;
  }, iconPackSources.length === 1 ? 'Loaded 1 icon pack' : `Loaded ${iconPackSources.length} icon packs`);
}

async function ensureReadable(path: string, label: string): Promise<void> {
  try {
    await access(path);
  } catch {
    throw new UserFacingError(`${label} not found: ${path}`);
  }
}

function bundledExcalifontPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '../assets/fonts/Excalifont-Regular.woff2');
}

function bundledAwsIconPackPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '../assets/icon-packs/aws-architecture-service-icons.json');
}

function builtInIconPacks(): IconPackSource[] {
  return [
    {
      name: BUILT_IN_AWS_ICON_PACK_NAME,
      source: bundledAwsIconPackPath()
    }
  ];
}

function validateOptions(options: RenderOptions): void {
  if (!options.input) throw new UserFacingError('Input path is required');
  if (!options.output) throw new UserFacingError('Output path is required');
  if (!Number.isFinite(options.settleMs) || options.settleMs < 0) {
    throw new UserFacingError('--settle-ms must be a non-negative number');
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1000) {
    throw new UserFacingError('--timeout-ms must be >= 1000');
  }
  if (options.fontSize !== undefined) {
    if (!Number.isFinite(options.fontSize) || options.fontSize <= 0) {
      throw new UserFacingError('--font-size must be a positive number');
    }
  }
  if (options.embedFontPath && !options.embedFontFamily) {
    throw new UserFacingError('--embed-font-family is required when using --embed-font');
  }
  validateRoughOptions(options);
  if (options.iconPacks !== undefined) {
    if (!Array.isArray(options.iconPacks)) {
      throw new UserFacingError('--icon-pack must be provided as a list');
    }
    for (const pack of options.iconPacks) {
      if (!pack || typeof pack !== 'object' || typeof pack.source !== 'string' || !pack.source.trim()) {
        throw new UserFacingError('Each icon pack must include a non-empty source');
      }
    }
  }
}

function resolveSvg2roughjsUmdPath(): string {
  return require.resolve('svg2roughjs/dist/svg2roughjs.umd.js');
}

function resolveMermaidPath(): string {
  const candidates = [
    'mermaid/dist/mermaid.min.js',
    'mermaid/dist/mermaid.js',
    'mermaid/dist/mermaid.esm.min.mjs'
  ];
  for (const candidate of candidates) {
    try {
      return require.resolve(candidate);
    } catch {
      // try next
    }
  }
  throw new UserFacingError('Unable to resolve Mermaid runtime script');
}

async function ensureMermaid(page: Page): Promise<void> {
  const hasMermaid = await page.evaluate(() => Boolean((globalThis as typeof globalThis & { mermaid?: unknown }).mermaid));
  if (hasMermaid) return;
  const scriptPath = resolveMermaidPath();
  const isModule = scriptPath.endsWith('.mjs');
  await page.addScriptTag({ path: scriptPath, type: isModule ? 'module' : undefined });
  await page.waitForFunction(() => Boolean((globalThis as typeof globalThis & { mermaid?: unknown }).mermaid));
}

async function ensureSvg2roughjs(page: Page): Promise<void> {
  const hasLib = await page.evaluate(() => Boolean((globalThis as typeof globalThis & { svg2roughjs?: unknown }).svg2roughjs));
  if (hasLib) return;
  await page.addScriptTag({ path: resolveSvg2roughjsUmdPath() });
  await page.waitForFunction(() => Boolean((globalThis as typeof globalThis & { svg2roughjs?: unknown }).svg2roughjs));
}

function isTransparentColor(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'none' || normalized === 'transparent') return true;
  if (/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(?:\.0+)?\s*\)$/.test(normalized)) return true;
  if (/^hsla\(\s*\d+(?:\.\d+)?(?:deg|rad|grad|turn)?\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*,\s*0(?:\.0+)?\s*\)$/.test(normalized)) return true;
  return false;
}

export function extractSvgBackgroundColor(svg: string): string | undefined {
  const styleMatch = svg.match(/<svg\b[^>]*\bstyle="[^"]*\bbackground-color\s*:\s*([^;"]+)/i);
  const styleColor = styleMatch?.[1]?.trim();
  if (styleColor && !isTransparentColor(styleColor)) {
    return styleColor;
  }

  const rectMatch = svg.match(
    /<rect\b(?=[^>]*\bwidth="100%")(?=[^>]*\bheight="100%")[^>]*\bfill="([^"]+)"/i
  );
  const rectColor = rectMatch?.[1]?.trim();
  if (rectColor && !isTransparentColor(rectColor)) {
    return rectColor;
  }

  return undefined;
}

function fallbackThemeBackgroundColor(theme: string): string {
  return isDarkThemeName(theme) ? '#1f2020' : '#ffffff';
}

function isDarkThemeName(theme: string): boolean {
  return theme.trim().toLowerCase() === 'dark';
}

export function resolveRoughBackgroundColor(options: {
  svg: string;
  transparentBg: boolean;
  theme: string;
}): string | null {
  if (options.transparentBg) return null;
  return extractSvgBackgroundColor(options.svg) ?? fallbackThemeBackgroundColor(options.theme);
}

async function roughenSvgInPage(
  page: Page,
  svg: string,
  roughOptions: RoughOptions & { roughness: number },
  fontFamily: string | null,
  backgroundColor: string | null
): Promise<string> {
  await ensureSvg2roughjs(page);
  const result = await page.evaluate(
    async ({ svg, roughOptions, fontFamily, backgroundColor }) => {
      const lib = (globalThis as typeof globalThis & { svg2roughjs?: any }).svg2roughjs;
      if (!lib?.Svg2Roughjs || !lib?.OutputType) return null;
      const parser = new DOMParser();
      const parsed = parser.parseFromString(svg, 'image/svg+xml');
      const parsedSvg = parsed.documentElement;
      if (!parsedSvg || parsedSvg.nodeName.toLowerCase() !== 'svg') return null;

      const output = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      output.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-99999px';
      container.style.top = '-99999px';
      container.style.width = '0';
      container.style.height = '0';
      container.style.overflow = 'hidden';
      container.style.pointerEvents = 'none';

      const stagedSvg = document.importNode(parsedSvg, true);
      container.appendChild(stagedSvg);
      document.body.appendChild(container);

      try {
        const roughConfig: Record<string, unknown> = {
          roughness: roughOptions.roughness
        };
        if (Number.isFinite(roughOptions.fillWeight)) roughConfig.fillWeight = roughOptions.fillWeight;
        if (typeof roughOptions.fillStyle === 'string' && roughOptions.fillStyle) roughConfig.fillStyle = roughOptions.fillStyle;
        if (Number.isFinite(roughOptions.hachureGap)) roughConfig.hachureGap = roughOptions.hachureGap;
        if (Number.isFinite(roughOptions.hachureAngle)) roughConfig.hachureAngle = roughOptions.hachureAngle;
        if (Number.isFinite(roughOptions.bowing)) roughConfig.bowing = roughOptions.bowing;
        if (Number.isFinite(roughOptions.strokeWidth)) roughConfig.strokeWidth = roughOptions.strokeWidth;
        if (Number.isSafeInteger(roughOptions.seed)) roughConfig.seed = roughOptions.seed;
        if (typeof roughOptions.disableMultiStroke === 'boolean') roughConfig.disableMultiStroke = roughOptions.disableMultiStroke;
        if (typeof roughOptions.disableMultiStrokeFill === 'boolean')
          roughConfig.disableMultiStrokeFill = roughOptions.disableMultiStrokeFill;
        if (typeof roughOptions.preserveVertices === 'boolean') roughConfig.preserveVertices = roughOptions.preserveVertices;

        const converter = new lib.Svg2Roughjs(output, lib.OutputType.SVG, roughConfig);
        if (Number.isSafeInteger(roughOptions.seed)) {
          converter.seed = roughOptions.seed;
        }
        if (
          Number.isFinite(roughOptions.fillWeight) ||
          Number.isFinite(roughOptions.hachureGap) ||
          Number.isFinite(roughOptions.hachureAngle)
        ) {
          // svg2roughjs randomization rewrites per-element fillWeight/hachure values; disable it so configured values are preserved.
          converter.randomize = false;
        }
        converter.svg = stagedSvg;
        converter.backgroundColor = backgroundColor;
        converter.fontFamily = fontFamily === null ? null : fontFamily;

        const sketch = await converter.sketch(true);
        if (!sketch) return null;
        return new XMLSerializer().serializeToString(sketch);
      } finally {
        container.remove();
      }
    },
    { svg, roughOptions, fontFamily, backgroundColor }
  );

  if (!result) {
    throw new Error('Roughness post-processing failed');
  }
  return result;
}

async function renderMermaidSvg(
  page: Page,
  code: string,
  mermaidConfig: Record<string, unknown>,
  padding: number,
  iconPacks: ResolvedIconPack[]
): Promise<{ svg: string; viewport: SvgViewport | null }> {
  await ensureMermaid(page);

  const result = await page.evaluate(
    async ({ code, mermaidConfig, padding, githubInitConfig, iconPacks }) => {
      const mermaid = (globalThis as typeof globalThis & { mermaid?: any }).mermaid;
      if (!mermaid) {
        throw new Error('Mermaid runtime not available');
      }

      if (iconPacks.length > 0) {
        if (typeof mermaid.registerIconPacks !== 'function') {
          throw new Error('Mermaid runtime does not support icon pack registration');
        }
        const globalState = globalThis as typeof globalThis & {
          __mermaidGhPressIconPacks?: Record<string, boolean>;
        };
        const registered = globalState.__mermaidGhPressIconPacks ?? {};

        for (const pack of iconPacks) {
          if (registered[pack.name]) continue;
          mermaid.registerIconPacks([{ name: pack.name, icons: pack.icons }]);
          registered[pack.name] = true;
        }

        globalState.__mermaidGhPressIconPacks = registered;
      }

      mermaid.initialize({ ...githubInitConfig, ...mermaidConfig });

      const renderId = `m-${Math.random().toString(36).slice(2)}`;
      const { svg } = await mermaid.render(renderId, code);

      const container = document.getElementById('container');
      if (!container) {
        throw new Error('Render container missing');
      }
      container.innerHTML = svg;

      const svgEl = container.querySelector('svg') as SVGSVGElement | null;
      if (!svgEl) {
        throw new Error('Mermaid did not produce SVG');
      }

      svgEl.setAttribute('preserveAspectRatio', 'xMinYMin');
      if (!svgEl.getAttribute('height')) {
        const viewBox = svgEl.getAttribute('viewBox');
        if (viewBox) {
          const parts = viewBox.trim().split(/\s+/).map(Number);
          if (parts.length === 4 && Number.isFinite(parts[3]) && parts[3] > 0) {
            svgEl.setAttribute('height', String(parts[3]));
          }
        }
      }

      const viewportEl = (svgEl.querySelector('.svg-pan-zoom_viewport') as SVGGraphicsElement | null) || svgEl;
      const bbox = viewportEl.getBBox();
      let viewport: SvgViewport | null = null;
      const minX = bbox.x - padding;
      const minY = bbox.y - padding;
      const maxX = bbox.x + bbox.width + padding;
      const maxY = bbox.y + bbox.height + padding;

      if ([minX, minY, maxX, maxY].every(Number.isFinite)) {
        viewport = {
          minX,
          minY,
          width: Math.max(1, maxX - minX),
          height: Math.max(1, maxY - minY)
        };
      }

      return { svg: svgEl.outerHTML, viewport };
    },
    { code, mermaidConfig, padding, githubInitConfig: GITHUB_LIKE_MERMAID_INIT, iconPacks }
  );

  return result;
}

export function fontFamilyIncludesExcalifont(fontFamily?: string): boolean {
  if (!fontFamily) return false;
  return fontFamily
    .split(',')
    .map((part) => part.trim().replace(/^['"]|['"]$/g, '').toLowerCase())
    .some((family) => family === 'excalifont');
}

export function validateNoEmbedExcalifontOption(options: {
  embedExcalifont?: boolean;
  usesHandDrawnPipeline: boolean;
  fontFamily?: string;
}): void {
  if (options.embedExcalifont !== false) return;
  const excalifontActive = options.usesHandDrawnPipeline || fontFamilyIncludesExcalifont(options.fontFamily);
  if (!excalifontActive) {
    throw new UserFacingError('--no-embed-excalifont requires Excalifont to be active (hand-drawn pipeline or --font-family includes Excalifont).');
  }
}

export async function createRenderRuntime(options: Pick<RenderOptions, 'headed' | 'timeoutMs'>): Promise<RenderRuntime> {
  const browser = await chromium.launch({ headless: !options.headed });
  const context = await browser.newContext({ viewport: DEFAULT_BROWSER_VIEWPORT });
  const page = await context.newPage();
  page.setDefaultTimeout(options.timeoutMs);
  await page.setContent('<!doctype html><html><head></head><body><div id="container"></div></body></html>');
  return {
    browser,
    context,
    page,
    timeoutMs: options.timeoutMs
  };
}

export async function disposeRenderRuntime(runtime: RenderRuntime): Promise<void> {
  await runtime.browser.close();
}

async function renderMermaidLiveWithRuntimeInternal(
  options: RenderOptions,
  runtime: RenderRuntime,
  ui: Ui
): Promise<RenderResult> {
  const inputPath = resolve(options.input);
  const outputPath = resolve(options.output);

  await ensureReadable(inputPath, 'Input file');
  await mkdir(dirname(outputPath), { recursive: true });

  const readStep = ui.step('Read diagram', options.input);
  const code = await runStep(readStep, () => readFile(inputPath, 'utf8'));

  const resolvedOptions: RenderOptions = { ...options };
  const resolvedLook = resolvedOptions.look?.trim();
  const resolvedLookLower = resolvedLook?.toLowerCase();
  const normalizedHandDrawnInput = stripHandDrawnLookFromInput(code);
  const configuredFontFamily = extractConfiguredFontFamilyFromInput(code);
  const configuredIconPacks = resolveInputIconPackSources(
    extractConfiguredIconPacksFromInput(code),
    inputPath,
    resolvedOptions.iconPackBaseDir
  );
  const configuredRough = extractConfiguredRoughOptionsFromInput(code);
  const usesBuiltInAwsIconPack = /\baws:/i.test(code);
  const builtInIconPackSources = usesBuiltInAwsIconPack ? builtInIconPacks() : [];
  const configuredAndBuiltInIconPacks = mergeConfiguredAndCliIconPacks(builtInIconPackSources, configuredIconPacks);
  const mergedIconPacks = mergeConfiguredAndCliIconPacks(configuredAndBuiltInIconPacks ?? [], resolvedOptions.iconPacks);

  if (configuredRough.invalidEntries.length > 0) {
    const details = configuredRough.invalidEntries
      .map((entry) => `${entry.key}=${entry.value}`)
      .join(', ');
    throw new UserFacingError(`Invalid x-mermint.rough value(s): ${details}`);
  }
  for (const unknownKey of configuredRough.unknownKeys) {
    ui.detail(`Ignored unsupported x-mermint.rough option: ${unknownKey}`);
  }

  const cliRoughOptions = pickExplicitRoughOptions(resolvedOptions);
  const sourceRoughOptions = pickExplicitRoughOptions(configuredRough.options);
  if (resolvedLookLower === 'classic' && (hasExplicitRoughOptions(cliRoughOptions) || hasExplicitRoughOptions(sourceRoughOptions))) {
    throw new UserFacingError('Rough options cannot be used with --look classic');
  }

  const explicitHandDrawnPipeline = hasExplicitRoughOptions(cliRoughOptions) || hasExplicitRoughOptions(sourceRoughOptions) || resolvedOptions.rough;
  const lookRequestsHandDrawn = resolvedLookLower === 'handdrawn';
  const inputRequestsHandDrawn = normalizedHandDrawnInput.stripped;
  const usesHandDrawnPipeline =
    explicitHandDrawnPipeline ||
    lookRequestsHandDrawn ||
    (inputRequestsHandDrawn && resolvedLookLower !== 'classic');
  const effectiveRoughOptions = usesHandDrawnPipeline
    ? mergeRoughOptions(sourceRoughOptions, cliRoughOptions)
    : {};
  if (usesHandDrawnPipeline && effectiveRoughOptions.roughness === undefined) {
    effectiveRoughOptions.roughness = DEFAULT_HAND_DRAWN_ROUGHNESS;
  }
  validateRoughOptions(effectiveRoughOptions);
  const shouldStripHandDrawnLook = usesHandDrawnPipeline || resolvedLookLower === 'classic';
  const normalizedInput = shouldStripHandDrawnLook
    ? normalizedHandDrawnInput
    : { code, stripped: false };

  if (resolvedOptions.embedFontPath && !resolvedOptions.fontFamily) {
    resolvedOptions.fontFamily = resolvedOptions.embedFontFamily;
  }

  if (!resolvedOptions.fontFamily && configuredFontFamily) {
    resolvedOptions.fontFamily = configuredFontFamily;
  }

  if (usesHandDrawnPipeline && !resolvedOptions.fontFamily) {
    resolvedOptions.fontFamily =
      resolvedOptions.embedExcalifont === false
        ? DEFAULT_HAND_DRAWN_FONT_FAMILY_WITHOUT_EMBED
        : 'Excalifont';
  }

  validateNoEmbedExcalifontOption({
    embedExcalifont: resolvedOptions.embedExcalifont,
    usesHandDrawnPipeline,
    fontFamily: resolvedOptions.fontFamily
  });

  if (
    !resolvedOptions.embedFontPath &&
    resolvedOptions.embedExcalifont !== false &&
    fontFamilyIncludesExcalifont(resolvedOptions.fontFamily)
  ) {
    resolvedOptions.embedFontPath = bundledExcalifontPath();
    resolvedOptions.embedFontFamily = resolvedOptions.embedFontFamily || 'Excalifont';
  }

  if (resolvedOptions.embedFontPath) {
    await ensureReadable(resolvedOptions.embedFontPath, 'Embed font file');
  }

  const resolvedIconPacks = await resolveIconPacks(mergedIconPacks, ui);

  if (normalizedInput.stripped) {
    if (usesHandDrawnPipeline) {
      ui.detail('Detected look: handDrawn in diagram config; normalized to classic before Rough.js post-processing.');
    } else {
      ui.detail('Detected look: handDrawn in diagram config; normalized to classic due to --look classic.');
    }
  }

  const state = buildState(code, resolvedOptions);
  const hash = serializeState(state);
  const editUrl = toEditUrl(resolvedOptions.baseUrl, hash);

  ui.detail(`Edit URL: ${editUrl}`);

  const browserStep = ui.step('Render Mermaid');
  await runStep(browserStep, async () => {
    if (runtime.timeoutMs !== resolvedOptions.timeoutMs) {
      runtime.page.setDefaultTimeout(resolvedOptions.timeoutMs);
      runtime.timeoutMs = resolvedOptions.timeoutMs;
    }

    const mermaidConfig: Record<string, unknown> = { theme: resolvedOptions.theme };
    const effectiveLook = usesHandDrawnPipeline ? 'classic' : resolvedLook;
    if (effectiveLook) {
      mermaidConfig.look = effectiveLook;
    }
    if (resolvedOptions.fontFamily) {
      mermaidConfig.fontFamily = resolvedOptions.fontFamily;
    }

    const renderStep = ui.step('Generate SVG');
    const { svg: initialSvg } = await runStep(renderStep, () =>
      renderMermaidSvg(runtime.page, normalizedInput.code, mermaidConfig, 24, resolvedIconPacks)
    );

    await runtime.page.waitForTimeout(resolvedOptions.settleMs);

    const patchStep = ui.step('Post-process SVG');
    await runStep(patchStep, async () => {
      let patched = sanitizeSvgEntities(initialSvg);
      patched = sanitizeSvgXmlCompatibility(patched);
      const requestedOpaqueBackgroundColor = resolvedOptions.transparentBg
        ? null
        : resolveRoughBackgroundColor({
            svg: patched,
            transparentBg: false,
            theme: resolvedOptions.theme
          });

      let didRoughen = false;
      if (effectiveRoughOptions.roughness !== undefined) {
        try {
          const roughOptionsForRender: RoughOptions & { roughness: number } = {
            ...effectiveRoughOptions,
            roughness: effectiveRoughOptions.roughness
          };
          patched = await roughenSvgInPage(
            runtime.page,
            patched,
            roughOptionsForRender,
            resolvedOptions.fontFamily ?? null,
            requestedOpaqueBackgroundColor
          );
          didRoughen = true;
        } catch (error) {
          ui.warn('Rough post-processing failed; using clean SVG instead.', String(error));
        }
      }

      const usesRough = didRoughen;
      if (usesRough && isDarkThemeName(resolvedOptions.theme)) {
        patched = brightenDarkRoughStrokes(patched);
        patched = normalizeDarkRoughTextColors(patched);
      }
      if (usesRough && !isDarkThemeName(resolvedOptions.theme)) {
        patched = softenLightHachureStrokes(patched);
      }
      if (!isDarkThemeName(resolvedOptions.theme) && resolvedOptions.theme === 'default') {
        patched = neutralizeLightThemePalette(patched);
      }

      if (resolvedOptions.transparentBg) {
        patched = forceTransparentSvgBackground(patched);
      }

      if (resolvedOptions.embedFontPath) {
        const fontBuffer = await readFile(resolvedOptions.embedFontPath);
        const dataUri = `data:${guessFontMime(resolvedOptions.embedFontPath)};base64,${fontBuffer.toString('base64')}`;
        const css = buildEmbeddedFontCss(
          resolvedOptions.embedFontFamily || 'Excalifont',
          dataUri,
          guessFontFormat(resolvedOptions.embedFontPath)
        );
        patched = injectSvgStyles(patched, css);
      }

      if (resolvedOptions.fontFamily) {
        patched = injectFontFamily(patched, resolvedOptions.fontFamily);
      }
      if (resolvedOptions.fontSize) {
        patched = injectFontSize(patched, resolvedOptions.fontSize);
      }

      if (didRoughen) {
        const viewport = await measureSvgViewportForSvg(runtime.page, patched, 24);
        patched = normalizeSvgViewport(patched, viewport);
      }
      if (requestedOpaqueBackgroundColor) {
        patched = ensureOpaqueSvgBackground(patched, requestedOpaqueBackgroundColor);
      }
      await writeFile(outputPath, patched, 'utf8');
    });
  });

  return { outputPath, editUrl, hash };
}

export async function renderMermaidLiveWithRuntime(
  options: RenderOptions,
  runtime: RenderRuntime,
  ui: Ui = silentUi
): Promise<RenderResult> {
  validateOptions(options);
  return renderMermaidLiveWithRuntimeInternal(options, runtime, ui);
}

export async function renderMermaidLive(options: RenderOptions, ui: Ui = silentUi): Promise<RenderResult> {
  validateOptions(options);

  const runtime = await createRenderRuntime({
    headed: options.headed,
    timeoutMs: options.timeoutMs
  });

  try {
    return await renderMermaidLiveWithRuntimeInternal(options, runtime, ui);
  } finally {
    await disposeRenderRuntime(runtime);
  }
}
