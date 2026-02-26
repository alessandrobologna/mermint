import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { UserFacingError } from './errors.js';

function isAffirmativeResponse(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === 'y' || normalized === 'yes';
}

export interface ConfirmInPlaceMarkdownOverwriteOptions {
  targetPath: string;
  keepMermaid: boolean;
  assumeYes: boolean;
  interactive: boolean;
}

export async function promptForConfirmation(question: string): Promise<string> {
  const prompt = createInterface({
    input: stdin,
    output: stdout
  });
  try {
    return await prompt.question(question);
  } finally {
    prompt.close();
  }
}

export async function confirmInPlaceMarkdownOverwrite(
  options: ConfirmInPlaceMarkdownOverwriteOptions,
  ask: (question: string) => Promise<string> = promptForConfirmation
): Promise<void> {
  if (options.assumeYes) return;

  const keepMermaidNotice = options.keepMermaid
    ? ''
    : ' Mermaid source blocks will be removed unless you pass --keep-mermaid.';
  const question = `Overwrite ${options.targetPath}?${keepMermaidNotice} [y/N] `;

  if (!options.interactive) {
    throw new UserFacingError(
      `Refusing to overwrite ${options.targetPath} in non-interactive mode. Re-run with --yes to confirm.`
    );
  }

  const answer = await ask(question);
  if (!isAffirmativeResponse(answer)) {
    throw new UserFacingError('Cancelled. Markdown file was not modified.');
  }
}

export { isAffirmativeResponse };
