import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const {
  createSecurityWorkerProcessController,
  projectSystemdState,
  SecurityWorkerProcessError,
} = await import('./worker-process')

const ACTIVE_STATUS = [
  'LoadState=loaded',
  'ActiveState=active',
  'SubState=running',
  'UnitFileState=enabled',
  'MainPID=2741',
  'Result=success',
].join('\n')

describe('security worker process controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('projects only the approved systemd state fields', () => {
    expect(projectSystemdState(ACTIVE_STATUS)).toEqual({
      controlAvailable: true,
      controlUnavailableReason: null,
      enabledAtBoot: true,
      mainPid: 2741,
      status: 'active',
      statusDetail: 'active',
      unit: 'hillm-security-worker.service',
    })
  })

  it.each(['enabled-runtime', 'linked', 'linked-runtime', 'static'])('does not report %s as persistent boot enablement', (unitFileState) => {
    const state = projectSystemdState(ACTIVE_STATUS.replace('UnitFileState=enabled', `UnitFileState=${unitFileState}`))
    expect(state.enabledAtBoot).toBeNull()
  })

  it('maps a missing unit to a safe unavailable state', () => {
    expect(projectSystemdState('LoadState=not-found\nActiveState=inactive')).toEqual({
      controlAvailable: false,
      controlUnavailableReason: 'unit_not_found',
      enabledAtBoot: null,
      mainPid: null,
      status: 'unavailable',
      statusDetail: null,
      unit: 'hillm-security-worker.service',
    })
  })

  it('does not execute systemctl while the explicit safety fuse is enabled', async () => {
    const runCommand = vi.fn()
    const controller = createSecurityWorkerProcessController({
      controlDisabled: true,
      platform: 'linux',
      runCommand,
    })

    expect(await controller.getState()).toMatchObject({
      controlAvailable: false,
      controlUnavailableReason: 'disabled',
      statusDetail: null,
    })
    await expect(controller.runAction('start')).rejects.toMatchObject({
      code: 'SECURITY_WORKER_CONTROL_UNAVAILABLE',
      status: 503,
    })
    expect(runCommand).not.toHaveBeenCalled()
  })

  it('uses fixed executable paths and arguments without a shell', async () => {
    const runCommand = vi.fn()
      .mockResolvedValueOnce({ stderr: '', stdout: '' })
      .mockResolvedValueOnce({ stderr: '', stdout: ACTIVE_STATUS })
      .mockResolvedValue({ stderr: '', stdout: '' })
    const controller = createSecurityWorkerProcessController({
      controlDisabled: false,
      platform: 'linux',
      runCommand,
    })

    await expect(controller.runAction('start')).resolves.toMatchObject({ status: 'active' })
    expect(runCommand).toHaveBeenNthCalledWith(1, '/usr/bin/sudo', [
      '-n',
      '/usr/bin/systemctl',
      '--no-block',
      'enable',
      '--now',
      'hillm-security-worker.service',
    ], expect.objectContaining({ maxBuffer: 64 * 1024, timeout: 10_000 }))
    expect(runCommand).toHaveBeenNthCalledWith(2, '/usr/bin/systemctl', [
      'show',
      'hillm-security-worker.service',
      '--no-page',
      '--property=LoadState,ActiveState,SubState,UnitFileState,MainPID,Result',
    ], expect.objectContaining({ maxBuffer: 64 * 1024, timeout: 5_000 }))
    expect(runCommand).toHaveBeenNthCalledWith(3, '/usr/bin/sudo', [
      '-n',
      '-l',
      '/usr/bin/systemctl',
      '--no-block',
      'enable',
      '--now',
      'hillm-security-worker.service',
    ], expect.objectContaining({ maxBuffer: 64 * 1024, timeout: 5_000 }))
    expect(runCommand).toHaveBeenNthCalledWith(4, '/usr/bin/sudo', [
      '-n',
      '-l',
      '/usr/bin/systemctl',
      '--no-block',
      'disable',
      '--now',
      'hillm-security-worker.service',
    ], expect.objectContaining({ maxBuffer: 64 * 1024, timeout: 5_000 }))
  })

  it('auto-detects on Linux even when the legacy enabled flag is false', async () => {
    vi.stubEnv('AI_SECURITY_WORKER_CONTROL_ENABLED', 'false')
    vi.stubEnv('AI_SECURITY_WORKER_CONTROL_DISABLED', 'false')
    const runCommand = vi.fn().mockImplementation(async (executable: string) => ({
      stderr: '',
      stdout: executable === '/usr/bin/systemctl' ? ACTIVE_STATUS : '',
    }))
    const controller = createSecurityWorkerProcessController({ platform: 'linux', runCommand })

    await expect(controller.getState()).resolves.toMatchObject({
      controlAvailable: true,
      controlUnavailableReason: null,
      status: 'active',
    })
    expect(runCommand).toHaveBeenCalledTimes(3)
  })

  it('preserves the real process state when sudo control permission is missing', async () => {
    const runCommand = vi.fn().mockImplementation(async (executable: string) => {
      if (executable === '/usr/bin/systemctl')
        return { stderr: '', stdout: ACTIVE_STATUS }
      throw Object.assign(new Error('sudo failed'), { safeStderr: 'sudo: a password is required' })
    })
    const controller = createSecurityWorkerProcessController({
      controlDisabled: false,
      platform: 'linux',
      runCommand,
    })

    await expect(controller.getState()).resolves.toMatchObject({
      controlAvailable: false,
      controlUnavailableReason: 'permission_denied',
      enabledAtBoot: true,
      mainPid: 2741,
      status: 'active',
      statusDetail: 'active',
    })
  })

  it('maps sudo permission failures without exposing command output', async () => {
    const controller = createSecurityWorkerProcessController({
      controlDisabled: false,
      platform: 'linux',
      runCommand: vi.fn().mockRejectedValue(Object.assign(new Error('sudo failed'), {
        safeStderr: 'sudo: a password is required',
      })),
    })

    const error = await controller.runAction('stop').catch(value => value)
    expect(error).toBeInstanceOf(SecurityWorkerProcessError)
    expect(error).toMatchObject({
      code: 'SECURITY_WORKER_PERMISSION_DENIED',
      message: '服务器尚未授予执行节点控制权限',
      status: 503,
    })
    expect(error.message).not.toContain('sudo failed')
  })

  it('maps command timeouts to a retryable gateway timeout', async () => {
    const controller = createSecurityWorkerProcessController({
      controlDisabled: false,
      platform: 'linux',
      runCommand: vi.fn().mockRejectedValue(Object.assign(new Error('timed out'), {
        code: 'ETIMEDOUT',
      })),
    })

    await expect(controller.runAction('start')).rejects.toMatchObject({
      code: 'SECURITY_WORKER_CONTROL_TIMEOUT',
      status: 504,
    })
  })

  it('maps an unrecognized systemctl failure to a bad gateway response', async () => {
    const controller = createSecurityWorkerProcessController({
      controlDisabled: false,
      platform: 'linux',
      runCommand: vi.fn().mockRejectedValue(Object.assign(new Error('systemctl failed'), {
        code: 1,
        safeStderr: 'Job failed',
      })),
    })

    await expect(controller.runAction('start')).rejects.toMatchObject({
      code: 'SECURITY_WORKER_CONTROL_FAILED',
      status: 502,
    })
  })
})
