export class WonderlandError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = 'WONDERLAND_INVALID',
  ) {
    super(message)
  }
}

export function isWonderlandError(error: unknown): error is WonderlandError {
  return error instanceof WonderlandError
}
