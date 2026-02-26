import { Command } from 'commander';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type CliMode,
  hasExplicitRoughOptions,
  parseFillStyleOption,
  parseFloatOption,
  parseIconPackOption,
  parseIntegerOption,
  parseLookOption,
  parseModeOption,
  resolveModeFromInput,
  validateModeSpecificOptions,
  validateLookRoughnessCompatibility
} from './cli-parse.js';
import { UserFacingError, shouldPrintStack, toErrorMessage } from './errors.js';
import { createUi } from './ui.js';
import { renderMarkdownFile } from './markdown.js';
import { renderMermaidLive } from './render.js';
import type { IconPackSource, RenderOptions } from './types.js';
import pkg from '../package.json';

function bundledExcalifontPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '../assets/fonts/Excalifont-Regular.woff2');
}

function normalizeCommanderMessage(message: string): string {
  return message.replace(/^error:\s*/i, '').trim();
}

function wasOptionProvided(program: Command, optionName: string): boolean {
  return program.getOptionValueSource(optionName as never) === 'cli';
}

async function main(): Promise<void> {
  const program = new Command();
  program.configureOutput({
    outputError: () => undefined
  });
  program.exitOverride();

  program
    .name('mermint')
    .description('Mint GitHub-ready Mermaid diagrams.')
    .version(pkg.version)
    .optionsGroup('Input & Mode:')
    .option('-i, --input <file>', 'Input file (Mermaid or Markdown)')
    .option('-o, --output <file>', 'Output path (SVG in diagram mode, Markdown in markdown mode)')
    .option('--mode <value>', 'Override input mode (diagram|markdown).', (value) => parseModeOption(value))
    .optionsGroup('Markdown:')
    .option('--svg-dir <dir>', 'Directory to place rendered SVGs', 'svgs')
    .option('--light-theme <name>', 'Mermaid theme for light-mode SVGs in markdown mode', 'default')
    .option('--keep-mermaid', 'Keep Mermaid source in a <details> block when processing markdown')
    .optionsGroup('Rendering:')
    .option('--base-url <url>', 'Mermaid Live base URL for edit links', 'https://mermaid.live')
    .option('--theme <name>', 'Mermaid theme in the config (defaults to default for single-file rendering)')
    .option('--look <value>', 'Override Mermaid look (classic|handDrawn).', (value) => parseLookOption(value))
    .option(
      '--icon-pack <spec>',
      'Register Mermaid icon pack (repeatable): name=path-or-url or path-or-url',
      (value, previous: IconPackSource[] = []) => [...previous, parseIconPackOption(value)],
      []
    )
    .optionsGroup('Hand-Drawn (Rough.js):')
    .option('--roughness <value>', 'Rough.js roughness for hand-drawn rendering', (value) => parseFloatOption(value, 'roughness'))
    .option('--fill-weight <value>', 'Rough.js fill weight for hand-drawn hatch strokes', (value) => parseFloatOption(value, 'fill-weight'))
    .option(
      '--fill-style <value>',
      'Rough.js fill style (hachure|solid|zigzag|cross-hatch|dots|dashed|zigzag-line)',
      (value) => parseFillStyleOption(value)
    )
    .option('--hachure-gap <value>', 'Rough.js hachure gap', (value) => parseFloatOption(value, 'hachure-gap'))
    .option('--hachure-angle <value>', 'Rough.js hachure angle', (value) => parseFloatOption(value, 'hachure-angle'))
    .option('--bowing <value>', 'Rough.js bowing amount', (value) => parseFloatOption(value, 'bowing'))
    .option('--stroke-width <value>', 'Rough.js stroke width override', (value) => parseFloatOption(value, 'stroke-width'))
    .option('--seed <value>', 'Rough.js seed (integer)', (value) => parseIntegerOption(value, 'seed'))
    .option('--multi-stroke', 'Enable Rough.js multi-stroke rendering')
    .option('--no-multi-stroke', 'Disable Rough.js multi-stroke rendering')
    .option('--multi-stroke-fill', 'Enable Rough.js multi-stroke fill rendering')
    .option('--no-multi-stroke-fill', 'Disable Rough.js multi-stroke fill rendering')
    .option('--preserve-vertices', 'Preserve vertices in Rough.js rendering')
    .option('--no-preserve-vertices', 'Disable vertex preservation in Rough.js rendering')
    .optionsGroup('Typography & Fonts:')
    .option('--use-excalifont', 'Use Excalifont typography even when effective look is classic')
    .option('--font-family <list>', 'Override font-family list (defaults to Excalifont when effective look is handDrawn)')
    .option('--font-size <px>', 'Override font size in SVG output (default: 13)', (value) => parseIntegerOption(value, 'font-size'), 13)
    .option('--embed-font <path>', 'Embed a font file into the SVG')
    .option('--embed-font-family <name>', 'Font-family name for embedded font')
    .option('--no-embed-excalifont', 'Disable bundled Excalifont embedding when Excalifont is enabled')
    .optionsGroup('Output & Runtime:')
    .option('--no-transparent-bg', 'Keep Mermaid background color')
    .option('--settle-ms <ms>', 'Extra wait after initial render', (value) => parseIntegerOption(value, 'settle-ms'), 1500)
    .option('--timeout-ms <ms>', 'Playwright timeout in ms', (value) => parseIntegerOption(value, 'timeout-ms'), 60000)
    .option('--headed', 'Run browser in headed mode')
    .optionsGroup('Logging:')
    .option('--quiet', 'Suppress output')
    .option('--no-spinner', 'Disable spinner output')
    .option('--verbose', 'Show extra details');

  let options: ReturnType<typeof program.opts>;
  try {
    program.parse();
    options = program.opts();
  } catch (error) {
    const candidate = error as { code?: unknown; exitCode?: unknown };
    if (candidate.code === 'commander.helpDisplayed' || candidate.code === 'commander.version') {
      process.exitCode = 0;
      return;
    }

    // Argument parser errors happen before UI options are available; keep output concise.
    const bootstrapUi = createUi({
      quiet: false,
      spinner: false,
      verbose: false
    });
    bootstrapUi.error(normalizeCommanderMessage(toErrorMessage(error)));
    process.exitCode = typeof candidate.exitCode === 'number' ? candidate.exitCode : 1;
    return;
  }

  const ui = createUi({
    quiet: Boolean(options.quiet),
    spinner: Boolean(options.spinner),
    verbose: Boolean(options.verbose)
  });

  ui.header('Mermint', `v${pkg.version}`);

  try {
    const rawTheme = typeof options.theme === 'string' ? options.theme.trim() : '';
    const resolvedTheme = rawTheme || 'default';
    const resolvedDarkTheme = rawTheme || 'dark';

    let embedFontPath: string | undefined = options.embedFont || undefined;
    let embedFontFamily: string | undefined = options.embedFontFamily || undefined;
    const roughness = options.roughness !== undefined ? Number(options.roughness) : undefined;
    const fillWeight = options.fillWeight !== undefined ? Number(options.fillWeight) : undefined;
    const fillStyle = options.fillStyle !== undefined ? String(options.fillStyle) : undefined;
    const hachureGap = options.hachureGap !== undefined ? Number(options.hachureGap) : undefined;
    const hachureAngle = options.hachureAngle !== undefined ? Number(options.hachureAngle) : undefined;
    const bowing = options.bowing !== undefined ? Number(options.bowing) : undefined;
    const strokeWidth = options.strokeWidth !== undefined ? Number(options.strokeWidth) : undefined;
    const seed = options.seed !== undefined ? Number(options.seed) : undefined;
    const disableMultiStroke = typeof options.multiStroke === 'boolean' ? !options.multiStroke : undefined;
    const disableMultiStrokeFill = typeof options.multiStrokeFill === 'boolean' ? !options.multiStrokeFill : undefined;
    const preserveVertices = typeof options.preserveVertices === 'boolean' ? options.preserveVertices : undefined;
    const usePostRough = hasExplicitRoughOptions({
      roughness,
      fillWeight,
      fillStyle,
      hachureGap,
      hachureAngle,
      bowing,
      strokeWidth,
      seed,
      disableMultiStroke,
      disableMultiStrokeFill,
      preserveVertices
    });
    const look = options.look?.trim() || undefined;
    const iconPacks =
      Array.isArray(options.iconPack) && options.iconPack.length > 0
        ? (options.iconPack as IconPackSource[])
        : undefined;
    const useExcalifont = Boolean(options.useExcalifont);
    const rough = look?.toLowerCase() === 'handdrawn' && !usePostRough;
    validateLookRoughnessCompatibility({
      look,
      roughness,
      fillWeight,
      fillStyle,
      hachureGap,
      hachureAngle,
      bowing,
      strokeWidth,
      seed,
      disableMultiStroke,
      disableMultiStrokeFill,
      preserveVertices
    });

    if (!embedFontPath && useExcalifont && options.embedExcalifont) {
      embedFontPath = bundledExcalifontPath();
      embedFontFamily = embedFontFamily || 'Excalifont';
    }

    const fontFamily = options.fontFamily?.trim() || embedFontFamily || (useExcalifont ? 'Excalifont' : undefined);

    const baseRenderOptions = {
      baseUrl: options.baseUrl,
      rough,
      roughness,
      fillWeight,
      fillStyle,
      hachureGap,
      hachureAngle,
      bowing,
      strokeWidth,
      seed,
      disableMultiStroke,
      disableMultiStrokeFill,
      preserveVertices,
      look,
      iconPacks,
      fontFamily,
      fontSize: Number(options.fontSize),
      embedFontPath,
      embedFontFamily,
      embedExcalifont: Boolean(options.embedExcalifont),
      transparentBg: Boolean(options.transparentBg),
      settleMs: Number(options.settleMs),
      timeoutMs: Number(options.timeoutMs),
      headed: Boolean(options.headed)
    } satisfies Omit<RenderOptions, 'input' | 'output' | 'theme'>;

    const inputPath = typeof options.input === 'string' ? options.input.trim() : '';
    if (!inputPath) {
      throw new UserFacingError('--input is required');
    }
    const mode = resolveModeFromInput({
      inputPath,
      explicitMode: options.mode as CliMode | undefined
    });
    const markdownOnlyOptions = [
      ['svgDir', '--svg-dir'],
      ['lightTheme', '--light-theme'],
      ['keepMermaid', '--keep-mermaid']
    ]
      .filter(([name]) => wasOptionProvided(program, name))
      .map(([, flag]) => flag);
    validateModeSpecificOptions({
      mode,
      output: options.output as string | undefined,
      markdownOnlyOptions
    });

    if (mode === 'markdown') {
      const resolvedMarkdownPath = resolve(inputPath);
      const resolvedMarkdownOutput = options.output ? resolve(options.output) : undefined;
      const inPlaceMarkdown = !resolvedMarkdownOutput || resolvedMarkdownOutput === resolvedMarkdownPath;
      const keepMermaid = Boolean(options.keepMermaid) || inPlaceMarkdown;
      if (inPlaceMarkdown && !options.keepMermaid) {
        ui.detail('In-place markdown conversion enables Mermaid source preservation by default.');
      }

      const result = await renderMarkdownFile(
        {
          markdownPath: inputPath,
          outputPath: resolvedMarkdownOutput,
          svgDir: options.svgDir,
          keepMermaid,
          lightTheme: options.lightTheme,
          darkTheme: resolvedDarkTheme,
          renderOptions: baseRenderOptions
        },
        ui
      );
      ui.success(`Updated ${result.outputPath}`);
      ui.detail(`SVGs saved to ${result.svgDir}`);
    } else {
      const renderOptions: RenderOptions = {
        input: inputPath,
        output: options.output,
        theme: resolvedTheme,
        ...baseRenderOptions
      };

      const result = await renderMermaidLive(renderOptions, ui);
      ui.success(`Saved ${result.outputPath}`);
      ui.detail(`Edit URL: ${result.editUrl}`);
    }
  } catch (error) {
    ui.error(toErrorMessage(error));
    if (shouldPrintStack(error, Boolean(options.verbose)) && error instanceof Error) {
      ui.detail(error.stack);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const verbose = process.argv.includes('--verbose');
  const fallbackUi = createUi({
    quiet: false,
    spinner: false,
    verbose
  });
  fallbackUi.error(toErrorMessage(error));
  if (shouldPrintStack(error, verbose) && error instanceof Error) {
    fallbackUi.detail(error.stack);
  }
  process.exitCode = 1;
});
