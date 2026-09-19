interface LlmEndpoint {
  baseUrl: string
  protocol: string
}

export function requiresLlmApiKeyReentry(input: {
  existing: LlmEndpoint | null
  next: LlmEndpoint
  suppliedKey: string
}) {
  if (input.suppliedKey)
    return false
  if (!input.existing)
    return false
  return input.existing.baseUrl !== input.next.baseUrl
    || input.existing.protocol !== input.next.protocol
}
