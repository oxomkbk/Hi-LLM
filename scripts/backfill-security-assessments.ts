import {
  exitCodeForBackfill,
  parseBackfillArgs,
  runSecurityBackfill,
} from '../src/lib/ai-security/backfill/runner'
import { closeBusinessPool } from '../src/lib/db/business'
import { closeControlPool } from '../src/lib/db/control'

const controller = new AbortController()
let interrupted = false
function shutdown() {
  interrupted = true
  controller.abort(new Error('Security backfill interrupted'))
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

try {
  const options = parseBackfillArgs(process.argv.slice(2))
  const summary = await runSecurityBackfill(options, {
    onProgress: event => console.warn(JSON.stringify(event)),
    signal: controller.signal,
  })
  console.warn(options.apply
    ? `本地静态安全评测完成：批次 ${summary.batchId ?? '无新增任务'}，成功终态 ${summary.batchScope - summary.failedSubjects}，失败 ${summary.failedSubjects}。`
    : `Dry-run 完成：同步范围 ${summary.syncScope}，待评测 ${summary.batchScope}，未写数据库。`)
  console.log(JSON.stringify({ code: 'SECURITY_BACKFILL_SUMMARY', ...summary }))
  process.exitCode = exitCodeForBackfill({
    failedSubjects: summary.failedSubjects,
    infrastructureFailed: false,
    interrupted,
  })
}
catch (error) {
  const code = typeof error === 'object' && error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : interrupted ? 'SECURITY_BACKFILL_INTERRUPTED' : 'SECURITY_BACKFILL_FAILED'
  console.error(JSON.stringify({ code }))
  process.exitCode = exitCodeForBackfill({
    failedSubjects: 0,
    infrastructureFailed: !interrupted,
    interrupted,
  })
}
finally {
  process.removeListener('SIGINT', shutdown)
  process.removeListener('SIGTERM', shutdown)
  await Promise.allSettled([closeBusinessPool(), closeControlPool()])
}
