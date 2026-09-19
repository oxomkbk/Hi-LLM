import { createStaticFinding } from './static-finding'
import { findActionableTextIndex, findDirectiveTextIndex } from './static-text-context'

import type { NormalizedSecurityFinding } from '../finalize'

export interface PromptAssetPayload {
  downloadable: boolean
  entrypoint: boolean
  path: string
  role: string
  sha256: string
}

export interface PromptDocumentPayload {
  content: string
  language: string
  path: string
  role: string
}

export interface PromptPayload {
  assets: PromptAssetPayload[]
  documents: PromptDocumentPayload[]
}

export function analyzePromptPayload(payload: PromptPayload) {
  const findings: NormalizedSecurityFinding[] = []
  for (const document of payload.documents) {
    for (const text of promptTextSegments(document.path, document.content)) {
      addTextFinding(findings, document.path, text, {
        directive: true,
        pattern: /(?:ignore|disregard|override)\s+(?:all\s+)?(?:(?:previous|prior)\s+)?(?:(?:system|developer)\s+)?(?:instructions?|messages?)|忽略(?:之前|以上|系统|开发者).{0,12}(?:指令|消息)/i,
        recommendation: '删除覆盖系统或开发者指令的内容，并把必要的角色说明改为明确、局部的任务约束。',
        riskCode: 'PROMPT_INSTRUCTION_OVERRIDE',
        severity: 'high',
        title: '发现指令覆盖或提示词劫持模式',
      })
      addTextFinding(findings, document.path, text, {
        directive: true,
        pattern: /(?:show|print|reveal|return|provide|输出|显示|返回|提供|暴露|泄露)[^\n]{0,80}(?:api[-_ ]?key|password|access[-_ ]?token|private[-_ ]?key|credential|secret|密钥|密码|访问令牌|秘密)|(?:api[-_ ]?key|password|access[-_ ]?token|private[-_ ]?key|credential|secret|密钥|密码|访问令牌|秘密)[\s:：,，=\-]{0,12}(?:show|print|reveal|return|provide|输出|显示|返回|提供|暴露|泄露)/i,
        recommendation: '不要要求模型输出秘密或凭据；改用受控变量名和最小权限的服务端注入。',
        riskCode: 'PROMPT_SECRET_REQUEST',
        severity: 'high',
        title: '提示词要求读取或输出秘密信息',
      })
      addTextFinding(findings, document.path, text, {
        directive: true,
        pattern: /(?:send|upload|post|exfiltrat|传输|上传|发送).{0,100}(?:api[-_ ]?key|password|token|private[-_ ]?key|credential|secret|密钥|密码|令牌|秘密)/i,
        recommendation: '移除向外部地址发送秘密的步骤，并将外部通信限制为经过允许列表验证的非敏感数据。',
        riskCode: 'PROMPT_DATA_EXFILTRATION',
        severity: 'critical',
        title: '提示词包含秘密数据外传指令',
      })
      addTextFinding(findings, document.path, text, {
        pattern: /(?:atob\s*\(|fromCharCode\s*\(|base64).{0,80}(?:eval|execute|运行|执行)/i,
        recommendation: '删除编码后执行的内容，改为可审计的明文步骤，并禁止动态执行。',
        riskCode: 'PROMPT_OBFUSCATED_EXECUTION',
        severity: 'high',
        title: '提示词包含编码或混淆执行模式',
      })
    }
  }
  for (const asset of payload.assets) {
    if (/\.(?:bat|cmd|com|exe|js|mjs|ps1|sh)$/i.test(asset.path)) {
      findings.push(createStaticFinding({
        artifactPath: asset.path,
        description: 'Prompt 资源包含可执行或脚本扩展名；平台不会执行该文件，但发布前需要人工核对来源和用途。',
        publicSummary: '资源包包含需要人工核对的可执行内容。',
        recommendation: '移除可执行附件，或改为纯文本示例并在受控环境中独立审核。',
        riskCode: 'PROMPT_EXECUTABLE_ASSET',
        severity: 'high',
        title: '资源包包含可执行文件',
      }))
    }
  }
  return findings
}

function addTextFinding(
  findings: NormalizedSecurityFinding[],
  path: string,
  text: string,
  rule: { directive?: boolean, pattern: RegExp, recommendation: string, riskCode: string, severity: 'critical' | 'high', title: string },
) {
  if (findings.some(finding => finding.artifactPath === path && finding.riskCode === rule.riskCode))
    return
  const matchIndex = rule.directive
    ? findDirectiveTextIndex(text, rule.pattern)
    : findActionableTextIndex(text, rule.pattern)
  if (matchIndex < 0)
    return
  const startLine = text.slice(0, matchIndex).split('\n').length
  findings.push(createStaticFinding({
    artifactPath: path,
    description: `${rule.title}。匹配证据已脱敏，管理员应结合上下文确认是否为真实风险。`,
    evidenceRedacted: '[MATCH_REDACTED]',
    publicSummary: rule.title,
    recommendation: rule.recommendation,
    riskCode: rule.riskCode,
    severity: rule.severity,
    startLine,
    title: rule.title,
  }))
}

function collectJsonStrings(value: unknown, result: string[]) {
  if (result.length >= 10_000)
    return
  if (typeof value === 'string') {
    result.push(value)
    return
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectJsonStrings(item, result))
    return
  }
  if (value && typeof value === 'object')
    Object.values(value).forEach(item => collectJsonStrings(item, result))
}

function promptTextSegments(path: string, text: string) {
  if (!/\.json$/i.test(path))
    return [text]
  try {
    const result: string[] = []
    collectJsonStrings(JSON.parse(text), result)
    return result
  }
  catch {
    return [text]
  }
}
