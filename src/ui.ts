import chalk from 'chalk';
import ora from 'ora';
import wrapAnsi from 'wrap-ansi';
import type { StepHandle, Ui, UiOptions } from './types.js';

const symbols = {
  bullet: '•',
  success: '✓',
  error: '×',
  warn: '!',
  info: '>'
};

const styles = {
  primary: (value: string) => value,
  secondary: (value: string) => chalk.dim(value),
  accent: (value: string) => chalk.cyan(value),
  success: (value: string) => chalk.green(value),
  error: (value: string) => chalk.red(value),
  system: (value: string) => chalk.magenta(value)
};

function terminalWidth(): number {
  const width = process.stdout.columns ?? 80;
  return Math.max(40, width);
}

function wrapWithPrefix(message: string, prefixPlain: string, prefixStyled: string, style: (value: string) => string): string {
  const width = Math.max(20, terminalWidth() - prefixPlain.length);
  const wrapped = wrapAnsi(message, width, { hard: false, trim: false });
  const lines = wrapped.split('\n');
  return lines
    .map((line, index) => {
      const prefix = index === 0 ? prefixStyled : ' '.repeat(prefixPlain.length);
      return `${prefix}${style(line)}`;
    })
    .join('\n');
}

function writeLine(text: string, stream: 'stdout' | 'stderr' = 'stdout'): void {
  const target = stream === 'stderr' ? process.stderr : process.stdout;
  target.write(`${text}\n`);
}

function createSilentUi(): Ui {
  const noop = () => undefined;
  const step: StepHandle = { succeed: noop, fail: noop };
  return {
    header: noop,
    step: () => step,
    info: noop,
    warn: noop,
    error: noop,
    success: noop,
    detail: noop
  };
}

export function createUi(options: UiOptions): Ui {
  if (options.quiet) {
    return createSilentUi();
  }

  const detailLine = (message: string, stream: 'stdout' | 'stderr') => {
    if (!options.verbose) return;
    const prefixPlain = '  └ ';
    const prefixStyled = styles.secondary(prefixPlain);
    writeLine(wrapWithPrefix(message, prefixPlain, prefixStyled, styles.secondary), stream);
  };

  const detail = (message: string) => detailLine(message, 'stdout');

  const line = (prefix: string, style: (value: string) => string, message: string, stream: 'stdout' | 'stderr' = 'stdout') => {
    const prefixPlain = `${prefix} `;
    const prefixStyled = style(prefixPlain);
    writeLine(wrapWithPrefix(message, prefixPlain, prefixStyled, styles.primary), stream);
  };

  const step = (message: string, extra?: string): StepHandle => {
    if (extra) detail(extra);

    if (!options.spinner) {
      line(symbols.bullet, styles.accent, message);
      return {
        succeed(nextMessage) {
          line(symbols.success, styles.success, nextMessage ?? message);
        },
        fail(nextMessage) {
          line(symbols.error, styles.error, nextMessage ?? message);
        }
      };
    }

    const spinner = ora({
      text: message,
      spinner: 'dots',
      color: 'cyan'
    });
    spinner.start();

    return {
      succeed(nextMessage) {
        spinner.succeed(nextMessage ?? message);
      },
      fail(nextMessage) {
        spinner.fail(nextMessage ?? message);
      }
    };
  };

  return {
    header(title: string, subtitle?: string) {
      const heading = subtitle ? `${title} ${styles.secondary(subtitle)}` : title;
      writeLine(styles.accent(heading));
    },
    step,
    info(message: string, extra?: string) {
      line(symbols.info, styles.accent, message);
      if (extra) detail(extra);
    },
    warn(message: string, extra?: string) {
      line(symbols.warn, styles.accent, message);
      if (extra) detail(extra);
    },
    error(message: string, extra?: string) {
      line(symbols.error, styles.error, message, 'stderr');
      if (extra) detailLine(extra, 'stderr');
    },
    success(message: string, extra?: string) {
      line(symbols.success, styles.success, message);
      if (extra) detail(extra);
    },
    detail
  };
}

export type { Ui } from './types.js';
