import { Command } from 'commander';
import { describe, expect, it } from 'vitest';

function parseFlag(argv: string[], optionName: string): boolean | undefined {
  const program = new Command();
  program.exitOverride();
  program
    .option('--multi-stroke')
    .option('--no-multi-stroke')
    .option('--multi-stroke-fill')
    .option('--no-multi-stroke-fill')
    .option('--preserve-vertices')
    .option('--no-preserve-vertices');
  program.parse(['node', 'cli', ...argv], { from: 'node' });
  return (program.opts() as Record<string, boolean | undefined>)[optionName];
}

describe('paired CLI boolean flags', () => {
  it('supports explicit true/false overrides for multi-stroke', () => {
    expect(parseFlag(['--multi-stroke'], 'multiStroke')).toBe(true);
    expect(parseFlag(['--no-multi-stroke'], 'multiStroke')).toBe(false);
  });

  it('supports explicit true/false overrides for multi-stroke-fill', () => {
    expect(parseFlag(['--multi-stroke-fill'], 'multiStrokeFill')).toBe(true);
    expect(parseFlag(['--no-multi-stroke-fill'], 'multiStrokeFill')).toBe(false);
  });

  it('uses the last flag when both forms are provided', () => {
    expect(parseFlag(['--multi-stroke', '--no-multi-stroke'], 'multiStroke')).toBe(false);
    expect(parseFlag(['--no-preserve-vertices', '--preserve-vertices'], 'preserveVertices')).toBe(true);
  });
});
