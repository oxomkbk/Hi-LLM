import { Buffer } from 'node:buffer'

import { createStaticFinding } from './static-finding'
import { findActionableTextIndex, findDirectiveTextIndex } from './static-text-context'

import type { AcquiredSourceFile } from '../acquisition/manifest'
import type { NormalizedSecurityFinding } from '../finalize'

const RULES = [
  {
    description: '源码文档包含下载后直接交给 Shell 或解释器执行的安装方式。',
    pattern: /(?:curl|wget)\b[^\n|]{0,240}\|&?\s*(?:sudo\s+)?(?:bash|dash|ksh|node|perl|python3?|ruby|sh|zsh)\b/i,
    recommendation: '改为版本固定、校验完整性的包安装方式，并把下载与执行拆开。',
    riskCode: 'MCP_SOURCE_UNSAFE_INSTALL',
    severity: 'medium' as const,
    title: 'MCP 源码文档包含下载后直接执行',
  },
  {
    description: '源码文档要求把密钥、令牌或凭据发送到外部地址。',
    pattern: /(?:send|upload|post|发送|上传|传输).{0,100}(?:api[-_ ]?key|password|token|private[-_ ]?key|credential|secret|密钥|密码|令牌|凭据)/i,
    recommendation: '删除秘密外传步骤，远程连接只传递完成任务所需的非敏感字段。',
    riskCode: 'MCP_SOURCE_SECRET_EXFILTRATION',
    severity: 'critical' as const,
    title: 'MCP 源码文档包含秘密外传指令',
  },
  {
    description: '源码材料使用动态命令执行接口，实际风险取决于参数是否可被外部输入控制。',
    pattern: /child_process\.exec|shell\s*=\s*true|os\.system|eval\s*\(/i,
    recommendation: '使用固定可执行文件和参数数组，并校验所有外部输入。',
    riskCode: 'MCP_SOURCE_DYNAMIC_EXECUTION',
    severity: 'medium' as const,
    title: 'MCP 源码材料包含动态命令执行',
  },
]

export function analyzeMcpSourceFiles(files: readonly AcquiredSourceFile[]) {
  const documents = files.map(file => ({
    content: Buffer.from(file.bytes).toString('utf8'),
    path: file.path,
  }))
  const findings: NormalizedSecurityFinding[] = []
  for (const document of documents) {
    for (const rule of RULES) {
      const matchIndex = rule.riskCode === 'MCP_SOURCE_SECRET_EXFILTRATION'
        ? findDirectiveTextIndex(document.content, rule.pattern)
        : findActionableTextIndex(document.content, rule.pattern)
      if (matchIndex < 0)
        continue
      findings.push(createStaticFinding({
        artifactPath: document.path,
        description: rule.description,
        evidenceRedacted: '[MATCH_REDACTED]',
        publicSummary: rule.title,
        recommendation: rule.recommendation,
        riskCode: rule.riskCode,
        severity: rule.severity,
        startLine: document.content.slice(0, matchIndex).split('\n').length,
        title: rule.title,
      }))
    }
  }
  return { documents, findings }
}
