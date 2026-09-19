/**
 * Local-only mode keeps queueing, fingerprints, static rules and reports enabled
 * while preventing assessment material from being sent to an LLM or deep scanner.
 */
export function isSecurityWorkerLocalOnly() {
  return process.env.AI_SECURITY_LOCAL_ONLY?.normalize('NFC').trim().toLowerCase() !== 'false'
}

export function shouldUseSecurityLlm(executionProfile: 'configured' | 'local_deterministic') {
  return executionProfile === 'configured' && !isSecurityWorkerLocalOnly()
}
