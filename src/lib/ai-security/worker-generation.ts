/**
 * Bump this value whenever worker code changes a persisted assessment contract
 * (for example declared fingerprints, acquisition or report normalization).
 * The database claim guard rejects heartbeats from older generations.
 */
export const SECURITY_WORKER_GENERATION = 'hillm-nav-security-worker@2026-08-28.1'
