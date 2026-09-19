import type { CatalogAiScope } from './types'

interface CatalogAiSurfaceConfig {
  assistantLabel: string
  emptyAnswer: string
  inputLabel: string
  modeBackLabel: string
  placeholder: string
  progressLabel: string
  resultsAriaLabel: string
  subject: string
  triggerLabel: string
}

export const CATALOG_AI_SURFACES: Record<CatalogAiScope, CatalogAiSurfaceConfig> = {
  navigation: {
    assistantLabel: 'AI 导航建议',
    emptyAnswer: '导航库里暂时还没有可推荐的网站。',
    inputLabel: '描述你想找的网站',
    modeBackLabel: '网页搜索',
    placeholder: '你想找什么网站？',
    progressLabel: '正在理解需求并检索导航库',
    resultsAriaLabel: '推荐网站',
    subject: '网站',
    triggerLabel: 'AI 找站',
  },
  skills: {
    assistantLabel: 'AI Skills 建议',
    emptyAnswer: 'Skills 目录里暂时还没有可推荐的能力。',
    inputLabel: '描述你需要的 Agent 能力',
    modeBackLabel: '目录搜索',
    placeholder: '描述任务，让 AI 推荐 Skill…',
    progressLabel: '正在理解任务并检索 Skills',
    resultsAriaLabel: '推荐 Skills',
    subject: 'Skill',
    triggerLabel: 'AI 找 Skill',
  },
  mcp: {
    assistantLabel: 'AI MCP 建议',
    emptyAnswer: 'MCP 目录里暂时还没有可推荐的服务。',
    inputLabel: '描述你要连接的工具或数据',
    modeBackLabel: '目录搜索',
    placeholder: '描述连接需求，让 AI 推荐 MCP…',
    progressLabel: '正在理解连接需求并检索 MCP',
    resultsAriaLabel: '推荐 MCP Server',
    subject: 'MCP Server',
    triggerLabel: 'AI 找 MCP',
  },
  prompts: {
    assistantLabel: 'AI Prompts 建议',
    emptyAnswer: 'Prompts 目录里暂时还没有可推荐的内容。',
    inputLabel: '描述你想生成的内容或效果',
    modeBackLabel: '目录搜索',
    placeholder: '描述目标，让 AI 推荐 Prompt…',
    progressLabel: '正在理解创作目标并检索 Prompts',
    resultsAriaLabel: '推荐 Prompts',
    subject: 'Prompt',
    triggerLabel: 'AI 找 Prompt',
  },
  wonderland: {
    assistantLabel: 'AI 社区建议',
    emptyAnswer: '妙妙屋里暂时还没有可推荐的内容。',
    inputLabel: '描述你想了解的问题或社区动态',
    modeBackLabel: '社区浏览',
    placeholder: '查找最新问题或社区新闻…',
    progressLabel: '正在检索最新问题与社区新闻',
    resultsAriaLabel: '妙妙屋推荐内容',
    subject: '社区内容',
    triggerLabel: 'AI 问社区',
  },
  works: {
    assistantLabel: 'AI 作品建议',
    emptyAnswer: '作品广场里暂时还没有匹配的公开作品。',
    inputLabel: '描述你想找的作品或实现方式',
    modeBackLabel: '作品搜索',
    placeholder: '描述用途、技术或作品类型…',
    progressLabel: '正在检索作品标题、说明与 README 内容',
    resultsAriaLabel: '推荐社区作品',
    subject: '社区作品',
    triggerLabel: 'AI 找作品',
  },
}
