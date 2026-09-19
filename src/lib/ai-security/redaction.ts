const ASSIGNMENT_SECRET_PATTERN = /\b(api[-_]?key|authorization|credential|password|secret|token)\s*([:=])\s*(["']?)[^\s"',;]{8,}\3/gi
const AWS_ACCESS_KEY_PATTERN = /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g
const BEARER_PATTERN = /\bBearer\s+[\w.~+/-]{8,}={0,2}/gi
const OPENAI_KEY_PATTERN = /\bsk-[\w-]{16,}\b/g

export function redactSecurityText(input: string) {
  return input
    .replaceAll(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replaceAll(AWS_ACCESS_KEY_PATTERN, '[REDACTED]')
    .replaceAll(OPENAI_KEY_PATTERN, '[REDACTED]')
    .replaceAll(ASSIGNMENT_SECRET_PATTERN, '$1$2[REDACTED]')
}
