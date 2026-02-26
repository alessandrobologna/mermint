import { describe, expect, it } from 'vitest';
import { resolveModeFromInput, validateModeSpecificOptions } from '../src/cli-parse.js';

describe('CLI mode resolution', () => {
  it('routes .mmd files to diagram mode and requires output', () => {
    const mode = resolveModeFromInput({ inputPath: 'diagram.mmd' });
    expect(mode).toBe('diagram');
    expect(() =>
      validateModeSpecificOptions({
        mode,
        output: undefined
      })
    ).toThrow('--output is required in diagram mode');
  });

  it('routes markdown extensions to markdown mode and allows missing output', () => {
    for (const inputPath of ['README.md', 'guide.markdown', 'component.MDX']) {
      const mode = resolveModeFromInput({ inputPath });
      expect(mode).toBe('markdown');
      expect(() =>
        validateModeSpecificOptions({
          mode,
          output: undefined
        })
      ).not.toThrow();
    }
  });

  it('applies explicit mode override even when extension suggests another mode', () => {
    const mode = resolveModeFromInput({
      inputPath: 'README.md',
      explicitMode: 'diagram'
    });
    expect(mode).toBe('diagram');
    expect(() =>
      validateModeSpecificOptions({
        mode,
        output: 'diagram.svg'
      })
    ).not.toThrow();
  });

  it('rejects markdown-only flags in diagram mode', () => {
    expect(() =>
      validateModeSpecificOptions({
        mode: 'diagram',
        output: 'diagram.svg',
        markdownOnlyOptions: ['--svg-dir', '--keep-mermaid']
      })
    ).toThrow('--svg-dir, --keep-mermaid can only be used in markdown mode');
  });
});
