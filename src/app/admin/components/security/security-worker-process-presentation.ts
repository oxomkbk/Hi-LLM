import type { SecurityWorkerControlUnavailableReason, SecurityWorkerProcessState } from '@/lib/ai-security/worker-process'
import type { SecurityWorkerRuntime } from '@/lib/ai-security/worker-runtime'

export function bootLabel(enabled: boolean | null) {
  if (enabled === true)
    return '随系统启动'
  if (enabled === false)
    return '未设为开机启动'
  return '启动策略未知'
}

export function processCopy(processState: SecurityWorkerProcessState, runtime: SecurityWorkerRuntime) {
  if (processState.status === 'active') {
    if (runtime.status === 'paused')
      return { description: '节点在线，业务评测已暂停。', title: '执行节点运行中', tone: 'paused' }
    if (runtime.status === 'ready')
      return { description: '节点在线，正在处理安全评测队列。', title: '执行节点运行中', tone: 'active' }
    if (runtime.status === 'degraded')
      return { description: '进程在线，部分评测能力暂不可用。', title: '执行节点部分可用', tone: 'warning' }
    return { description: '进程已启动，正在等待节点心跳。', title: '等待节点就绪', tone: 'warning' }
  }
  if (processState.status === 'activating')
    return { description: 'systemd 已接收启动请求。', title: '正在启动执行节点', tone: 'warning' }
  if (processState.status === 'deactivating')
    return { description: '正在安全结束当前进程。', title: '正在关闭执行节点', tone: 'warning' }
  if (processState.status === 'failed')
    return { description: '请检查 Worker 日志后重试。', title: '执行节点启动失败', tone: 'danger' }
  if (processState.status === 'inactive')
    return { description: '排队任务已保留，启动后会继续处理。', title: '执行节点已关闭', tone: 'inactive' }
  if (processState.controlUnavailableReason === 'disabled')
    return { description: '自动控制已由服务器配置关闭。', title: '节点控制已关闭', tone: 'unavailable' }
  if (processState.controlUnavailableReason === 'unit_not_found')
    return { description: '需要先安装仓库提供的 systemd 服务。', title: '节点服务未安装', tone: 'unavailable' }
  if (processState.controlUnavailableReason === 'permission_denied')
    return { description: '服务器尚未授予状态读取权限。', title: '节点控制权限不足', tone: 'unavailable' }
  return { description: '未检测到可用的 Linux systemd 环境。', title: '当前主机不支持节点控制', tone: 'unavailable' }
}

export function unavailableControlCopy(reason: SecurityWorkerControlUnavailableReason) {
  if (reason === 'permission_denied')
    return { hint: '需为 Web 服务授权固定启停命令', label: '权限不足' }
  if (reason === 'disabled')
    return { hint: '自动控制已由服务器配置关闭', label: '已关闭' }
  if (reason === 'unit_not_found')
    return { hint: '安装 Worker 服务后可自动识别', label: '未安装' }
  return { hint: '仅支持 Linux systemd 宿主机', label: '不支持' }
}
