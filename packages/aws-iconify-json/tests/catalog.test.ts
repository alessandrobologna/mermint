import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { IconifyJson } from '../src/build.js';
import { writeIconCatalog } from '../src/catalog.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop() as string;
    rmSync(dir, { recursive: true, force: true });
  }
});

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aws-iconify-catalog-'));
  tempDirs.push(dir);
  return dir;
}

describe('writeIconCatalog', () => {
  it('writes ICONS.md with preview table and svg files', () => {
    const root = createTempDir();
    const markdownOutputPath = join(root, 'docs', 'ICONS.md');
    const svgOutputDir = join(root, 'docs', 'icons');

    const payload: IconifyJson = {
      prefix: 'aws',
      icons: {
        'amazon-api-gateway': {
          body: '<path d="M0 0h24v24H0z"/>',
          width: 24,
          height: 24
        },
        'amazon-lambda': {
          body: '<path d="M1 1h22v22H1z"/>',
          width: 24,
          height: 24
        }
      },
      aliases: {
        'aws-api-gateway': { parent: 'amazon-api-gateway' }
      }
    };

    const result = writeIconCatalog({
      payload,
      markdownOutputPath,
      svgOutputDir
    });

    expect(result.iconCount).toBe(2);

    const markdown = readFileSync(markdownOutputPath, 'utf8');
    expect(markdown).toContain('| Preview | Name | Aliases |');
    expect(markdown).toContain('![amazon-api-gateway](./icons/amazon-api-gateway.svg)');
    expect(markdown).toContain('`amazon-api-gateway` | `aws-api-gateway`');
    expect(markdown).toContain('`amazon-lambda` | -');

    const apiSvg = readFileSync(join(svgOutputDir, 'amazon-api-gateway.svg'), 'utf8');
    expect(apiSvg).toContain('viewBox="0 0 24 24"');
    expect(apiSvg).toContain('<path d="M0 0h24v24H0z"/>');
  });

  it('uses relative paths between markdown output and svg directory', () => {
    const root = createTempDir();
    const markdownOutputPath = join(root, 'docs', 'ICONS.md');
    const svgOutputDir = join(root, 'assets', 'icons');

    const payload: IconifyJson = {
      prefix: 'aws',
      icons: {
        ec2: {
          body: '<path d="M2 2h20v20H2z"/>',
          width: 24,
          height: 24
        }
      }
    };

    writeIconCatalog({
      payload,
      markdownOutputPath,
      svgOutputDir
    });

    const markdown = readFileSync(markdownOutputPath, 'utf8');
    expect(markdown).toContain('![ec2](../assets/icons/ec2.svg)');
  });

  it('normalizes preview SVG canvas size for mixed icon dimensions', () => {
    const root = createTempDir();
    const markdownOutputPath = join(root, 'ICONS.md');
    const svgOutputDir = join(root, 'svgs');

    const payload: IconifyJson = {
      prefix: 'aws',
      icons: {
        large: {
          body: '<path d="M0 0h64v64H0z"/>',
          width: 64,
          height: 64
        },
        small: {
          body: '<path d="M0 0h40v40H0z"/>',
          width: 40,
          height: 40
        }
      }
    };

    writeIconCatalog({
      payload,
      markdownOutputPath,
      svgOutputDir
    });

    const largeSvg = readFileSync(join(svgOutputDir, 'large.svg'), 'utf8');
    const smallSvg = readFileSync(join(svgOutputDir, 'small.svg'), 'utf8');

    expect(largeSvg).toContain('width="64" height="64"');
    expect(smallSvg).toContain('viewBox="0 0 40 40"');
    expect(smallSvg).toContain('width="64" height="64"');
  });
});
