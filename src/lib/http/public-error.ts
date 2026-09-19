export const PUBLIC_SERVER_ERROR_MESSAGE = '服务暂时不可用，请稍后再试'

export function publicServerError(error: unknown, context: string) {
  console.error(context, error instanceof Error ? { name: error.name } : { type: typeof error })
  return {
    code: 'INTERNAL_ERROR' as const,
    message: PUBLIC_SERVER_ERROR_MESSAGE,
    retryable: true,
    status: 500 as const,
  }
}
