import { describe, expect, it, vi } from 'vitest';
import { confirmInPlaceMarkdownOverwrite, isAffirmativeResponse } from '../src/confirm.js';

describe('isAffirmativeResponse', () => {
  it('accepts y and yes case-insensitively', () => {
    expect(isAffirmativeResponse('y')).toBe(true);
    expect(isAffirmativeResponse('yes')).toBe(true);
    expect(isAffirmativeResponse(' YES ')).toBe(true);
  });

  it('rejects empty and non-affirmative values', () => {
    expect(isAffirmativeResponse('')).toBe(false);
    expect(isAffirmativeResponse('n')).toBe(false);
    expect(isAffirmativeResponse('no')).toBe(false);
  });
});

describe('confirmInPlaceMarkdownOverwrite', () => {
  it('skips prompting when --yes is enabled', async () => {
    const ask = vi.fn<(question: string) => Promise<string>>();

    await expect(
      confirmInPlaceMarkdownOverwrite(
        {
          targetPath: '/tmp/README.md',
          keepMermaid: true,
          assumeYes: true,
          interactive: false
        },
        ask
      )
    ).resolves.toBeUndefined();

    expect(ask).not.toHaveBeenCalled();
  });

  it('fails in non-interactive mode without --yes', async () => {
    await expect(
      confirmInPlaceMarkdownOverwrite({
        targetPath: '/tmp/README.md',
        keepMermaid: true,
        assumeYes: false,
        interactive: false
      })
    ).rejects.toThrow('Refusing to overwrite /tmp/README.md in non-interactive mode. Re-run with --yes to confirm.');
  });

  it('accepts affirmative confirmation', async () => {
    const ask = vi.fn(async () => 'y');

    await expect(
      confirmInPlaceMarkdownOverwrite(
        {
          targetPath: '/tmp/README.md',
          keepMermaid: true,
          assumeYes: false,
          interactive: true
        },
        ask
      )
    ).resolves.toBeUndefined();

    expect(ask).toHaveBeenCalledWith('Overwrite /tmp/README.md? [y/N] ');
  });

  it('adds destructive warning text when Mermaid source is not preserved', async () => {
    const ask = vi.fn(async () => 'yes');

    await expect(
      confirmInPlaceMarkdownOverwrite(
        {
          targetPath: '/tmp/README.md',
          keepMermaid: false,
          assumeYes: false,
          interactive: true
        },
        ask
      )
    ).resolves.toBeUndefined();

    expect(ask).toHaveBeenCalledWith(
      'Overwrite /tmp/README.md? Mermaid source blocks will be removed unless you pass --keep-mermaid. [y/N] '
    );
  });

  it('cancels when response is not affirmative', async () => {
    const ask = vi.fn(async () => 'n');

    await expect(
      confirmInPlaceMarkdownOverwrite(
        {
          targetPath: '/tmp/README.md',
          keepMermaid: true,
          assumeYes: false,
          interactive: true
        },
        ask
      )
    ).rejects.toThrow('Cancelled. Markdown file was not modified.');
  });
});
