const WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 500
const MAX_GLOBAL_REQUESTS_PER_WINDOW = 5_000
const MAX_IDENTITIES = 10_000
const counters = new Map<string, { count: number, resetAt: number }>()
let globalCounter = { count: 0, resetAt: 0 }
let nextPruneAt = 0

export function allowFileRead(identity: string) {
  const now = Date.now()
  if (globalCounter.resetAt <= now)
    globalCounter = { count: 0, resetAt: now + WINDOW_MS }
  globalCounter.count += 1
  if (globalCounter.count > MAX_GLOBAL_REQUESTS_PER_WINDOW)
    return false

  const current = counters.get(identity)
  if (!current || current.resetAt <= now) {
    pruneCounters(now)
    if (!current && counters.size >= MAX_IDENTITIES)
      return false
    counters.set(identity, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  current.count += 1
  return current.count <= MAX_REQUESTS_PER_WINDOW
}

function pruneCounters(now: number) {
  if (now < nextPruneAt)
    return
  nextPruneAt = now + 10_000
  for (const [key, value] of counters) {
    if (value.resetAt <= now)
      counters.delete(key)
  }
}
