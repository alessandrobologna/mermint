import { describe, expect, it } from 'vitest';
import { InvalidArgumentError } from 'commander';
import { UserFacingError, isUserFacingError, shouldPrintStack, toErrorMessage } from '../src/errors.js';

describe('toErrorMessage', () => {
  it('returns message for Error values and stringifies unknown values', () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom');
    expect(toErrorMessage('oops')).toBe('oops');
    expect(toErrorMessage(42)).toBe('42');
  });
});

describe('isUserFacingError', () => {
  it('detects explicit user-facing errors', () => {
    expect(isUserFacingError(new UserFacingError('bad input'))).toBe(true);
  });

  it('detects commander parse errors', () => {
    expect(isUserFacingError(new InvalidArgumentError('bad arg'))).toBe(true);
  });

  it('does not classify generic errors as user-facing', () => {
    expect(isUserFacingError(new Error('unexpected bug'))).toBe(false);
  });
});

describe('shouldPrintStack', () => {
  it('suppresses stack for user-facing errors even in verbose mode', () => {
    expect(shouldPrintStack(new UserFacingError('bad input'), true)).toBe(false);
    expect(shouldPrintStack(new InvalidArgumentError('bad arg'), true)).toBe(false);
  });

  it('prints stack only for non-user-facing errors when verbose is enabled', () => {
    expect(shouldPrintStack(new Error('unexpected bug'), true)).toBe(true);
    expect(shouldPrintStack(new Error('unexpected bug'), false)).toBe(false);
  });
});

