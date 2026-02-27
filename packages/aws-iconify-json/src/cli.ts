import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Command } from 'commander';
import { buildAwsArchitectureIconifyJson } from './build.js';
import { writeIconCatalog } from './catalog.js';

function main(): void {
  const program = new Command();
  program
    .name('mermint-build-aws-icons')
    .description('Build IconifyJSON from AWS Architecture Service icon SVG files')
    .requiredOption('--source <path>', 'Path to source directory or downloaded AWS icon zip archive')
    .option(
      '--output <path>',
      'Output IconifyJSON file path',
      'assets/icon-packs/aws-architecture-service-icons.json'
    )
    .option('--size <number>', 'Icon size suffix from Arch_*_<size>.svg files', '48')
    .option('--prefix <value>', 'Iconify prefix', 'aws-arch')
    .option('--icons-list <path>', 'Write an icon catalog markdown table')
    .option('--icons-svg-dir <path>', 'Directory for icon SVG previews used by --icons-list', 'svgs/icons')
    .option('--compact', 'Write compact JSON');

  program.parse();

  const options = program.opts<{
    source: string;
    output: string;
    size: string;
    prefix: string;
    iconsList?: string;
    iconsSvgDir: string;
    compact?: boolean;
  }>();

  const size = Number(options.size);
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error(`Invalid --size value: ${options.size}`);
  }

  const payload = buildAwsArchitectureIconifyJson({
    source: options.source,
    size,
    prefix: options.prefix.trim()
  });

  const outputPath = resolve(options.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(payload, null, options.compact ? undefined : 2), 'utf8');

  let catalogPath: string | undefined;
  let catalogSvgDir: string | undefined;
  if (options.iconsList?.trim()) {
    const result = writeIconCatalog({
      payload,
      markdownOutputPath: options.iconsList,
      svgOutputDir: options.iconsSvgDir
    });
    catalogPath = result.markdownOutputPath;
    catalogSvgDir = result.svgOutputDir;
  }

  const iconCount = Object.keys(payload.icons).length;
  const aliasCount = Object.keys(payload.aliases ?? {}).length;
  // eslint-disable-next-line no-console
  console.log(`Generated ${iconCount} icons and ${aliasCount} aliases`);
  // eslint-disable-next-line no-console
  console.log(`Wrote ${outputPath}`);
  if (catalogPath && catalogSvgDir) {
    // eslint-disable-next-line no-console
    console.log(`Wrote ${catalogPath}`);
    // eslint-disable-next-line no-console
    console.log(`Wrote SVG previews to ${catalogSvgDir}`);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error(`error: ${message}`);
  process.exitCode = 1;
}
