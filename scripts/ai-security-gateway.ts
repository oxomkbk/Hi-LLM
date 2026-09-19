import { createSecurityGatewayServer } from '../src/lib/ai-security/gateway/server'
import { closeControlPool } from '../src/lib/db/control'

const gateway = createSecurityGatewayServer()
async function shutdown() {
  gateway.server.close(async () => {
    await closeControlPool()
    process.exitCode = 0
  })
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)

try {
  await gateway.listen()
  console.warn(JSON.stringify({
    code: 'SECURITY_GATEWAY_READY',
    host: gateway.host,
    port: gateway.port,
  }))
}
catch {
  console.error(JSON.stringify({ code: 'SECURITY_GATEWAY_FAILED' }))
  await closeControlPool()
  process.exitCode = 1
}
