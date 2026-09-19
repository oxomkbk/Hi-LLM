import { describe, expect, it, vi } from 'vitest'

import { PUBLIC_SERVER_ERROR_MESSAGE, publicServerError } from './public-error'

describe('public server error contract', () => {
  it('returns a stable generic message without exposing internal details', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const result = publicServerError(new Error('column encrypted_api_key does not exist'), 'catalog read')

    expect(result).toEqual({
      code: 'INTERNAL_ERROR',
      message: PUBLIC_SERVER_ERROR_MESSAGE,
      retryable: true,
      status: 500,
    })
    expect(JSON.stringify(result)).not.toContain('encrypted_api_key')
    expect(log).toHaveBeenCalledWith('catalog read', { name: 'Error' })
    log.mockRestore()
  })
})
