export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function isUserFacingError(error: unknown): boolean {
  if (error instanceof UserFacingError) return true;
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; name?: unknown };
  if (candidate.name === 'UserFacingError') return true;
  return typeof candidate.code === 'string' && candidate.code.startsWith('commander.');
}

export function shouldPrintStack(error: unknown, verbose: boolean): boolean {
  if (!verbose) return false;
  if (!(error instanceof Error) || !error.stack) return false;
  return !isUserFacingError(error);
}
