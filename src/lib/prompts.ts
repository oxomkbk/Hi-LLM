import type {
  PromptAssetInput,
  PromptAssetRole,
  PromptContentKind,
  PromptDocumentInput,
  PromptDocumentRole,
  PromptSaveInput,
  PromptStatus,
} from '@/types'

export const PROMPT_CONTENT_KINDS: ReadonlyArray<{ description: string, label: string, value: PromptContentKind }> = [
  { description: '网页界面、组件、设计系统与样式代码', label: '网页 UI', value: 'web_ui' },
  { description: '摄影、插画与图像生成提示词', label: '图片', value: 'image' },
  { description: '镜头、运动、分镜与视频生成提示词', label: '视频', value: 'video' },
  { description: '框架、平台、设备与业务场景适配', label: '适配', value: 'adaptation' },
]

export const PUBLIC_PROMPTS_PAGE_SIZE = 24

export const PROMPT_DOCUMENT_ROLES: ReadonlyArray<{ label: string, value: PromptDocumentRole }> = [
  { label: '主提示词', value: 'prompt' },
  { label: '负向提示词', value: 'negative_prompt' },
  { label: 'README', value: 'readme' },
  { label: '设计说明', value: 'design' },
  { label: '样式文件', value: 'style' },
  { label: 'Design Tokens', value: 'tokens' },
  { label: '参数', value: 'parameters' },
  { label: '示例', value: 'example' },
  { label: '其他', value: 'other' },
]

const CONTENT_KIND_SET = new Set(PROMPT_CONTENT_KINDS.map(item => item.value))
const DOCUMENT_ROLE_SET = new Set(PROMPT_DOCUMENT_ROLES.map(item => item.value))
const ASSET_ROLE_SET = new Set<PromptAssetRole>(['attachment', 'cover', 'image', 'poster', 'video', 'web_preview'])
const STATUS_SET = new Set<PromptStatus>(['archived', 'draft', 'published'])

export function createPromptSlug(value: unknown) {
  const input = typeof value === 'string' ? value : ''
  const slug = input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80)
    .replace(/-+$/g, '')

  return slug.length >= 2 ? slug : `prompt-${crypto.randomUUID().slice(0, 8)}`
}

export async function readPromptJsonBody(request: Request, maxBytes = 4 * 1024 * 1024) {
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > maxBytes)
    throw new Error('提交内容过大')
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > maxBytes)
    throw new Error('提交内容过大')
  try {
    const body = JSON.parse(text)
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new Error('提交内容格式无效')
    return body as Record<string, unknown>
  }
  catch (error) {
    if (error instanceof Error && error.message === '提交内容格式无效')
      throw error
    throw new Error('JSON 格式无效')
  }
}

export function sanitizePromptAdminInput(input: Record<string, unknown>): PromptSaveInput {
  const title = readText(input.title, 120, '标题', true)
  const status = input.status ?? 'draft'
  const contentKind = input.contentKind
  if (!STATUS_SET.has(status as PromptStatus))
    throw new Error('Prompts 状态无效')
  if (!CONTENT_KIND_SET.has(contentKind as PromptContentKind))
    throw new Error('内容类型无效')

  const categoryIds = readUuidArray(input.categoryIds, '分类', 16)
  const primaryCategoryId = readUuid(input.primaryCategoryId, '主分类')
  if (!categoryIds.includes(primaryCategoryId))
    throw new Error('主分类必须包含在已选分类中')

  const documents = normalizeDocuments(input.documents)
  if (status === 'published' && !documents.some(document => document.role === 'prompt' && document.isPrimary && document.content.trim()))
    throw new Error('发布前必须设置一份主提示词')

  return {
    assets: normalizeAssets(input.assets),
    categoryIds,
    compatibility: readStringArray(input.compatibility, '适配项', 20, 40),
    contentKind: contentKind as PromptContentKind,
    documents,
    featured: readBoolean(input.featured, false, '精选状态'),
    primaryCategoryId,
    slug: createPromptSlug(readText(input.slug, 80, '访问地址') || title),
    sort: readInteger(input.sort, 1, 99, '排序'),
    status: status as PromptStatus,
    summary: readText(input.summary, 500, '简介', true),
    tags: readStringArray(input.tags, '标签', 12, 24),
    title,
  }
}

export function sanitizePromptSearchTerm(value: string | null) {
  return readText(value, 100, '搜索关键词')
    .replace(/[^\p{L}\p{N}\s+#._-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sanitizePromptSubmissionInput(input: Record<string, unknown>): PromptSaveInput {
  const title = readText(input.title, 120, '标题', true)
  const sanitized = sanitizePromptAdminInput({
    ...input,
    featured: false,
    slug: `${createPromptSlug(title)}-${crypto.randomUUID().slice(0, 6)}`,
    sort: 1,
    status: 'draft',
  })
  if (!sanitized.documents.some(document => document.role === 'prompt' && document.isPrimary && document.content.trim()))
    throw new Error('请填写主提示词，或从文件夹导入提示词文档')
  return sanitized
}

function normalizeAssets(value: unknown): PromptAssetInput[] {
  if (value === undefined)
    return []
  if (!Array.isArray(value) || value.length > 48)
    throw new Error('Prompt 素材格式无效')

  const fileIds = new Set<string>()
  let primaryCount = 0
  let entrypointCount = 0
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error(`第 ${index + 1} 个素材格式无效`)
    const source = item as Record<string, unknown>
    const fileId = readUuid(source.fileId, '素材编号')
    if (fileIds.has(fileId))
      throw new Error('同一个素材不能重复添加')
    fileIds.add(fileId)
    const role = source.role
    if (!ASSET_ROLE_SET.has(role as PromptAssetRole))
      throw new Error(`第 ${index + 1} 个素材角色无效`)
    const isPrimary = readBoolean(source.isPrimary, false, '主预览状态')
    const isEntrypoint = readBoolean(source.isEntrypoint, false, '预览入口状态')
    if (isPrimary)
      primaryCount += 1
    if (isEntrypoint)
      entrypointCount += 1
    if (primaryCount > 1)
      throw new Error('只能设置一个主预览素材')
    if (entrypointCount > 1)
      throw new Error('只能设置一个 HTML 预览入口')
    if (isEntrypoint && role !== 'web_preview')
      throw new Error('只有 HTML 预览可以设为预览入口')
    return {
      altText: readText(source.altText, 240, '素材说明') || null,
      fileId,
      isDownloadable: readBoolean(source.isDownloadable, role === 'attachment', '下载状态'),
      isEntrypoint,
      isPrimary,
      name: readText(source.name, 180, '素材名称', true),
      role: role as PromptAssetRole,
    }
  })
}

function normalizeDocuments(value: unknown): PromptDocumentInput[] {
  if (!Array.isArray(value))
    throw new Error('文档格式无效')
  if (value.length > 64)
    throw new Error('单个 Prompts 最多包含 64 份文档')

  const sourcePaths = new Set<string>()
  let primaryCount = 0
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error(`第 ${index + 1} 份文档格式无效`)
    const source = item as Record<string, unknown>
    const role = source.role
    if (!DOCUMENT_ROLE_SET.has(role as PromptDocumentRole))
      throw new Error(`第 ${index + 1} 份文档角色无效`)
    const sourcePath = normalizeRelativePath(readText(source.sourcePath, 300, '文档路径', true))
    if (sourcePaths.has(sourcePath))
      throw new Error(`文档路径重复：${sourcePath}`)
    sourcePaths.add(sourcePath)
    const isPrimary = readBoolean(source.isPrimary, false, '主文档状态')
    if (isPrimary) {
      if (role !== 'prompt')
        throw new Error('只有提示词文档可以设为主文档')
      primaryCount += 1
      if (primaryCount > 1)
        throw new Error('只能设置一份主提示词')
    }
    return {
      content: readText(source.content, 2_097_152, '文档内容', true),
      isPrimary,
      language: readText(source.language, 40, '文档语言') || 'text',
      name: readText(source.name, 180, '文档名称', true),
      role: role as PromptDocumentRole,
      sourcePath,
    }
  })
}

function normalizeRelativePath(value: string) {
  const path = value.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!path || path.startsWith('/') || path.includes('\0') || path.split('/').some(segment => !segment || segment === '.' || segment === '..'))
    throw new Error('文档路径无效')
  return path
}

function readBoolean(value: unknown, fallback: boolean, fieldName: string) {
  if (value === undefined)
    return fallback
  if (typeof value !== 'boolean')
    throw new Error(`${fieldName}格式无效`)
  return value
}

function readInteger(value: unknown, min: number, max: number, fieldName: string) {
  const result = value === undefined ? min : Number(value)
  if (!Number.isInteger(result) || result < min || result > max)
    throw new Error(`${fieldName}必须是 ${min} 到 ${max} 的整数`)
  return result
}

function readStringArray(value: unknown, fieldName: string, maxItems: number, maxLength: number) {
  if (value === undefined)
    return []
  if (!Array.isArray(value))
    throw new Error(`${fieldName}格式无效`)
  const items = [...new Set(value.map(item => readText(item, maxLength, fieldName, true)))]
  if (items.length > maxItems)
    throw new Error(`${fieldName}最多 ${maxItems} 项`)
  return items
}

function readText(value: unknown, maxLength: number, fieldName: string, required = false) {
  if (value === undefined || value === null) {
    if (required)
      throw new Error(`请填写${fieldName}`)
    return ''
  }
  if (typeof value !== 'string')
    throw new Error(`${fieldName}格式无效`)
  const result = Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0
      return code === 9 || code === 10 || code === 13 || (code > 31 && code !== 127)
    })
    .join('')
    .trim()
  if (required && !result)
    throw new Error(`请填写${fieldName}`)
  if (Array.from(result).length > maxLength)
    throw new Error(`${fieldName}不能超过 ${maxLength} 个字符`)
  return result
}

function readUuid(value: unknown, fieldName: string) {
  const result = readText(value, 36, fieldName, true).toLowerCase()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(result))
    throw new Error(`${fieldName}格式无效`)
  return result
}

function readUuidArray(value: unknown, fieldName: string, max: number) {
  if (!Array.isArray(value) || value.length === 0 || value.length > max)
    throw new Error(`请至少选择一个${fieldName}`)
  return [...new Set(value.map(item => readUuid(item, fieldName)))]
}
