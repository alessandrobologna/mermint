import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { buildAwsArchitectureIconifyJson } from '../src/build.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop() as string;
    rmSync(dir, { recursive: true, force: true });
  }
});

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aws-iconify-json-'));
  tempDirs.push(dir);
  return dir;
}

function svg(fill = '#000'): string {
  return `<svg viewBox="0 0 48 48"><path fill="${fill}" d="M0 0h48v48H0z"/></svg>`;
}

describe('buildAwsArchitectureIconifyJson', () => {
  it('builds icons from a directory source', () => {
    const root = createTempDir();
    const sourceDir = join(root, 'download', 'Architecture-Service-Icons_demo', 'Arch_Compute');
    mkdirSync(sourceDir, { recursive: true });

    writeFileSync(join(sourceDir, 'Arch_Amazon-EC2_48.svg'), svg('#111'));
    writeFileSync(join(sourceDir, 'Arch_Amazon-EC2_32.svg'), svg('#222'));

    const payload = buildAwsArchitectureIconifyJson({
      source: root,
      size: 48,
      prefix: 'aws-arch'
    });

    expect(payload.icons['amazon-ec2']).toBeDefined();
    expect(Object.keys(payload.icons)).toHaveLength(1);
    expect(payload.aliases?.ec2?.parent).toBe('amazon-ec2');
  });

  it('builds icons from a zip source without unpacking', () => {
    const root = createTempDir();
    const zipPath = join(root, 'aws-icons.zip');

    const archive = zipSync({
      'Architecture-Service-Icons_demo/Arch_Compute/Arch_Amazon-EC2_48.svg': strToU8(svg('#111')),
      'Architecture-Service-Icons_demo/Arch_Compute/Arch_Amazon-EC2_32.svg': strToU8(svg('#222')),
      'Architecture-Service-Icons_demo/Arch_Application-Integration/Arch_Amazon-API-Gateway_48.svg': strToU8(
        svg('#333')
      )
    });

    writeFileSync(zipPath, archive);

    const payload = buildAwsArchitectureIconifyJson({
      source: zipPath,
      size: 48,
      prefix: 'aws-arch'
    });

    expect(payload.icons['amazon-ec2']).toBeDefined();
    expect(payload.icons['amazon-api-gateway']).toBeDefined();
    expect(payload.aliases?.['aws-api-gateway']?.parent).toBe('amazon-api-gateway');
  });

  it('scopes duplicate icon names by immediate Arch_* category folder', () => {
    const root = createTempDir();
    const computeDir = join(root, 'download', 'Architecture-Service-Icons_demo', 'Arch_Compute');
    const dataDir = join(root, 'download', 'Architecture-Service-Icons_demo', 'Arch_Data');
    mkdirSync(computeDir, { recursive: true });
    mkdirSync(dataDir, { recursive: true });

    writeFileSync(join(computeDir, 'Arch_Amazon-EC2_48.svg'), svg('#111'));
    writeFileSync(join(dataDir, 'Arch_Amazon-EC2_48.svg'), svg('#222'));

    const payload = buildAwsArchitectureIconifyJson({
      source: root,
      size: 48,
      prefix: 'aws-arch'
    });

    const iconNames = Object.keys(payload.icons).sort();
    expect(iconNames).toContain('amazon-ec2');

    const scoped = iconNames.filter((name) => name.startsWith('amazon-ec2-'));
    expect(scoped).toHaveLength(1);
    expect(scoped[0]).not.toContain('architecture-service-icons');
    expect(scoped[0]).toMatch(/^amazon-ec2-(compute|data)(-\d+)?$/);
  });
});
