import { createStaticFinding } from './static-finding'

import type { NormalizedSecurityFinding } from '../finalize'

export interface McpInstallationPayload {
  args: string[]
  command: null | string
  envVars: Array<{ name: string, required: boolean }>
  headerNames: string[]
  packageName: null | string
  remoteUrl: null | string
  transport: string
  version: null | string
}

export interface McpPayload {
  capabilities: string[]
  description: string
  installations: McpInstallationPayload[]
  name: string
  protocolVersion: string
  sourceUrl: null | string
  summary: string
}

export function analyzeMcpPayload(payload: McpPayload) {
  const findings: NormalizedSecurityFinding[] = []
  payload.installations.forEach((installation, index) => {
    const artifactPath = `installations/${index}`
    const commandText = [installation.command, ...installation.args].filter(Boolean).join(' ')
    if (/[;&|`\r\n]|\$\(/.test(commandText)) {
      findings.push(createStaticFinding({
        artifactPath,
        description: '安装命令或参数包含 Shell 控制符，复制执行时可能产生额外命令。',
        publicSummary: '安装配置包含需要复核的 Shell 控制符。',
        recommendation: '将命令和参数拆分为固定数组，拒绝 Shell 拼接、命令替换和多命令连接符。',
        riskCode: 'MCP_SHELL_INJECTION',
        severity: 'high',
        title: 'MCP 安装配置存在 Shell 注入风险',
      }))
    }
    if (/^(?:bash|cmd|curl|powershell|pwsh|sh|wget)(?:\.exe)?$/i.test(installation.command ?? '')) {
      findings.push(createStaticFinding({
        artifactPath,
        description: '安装配置直接调用通用 Shell 或下载器，会显著扩大执行范围。',
        publicSummary: '安装配置直接调用 Shell 或下载器。',
        recommendation: '改用来源明确、版本固定的包执行器，并避免下载后立即执行。',
        riskCode: 'MCP_DANGEROUS_COMMAND',
        severity: 'high',
        title: 'MCP 使用高风险安装命令',
      }))
    }
    if (installation.remoteUrl?.startsWith('http://')) {
      findings.push(createStaticFinding({
        artifactPath,
        description: '远程 MCP 地址使用未加密 HTTP，传输内容可能被窃听或篡改。',
        publicSummary: '远程连接未使用 HTTPS。',
        recommendation: '改用 HTTPS，并校验固定服务域名和证书。',
        riskCode: 'MCP_INSECURE_TRANSPORT',
        severity: 'medium',
        title: '远程 MCP 使用未加密连接',
      }))
    }
    if (installation.packageName && !installation.version && /^(?:npx|pnpx|bunx)$/i.test(installation.command ?? '')) {
      findings.push(createStaticFinding({
        artifactPath,
        description: '包执行器未声明固定版本，未来解析到的代码可能发生变化。',
        publicSummary: 'MCP 包未锁定版本。',
        recommendation: '声明精确版本或不可变包摘要，并在升级后重新评测。',
        riskCode: 'MCP_UNPINNED_PACKAGE',
        severity: 'medium',
        title: 'MCP 依赖未锁定版本',
      }))
    }
  })
  return findings
}
