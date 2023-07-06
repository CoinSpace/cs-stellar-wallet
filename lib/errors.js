import * as errors from '@coinspace/cs-common/errors';
export * from '@coinspace/cs-common/errors';

export class InvalidMemoError extends errors.InvalidMetaError {
  name = 'InvalidMemoError';
  constructor(memo, options) {
    super(`Invalid Memo: "${memo}"`, {
      ...options,
      meta: 'memo',
    });
  }
}
