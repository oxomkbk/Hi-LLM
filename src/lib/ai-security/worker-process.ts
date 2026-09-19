import 'server-only'

import { execFile } from 'node:child_process'

const SECURITY_WORKER_UNIT = 'hillm-security-worker.service' as const
const SYSTEMCTL_PATH = '/usr/bin/systemctl'
const SUDO_PATH = '/usr/bin/sudo'
const SYSTEMCTL_PROPERTIES = 'LoadState,ActiveState,SubState,UnitFileState,MainPID,Result'
const STATUS_ARGS = [
  'show',
  SECURITY_WORKER_UNIT,
  '--no-page',
  `--property=${SYSTEMCTL_PROPERTIES}`,
] as const
const ACTION_ARGS = {
  start: ['-n', SYSTEMCTL_PATH, '--no-block', 'enable', '--now', SECURITY_WORKER_UNIT],
  stop: ['-n', SYSTEMCTL_PATH, '--no-block', 'disable', '--now', SECURITY_WORKER_UNIT],
} as const
const PERMISSION_ARGS = {
  start: ['-n', '-l', SYSTEMCTL_PATH, '--no-block', 'enable', '--now', SECURITY_WORKER_UNIT],
  stop: ['-n', '-l', SYSTEMCTL_PATH, '--no-block', 'disable', '--now', SECURITY_WORKER_UNIT],
} as const
const COMMAND_ENV = {
  LANG: 'C',
  LC_ALL: 'C',
  NODE_ENV: 'production',
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
} as const

export type SecurityWorkerControlUnavailableReason = 'disabled' | 'permission_denied' | 'unit_not_found' | 'unsupported' | null
export type SecurityWorkerProcessAction = keyof typeof ACTION_ARGS
export interface SecurityWorkerProcessState {
  controlAvailable: boolean
  controlUnavailableReason: SecurityWorkerControlUnavailableReason
  enabledAtBoot: boolean | null
  mainPid: number | null
  status: SecurityWorkerProcessStatus
  statusDetail: SecurityWorkerProcessStatusDetail
  unit: typeof SECURITY_WORKER_UNIT
}
export type SecurityWorkerProcessStatus = 'active' | 'activating' | 'deactivating' | 'failed' | 'inactive' | 'unavailable'
export type SecurityWorkerProcessStatusDetail = 'active' | 'activating' | 'deactivating' | 'failed' | 'inactive' | null

interface CommandOptions {
  env: NodeJS.ProcessEnv
  maxBuffer: number
  timeout: number
}

interface CommandResult {
  stderr: string
  stdout: string
}

type CommandRunner = (
  executable: string,
  args: readonly string[],
  options: CommandOptions,
) => Promise<CommandResult>

export class SecurityWorkerProcessError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message)
  }
}

export function createSecurityWorkerProcessController(options: {
  controlDisabled?: boolean
  platform?: NodeJS.Platform
  runCommand?: CommandRunner
} = {}) {
  const controlDisabled = options.controlDisabled ?? workerControlDisabled()
  const platform = options.platform ?? process.platform
  const runCommand = options.runCommand ?? defaultRunCommand

  const getState = async (): Promise<SecurityWorkerProcessState> => {
    if (controlDisabled)
      return unavailableState('disabled')
    if (platform !== 'linux')
      return unavailableState('unsupported')

    try {
      const result = await runCommand(SYSTEMCTL_PATH, STATUS_ARGS, commandOptions(5_000))
      const state = projectSystemdState(result.stdout)
      if (!state.controlAvailable)
        return state
      try {
        await Promise.all([
          runCommand(SUDO_PATH, PERMISSION_ARGS.start, commandOptions(5_000)),
          runCommand(SUDO_PATH, PERMISSION_ARGS.stop, commandOptions(5_000)),
        ])
        return state
      }
      catch {
        return {
          ...state,
          controlAvailable: false,
          controlUnavailableReason: 'permission_denied',
        }
      }
    }
    catch (error) {
      return unavailableState(readFailureDetail(error))
    }
  }

  const runAction = async (action: SecurityWorkerProcessAction) => {
    if (controlDisabled)
      throw unavailableError('节点进程控制已通过环境配置关闭')
    if (platform !== 'linux')
      throw unavailableError('节点进程控制尚未配置')

    try {
      await runCommand(SUDO_PATH, ACTION_ARGS[action], commandOptions(10_000))
    }
    catch (error) {
      throw controlError(error)
    }
    return getState()
  }

  return { getState, runAction }
}

const defaultController = createSecurityWorkerProcessController()

export async function getSecurityWorkerProcessState() {
  return defaultController.getState()
}

export function projectSystemdState(serialized: string): SecurityWorkerProcessState {
  const properties = parseProperties(serialized)
  const loadState = properties.get('LoadState')
  if (loadState !== 'loaded')
    return unavailableState(loadState === 'not-found' ? 'unit_not_found' : 'unsupported')

  const activeState = properties.get('ActiveState')
  const status = activeState === 'active'
    ? 'active'
    : activeState === 'activating' || activeState === 'reloading'
      ? 'activating'
      : activeState === 'deactivating'
        ? 'deactivating'
        : activeState === 'failed'
          ? 'failed'
          : activeState === 'inactive'
            ? 'inactive'
            : 'unavailable'
  if (status === 'unavailable')
    return unavailableState('unsupported')

  return {
    controlAvailable: true,
    controlUnavailableReason: null,
    enabledAtBoot: enabledAtBoot(properties.get('UnitFileState')),
    mainPid: positiveSafeInteger(properties.get('MainPID')),
    status,
    statusDetail: status,
    unit: SECURITY_WORKER_UNIT,
  }
}

export async function runSecurityWorkerProcessAction(action: SecurityWorkerProcessAction) {
  return defaultController.runAction(action)
}

function commandOptions(timeout: number): CommandOptions {
  return {
    env: COMMAND_ENV,
    maxBuffer: 64 * 1024,
    timeout,
  }
}

function controlError(error: unknown) {
  if (isTimeout(error)) {
    return new SecurityWorkerProcessError(
      '执行节点控制超时，请稍后刷新状态',
      504,
      'SECURITY_WORKER_CONTROL_TIMEOUT',
    )
  }
  const detail = readFailureDetail(error)
  if (detail === 'permission_denied') {
    return new SecurityWorkerProcessError(
      '服务器尚未授予执行节点控制权限',
      503,
      'SECURITY_WORKER_PERMISSION_DENIED',
    )
  }
  if (detail === 'unit_not_found' || executableMissing(error))
    return unavailableError('服务器尚未安装执行节点服务')
  return new SecurityWorkerProcessError(
    '执行节点控制失败，请检查服务日志',
    502,
    'SECURITY_WORKER_CONTROL_FAILED',
  )
}

function defaultRunCommand(
  executable: string,
  args: readonly string[],
  options: CommandOptions,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(executable, [...args], {
      encoding: 'utf8',
      env: { ...options.env },
      maxBuffer: options.maxBuffer,
      timeout: options.timeout,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, {
          safeStderr: String(stderr),
          safeStdout: String(stdout),
        }))
        return
      }
      resolve({ stderr: String(stderr), stdout: String(stdout) })
    })
  })
}

function enabledAtBoot(value: string | undefined) {
  if (value === 'enabled')
    return true
  if (value === 'disabled')
    return false
  return null
}

function executableMissing(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 'ENOENT')
}

function isTimeout(error: unknown) {
  if (!error || typeof error !== 'object')
    return false
  const candidate = error as { code?: unknown, killed?: unknown, signal?: unknown }
  return candidate.code === 'ETIMEDOUT'
    || candidate.killed === true
    || candidate.signal === 'SIGTERM'
}

function parseProperties(serialized: string) {
  const properties = new Map<string, string>()
  for (const line of serialized.split(/\r?\n/u)) {
    const separator = line.indexOf('=')
    if (separator <= 0)
      continue
    properties.set(line.slice(0, separator), line.slice(separator + 1))
  }
  return properties
}

function positiveSafeInteger(value: string | undefined) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function readFailureDetail(error: unknown): Exclude<SecurityWorkerControlUnavailableReason, 'disabled' | null> {
  if (!error || typeof error !== 'object')
    return 'unsupported'
  const candidate = error as {
    code?: unknown
    message?: unknown
    safeStderr?: unknown
    safeStdout?: unknown
    stderr?: unknown
    stdout?: unknown
  }
  if (candidate.code === 'ENOENT')
    return 'unsupported'
  const diagnostic = [
    candidate.message,
    candidate.safeStderr,
    candidate.safeStdout,
    candidate.stderr,
    candidate.stdout,
  ].filter(value => typeof value === 'string').join('\n').toLowerCase()
  if (/permission denied|access denied|not allowed|not in the sudoers|a password is required|authentication is required/u.test(diagnostic))
    return 'permission_denied'
  if (/unit .* (?:could not be found|not found)|no such unit/u.test(diagnostic))
    return 'unit_not_found'
  return 'unsupported'
}

function unavailableError(message: string) {
  return new SecurityWorkerProcessError(message, 503, 'SECURITY_WORKER_CONTROL_UNAVAILABLE')
}

function unavailableState(controlUnavailableReason: Exclude<SecurityWorkerControlUnavailableReason, null>): SecurityWorkerProcessState {
  return {
    controlAvailable: false,
    controlUnavailableReason,
    enabledAtBoot: null,
    mainPid: null,
    status: 'unavailable',
    statusDetail: null,
    unit: SECURITY_WORKER_UNIT,
  }
}

function workerControlDisabled() {
  return process.env.AI_SECURITY_WORKER_CONTROL_DISABLED?.normalize('NFC').trim().toLowerCase() === 'true'
}
