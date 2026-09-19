import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

import { createStaticFinding } from './static-finding'
import { findActionableTextIndex, findDirectiveTextIndex, isActionDirective, isSafetyProhibition } from './static-text-context'

import type { AcquiredSourceFile } from '../acquisition/manifest'
import type { SecurityCoverageInput } from '../coverage'
import type { NormalizedSecurityFinding } from '../finalize'

const TEXT_FILE_PATTERN = /(?:^|\/)(?:skill|readme)\.md$|\.(?:cjs|css|go|html?|java|js|json|jsx|md|mdx|mjs|php|ps1|py|rb|rs|sh|toml|ts|tsx|txt|yaml|yml)$/i
const EXECUTABLE_FILE_PATTERN = /\.(?:bat|cmd|com|exe|ps1|sh)$/i
const REMOTE_FETCH_PATTERN = /(?:curl|wget)\b[^\n|]{0,240}\|&?([^\n]{0,160})/gi
const REMOVE_COMMAND_PATTERN = /\brm\s+([^\n;&|`]+)/gi
const ENGLISH_TRANSFER_PATTERN = /\b(?:send|sends|sending|sent|upload|uploads|uploaded|uploading|post|posts|posted|posting|exfiltrate|exfiltrates|exfiltrated|exfiltrating|exfiltration)\b/i
const ENGLISH_SENSITIVE_DATA_PATTERN = /\b(?:token|tokens|secret|secrets|credential|credentials|private\s+key|private\s+keys|api\s+key|api\s+keys)\b/i
const ENGLISH_CONTENT_DATA_PATTERN = /\b(?:content|document|documents|file|files|image|images|workspace|workspaces|conversation|conversations|history|histories)\b/i
const BRACED_HOME_REFERENCE = '$' + '{HOME}'
const UNBOUNDED_REMOVAL_TARGETS = new Set([
  '/',
  '/*',
  '~',
  '~/',
  '~/*',
  '$HOME',
  '$HOME/',
  '$HOME/*',
  BRACED_HOME_REFERENCE,
  `${BRACED_HOME_REFERENCE}/`,
  `${BRACED_HOME_REFERENCE}/*`,
  '$PWD',
  '$PWD/',
  '$PWD/*',
  '.',
  './',
  './*',
  '..',
  '../',
  '../*',
  '*',
])

export interface PlatformSkillPayload {
  description: string
  installCommand: string | null
  name: string
  platforms: string[]
  sourceKind: 'external_page' | 'git_repository' | 'platform_content'
  sourceUrl: string | null
  summary: string
  version: string | null
}

interface DedicatedSkillRule extends Omit<SkillRule, 'pattern'> {
  findIndex: (content: string) => number
  primaryOnly?: boolean
}

interface SkillRule {
  description: string
  pattern: RegExp
  recommendation: string
  riskCode: string
  severity: 'critical' | 'high' | 'medium'
  title: string
}

export function buildPlatformSkillCoverage(input: {
  fileCount: number
  inspectedPaths: readonly string[]
  sourceUnavailable: boolean
}): SecurityCoverageInput {
  const includedCount = input.inspectedPaths.length
  return {
    included: [...input.inspectedPaths],
    level: 'partial',
    partitions: {
      platformContent: {
        includedCount,
        skippedCount: Math.max(0, input.fileCount - includedCount),
        status: includedCount === input.fileCount ? 'complete' : 'partial',
      },
      source: { includedCount: 0, skippedCount: 1, status: 'partial' },
    },
    skipped: [
      {
        reason: '未执行第三方代码或运行时行为；当前结论基于站内材料和平台静态规则',
        ref: 'skill/isolated-deep-scanner',
      },
      input.sourceUnavailable
        ? {
            reason: '公开源码本次未形成可用的优先文档，当前依据为平台保存的名称、说明、安装声明与来源地址',
            ref: 'skill/source-unavailable',
          }
        : {
            reason: '外部来源不是受支持的公开 Git 仓库，本次仅评测平台内已发布的说明、配置与调用内容',
            ref: 'skill/external-source-page',
          },
    ],
    sourceRevision: null,
  }
}

const RULES: SkillRule[] = [
  {
    description: '内容使用动态命令执行接口；这类能力可能是本地开发工具的一部分，但运行前仍需确认参数来源与权限边界。',
    pattern: /child_process\.exec|shell\s*=\s*true|os\.system|eval\s*\(/i,
    recommendation: '优先使用参数数组和固定命令；确需动态执行时，应校验输入、限制工作目录，并在隔离环境中运行。',
    riskCode: 'SKILL_DYNAMIC_EXECUTION',
    severity: 'medium',
    title: '包含动态命令执行能力',
  },
  {
    description: 'Skill 包含编码内容解码后执行的模式，会降低人工审查与追踪能力。',
    pattern: /(?:base64|atob\s*\(|fromCharCode\s*\().{0,160}(?:eval|exec|运行|执行)/i,
    recommendation: '移除混淆和动态执行，使用可审计的明文步骤与固定依赖。',
    riskCode: 'SKILL_OBFUSCATED_EXECUTION',
    severity: 'high',
    title: '包含混淆执行模式',
  },
  {
    description: '内容声明了过宽的文件或系统操作范围，可能超出完成任务所需权限。',
    pattern: /(?:entire|all)\s+(?:file\s*system|home\s*directory|workspace)|(?:整个|全部)(?:文件系统|主目录|工作区)/i,
    recommendation: '把文件访问限制在用户明确选择的目录，并逐项说明需要的读写权限。',
    riskCode: 'SKILL_EXCESSIVE_SCOPE',
    severity: 'medium',
    title: '请求过宽的本地访问范围',
  },
]

const DEDICATED_RULES: DedicatedSkillRule[] = [
  {
    description: 'Skill 主动要求覆盖系统或开发者指令，可能改变 Agent 的安全边界。',
    findIndex: findInstructionOverrideIndex,
    primaryOnly: true,
    recommendation: '删除覆盖上级指令的内容，把必要的角色说明改为局部、明确且不可越权的任务约束。',
    riskCode: 'SKILL_INSTRUCTION_OVERRIDE',
    severity: 'high',
    title: '发现主动指令覆盖',
  },
  {
    description: 'Skill 明确要求读取通用凭据目录、密钥链或私钥，可能超出完成任务所需的最小权限。',
    findIndex: findBroadSecretAccessIndex,
    primaryOnly: true,
    recommendation: '不要读取用户的通用凭据目录或密钥链；改为声明并读取完成任务所需的单个凭据字段。',
    riskCode: 'SKILL_BROAD_SECRET_ACCESS',
    severity: 'high',
    title: '请求过宽的凭据访问',
  },
  {
    description: 'Skill 需要使用指定凭据或秘密变量；这是运行权限说明，单独不视为外传或阻断风险。',
    findIndex: findSecretAccessIndex,
    primaryOnly: true,
    recommendation: '仅配置完成任务所需的具体字段，优先使用环境变量或平台秘密存储，并避免写入日志和输出。',
    riskCode: 'SKILL_SECRET_ACCESS',
    severity: 'medium',
    title: '需要使用受保护的凭据',
  },
  {
    description: '内容包含下载后直接交给 Shell 或解释器执行的安装方式，存在供应链和版本漂移风险。',
    findIndex: findRemoteExecutionIndex,
    recommendation: '优先使用固定版本和完整性校验，并把下载与执行拆开以便核对。',
    riskCode: 'SKILL_UNSAFE_EXECUTION',
    severity: 'medium',
    title: '包含下载后直接执行的安装方式',
  },
  {
    description: '内容明确要求递归删除根目录、主目录、当前目录或通配范围，可能造成不可恢复的数据损失。',
    findIndex: findDestructiveRemovalIndex,
    recommendation: '删除该命令，或把清理范围限制在经过校验的固定构建目录。',
    riskCode: 'SKILL_DESTRUCTIVE_COMMAND',
    severity: 'critical',
    title: '包含破坏性删除命令',
  },
  {
    description: '内容明确要求把秘密信息发送到外部地址，存在敏感数据外传风险。',
    findIndex: findSensitiveDataExfiltrationIndex,
    recommendation: '移除秘密外传步骤；远程调用只传递完成任务所需的非敏感字段。',
    riskCode: 'SKILL_DATA_EXFILTRATION',
    severity: 'critical',
    title: '包含秘密信息外传指令',
  },
  {
    description: '内容声明会把用户选择的文件或工作区内容发送到明确外部服务，使用前需要核对字段和目标地址。',
    findIndex: findExternalContentTransferIndex,
    recommendation: '仅发送用户明确选择且完成任务必需的内容，并在调用前展示目标服务和字段范围。',
    riskCode: 'SKILL_EXTERNAL_DATA_TRANSFER',
    severity: 'medium',
    title: '包含外部内容传输能力',
  },
]

export function analyzeSkillFiles(files: readonly AcquiredSourceFile[], maxTextBytes: number) {
  const findings: NormalizedSecurityFinding[] = []
  const inspectedPaths: string[] = []
  const excerpts: Array<{ content: string, path: string }> = []
  let inspectedBytes = 0
  const hasSkillInstruction = files.some(file => isSkillInstructionPath(file.path))

  for (const file of files) {
    const matchedRiskCodes = new Set<string>()
    if (EXECUTABLE_FILE_PATTERN.test(file.path)) {
      findings.push(createStaticFinding({
        artifactPath: file.path,
        description: 'Skill 包含可执行脚本或程序附件；平台不会自动运行，实际执行前应确认来源、参数与权限范围。',
        publicSummary: 'Skill 包含可执行附件，运行前请确认来源和权限。',
        recommendation: '优先使用可读脚本并锁定依赖；对不透明二进制或来源不明的附件不要执行。',
        riskCode: 'SKILL_EXECUTABLE_FILE',
        severity: 'medium',
        title: '资源包包含可执行内容',
      }))
    }
    if (!TEXT_FILE_PATTERN.test(file.path) || inspectedBytes >= maxTextBytes)
      continue
    const remaining = Math.max(0, maxTextBytes - inspectedBytes)
    const bytes = file.bytes.subarray(0, remaining)
    const content = Buffer.from(bytes).toString('utf8')
    inspectedBytes += bytes.byteLength
    inspectedPaths.push(file.path)
    if (/^(?:skill|readme)\.md$/i.test(file.path) || /\/(?:skill|readme)\.md$/i.test(file.path))
      excerpts.push({ content: content.slice(0, 12_000), path: file.path })
    const primaryInstruction = !hasSkillInstruction || isSkillInstructionPath(file.path)

    for (const rule of DEDICATED_RULES) {
      if (rule.primaryOnly && !primaryInstruction)
        continue
      if (!primaryInstruction && rule.severity !== 'medium')
        continue
      const matchIndex = rule.findIndex(content)
      if (matchIndex < 0 || matchedRiskCodes.has(rule.riskCode))
        continue
      matchedRiskCodes.add(rule.riskCode)
      findings.push(createStaticFinding({
        artifactPath: file.path,
        description: rule.description,
        evidenceRedacted: '[MATCH_REDACTED]',
        publicSummary: rule.title,
        recommendation: rule.recommendation,
        riskCode: rule.riskCode,
        severity: rule.severity,
        startLine: content.slice(0, matchIndex).split('\n').length,
        title: rule.title,
      }))
    }

    for (const rule of RULES) {
      if (!primaryInstruction && rule.severity !== 'medium')
        continue
      const matchIndex = findActionableTextIndex(content, rule.pattern)
      if (matchIndex < 0 || matchedRiskCodes.has(rule.riskCode))
        continue
      matchedRiskCodes.add(rule.riskCode)
      findings.push(createStaticFinding({
        artifactPath: file.path,
        description: rule.description,
        evidenceRedacted: '[MATCH_REDACTED]',
        publicSummary: rule.title,
        recommendation: rule.recommendation,
        riskCode: rule.riskCode,
        severity: rule.severity,
        startLine: content.slice(0, matchIndex).split('\n').length,
        title: rule.title,
      }))
    }
  }
  return { excerpts, findings, inspectedBytes, inspectedPaths }
}

/**
 * Turns the content already reviewed and published by the platform into the same
 * file-shaped input used by the repository scanner. External catalogue pages are
 * deliberately not fetched: their copied description and install instructions are
 * the review boundary, and coverage reports that limitation to the user.
 */
export function buildPlatformSkillFile(payload: PlatformSkillPayload): AcquiredSourceFile {
  const sections = [
    `# ${payload.name}`,
    `## 摘要\n\n${payload.summary}`,
    `## 使用说明\n\n${payload.description}`,
    payload.platforms.length > 0 ? `## 适用平台\n\n${payload.platforms.join('、')}` : '',
    payload.version ? `## 版本\n\n${payload.version}` : '',
    payload.installCommand ? `## 安装或调用方式\n\n\`\`\`text\n${payload.installCommand}\n\`\`\`` : '',
    `## 来源声明\n\n${payload.sourceUrl ?? '站内原创内容（无外部来源地址）'}`,
  ].filter(Boolean)
  const bytes = Buffer.from(sections.join('\n\n'), 'utf8')
  return {
    bytes,
    path: 'SKILL.md',
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

function columnAt(content: string, index: number) {
  const lineStart = content.lastIndexOf('\n', Math.max(0, index - 1)) + 1
  return index - lineStart
}

function commandTokens(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((token) => {
      const structural = token.replace(/^[`"']+|[`"',;]+$/g, '')
      return UNBOUNDED_REMOVAL_TARGETS.has(structural)
        ? structural
        : structural.replace(/[.`"',;:)\]}]+$/g, '')
    })
    .filter(Boolean)
}

function findBroadSecretAccessIndex(content: string) {
  const pattern = /\b(?:read|open|print|show|return|list|enumerate|dump|copy)\b.{0,80}(?:\.ssh(?:\/\S*)?|\.aws(?:\/\S*)?|\.npmrc\b|keychain|private[_ -]?keys?|(?:all|any|available|stored|user['’]s)[^\n]{0,24}(?:credentials?|secrets?|access[_ -]?tokens?))|(?:读取|打开|输出|显示|列出|枚举|转储|复制).{0,80}(?:\.ssh|\.aws|密钥链|私钥|全部(?:凭据|密钥|秘密|令牌))/i
  let offset = 0
  for (const line of content.split('\n')) {
    pattern.lastIndex = 0
    const match = pattern.exec(line)
    if (match?.index !== undefined && isActionDirective(line, match.index))
      return offset + match.index
    offset += line.length + 1
  }
  return -1
}

function findDestructiveRemovalIndex(content: string) {
  REMOVE_COMMAND_PATTERN.lastIndex = 0
  for (const match of content.matchAll(REMOVE_COMMAND_PATTERN)) {
    const tokens = commandTokens(match[1] ?? '')
    const flags = tokens.filter(token => token.startsWith('-'))
    const target = tokens.find(token => !token.startsWith('-')) ?? ''
    const recursive = flags.some(flag => flag === '--recursive' || (!flag.startsWith('--') && flag.slice(1).includes('r')))
    const force = flags.some(flag => flag === '--force' || (!flag.startsWith('--') && flag.slice(1).includes('f')))
    if (recursive && force && UNBOUNDED_REMOVAL_TARGETS.has(target)
      && !isSafetyProhibition(lineAt(content, match.index ?? 0), columnAt(content, match.index ?? 0))) {
      return match.index ?? 0
    }
  }
  return -1
}

function findExternalContentTransferIndex(content: string) {
  return findTransferIndex(content, 'content')
}

function findInstructionOverrideIndex(content: string) {
  return findDirectiveTextIndex(
    content,
    /(?:ignore|disregard|override)\s+(?:all\s+)?(?:(?:previous|prior)\s+)?(?:(?:system|developer)\s+)?(?:instructions?|messages?)|忽略(?:之前|以上|系统|开发者).{0,16}(?:指令|消息)/i,
  )
}

function findRemoteExecutionIndex(content: string) {
  REMOTE_FETCH_PATTERN.lastIndex = 0
  for (const match of content.matchAll(REMOTE_FETCH_PATTERN)) {
    const tokens = commandTokens(match[1] ?? '')
    let cursor = 0
    for (let prefixes = 0; prefixes < 2 && cursor < tokens.length; prefixes++) {
      if (tokens[cursor] === 'sudo') {
        cursor += 1
        continue
      }
      if (tokens[cursor] !== 'env')
        break
      cursor += 1
      while (/^[a-z_]\w*=\S+$/i.test(tokens[cursor] ?? ''))
        cursor += 1
    }
    const executable = (tokens[cursor] ?? '').split('/').pop()?.toLowerCase()
    if (executable && ['bash', 'dash', 'ksh', 'node', 'perl', 'python', 'python3', 'ruby', 'sh', 'zsh'].includes(executable)
      && !isSafetyProhibition(lineAt(content, match.index ?? 0), columnAt(content, match.index ?? 0))) {
      return match.index ?? 0
    }
  }

  return -1
}

function findSecretAccessIndex(content: string) {
  const pattern = /\b(?:read|open|print|show|return)\b.{0,60}(?:\.ssh(?:\/\S*)?|\.aws(?:\/\S*)?|\.npmrc\b|keychain|credentials?|private[_ -]?keys?|api[_ -]?keys?|access[_ -]?tokens?|secrets?)|(?:读取|打开|输出|显示).{0,60}(?:访问令牌|私钥|密钥|凭据)/i
  let offset = 0
  for (const line of content.split('\n')) {
    pattern.lastIndex = 0
    const match = pattern.exec(line)
    if (match?.index !== undefined
      && findBroadSecretAccessIndex(line) < 0
      && isActionDirective(line, match.index)) {
      return offset + match.index
    }
    offset += line.length + 1
  }
  return -1
}

function findSensitiveDataExfiltrationIndex(content: string) {
  return findTransferIndex(content, 'sensitive')
}

function findTransferIndex(content: string, kind: 'content' | 'sensitive') {
  let offset = 0
  for (const line of content.split('\n')) {
    const normalized = line.normalize('NFC')
    const lower = normalized.toLowerCase()
    const englishTransfer = ENGLISH_TRANSFER_PATTERN.test(lower)
    const sensitiveData = ENGLISH_SENSITIVE_DATA_PATTERN.test(lower)
      || ['令牌', '秘密', '凭据', '私钥', '密钥'].some(token => normalized.includes(token))
    const contentData = ENGLISH_CONTENT_DATA_PATTERN.test(lower)
      || ['内容', '文档', '文件', '图片', '图像', '工作区', '会话', '历史'].some(token => normalized.includes(token))
    const externalTarget = [
      'http://',
      'https://',
      'webhook',
      'external server',
      'external endpoint',
      'external service',
      'remote server',
      'remote endpoint',
      'remote host',
    ].some(token => lower.includes(token))
    || ['外部地址', '外部服务器', '外部接口', '外部服务', '远程地址', '远程服务器', '远程接口', '第三方地址', '第三方服务器', '第三方接口', '第三方服务']
      .some(token => normalized.includes(token))
    const chineseTransfer = ['发送', '上传', '传输'].some(token => normalized.includes(token))
    const transfer = englishTransfer || chineseTransfer
    const transferIndex = Math.max(0, Math.min(
      ...[
        ...[...normalized.matchAll(/发送|上传|传输/g)].map(match => match.index ?? line.length),
        ...[...lower.matchAll(/\b(?:send|sends|sending|sent|upload|uploads|uploaded|uploading|post|posts|posted|posting|exfiltrate|exfiltrates|exfiltrated|exfiltrating|exfiltration)\b/g)].map(match => match.index ?? line.length),
      ],
    ))
    const relevant = kind === 'sensitive' ? sensitiveData : contentData && externalTarget
    if (transfer && relevant && isActionDirective(normalized, transferIndex))
      return offset
    offset += line.length + 1
  }
  return -1
}

function isSkillInstructionPath(path: string) {
  return /(?:^|\/)skill\.md$/i.test(path)
}

function lineAt(content: string, index: number) {
  const start = content.lastIndexOf('\n', Math.max(0, index - 1)) + 1
  const end = content.indexOf('\n', index)
  return content.slice(start, end === -1 ? content.length : end)
}
