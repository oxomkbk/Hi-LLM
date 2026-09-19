import { DEVELOPMENT_TERMINOLOGY_SLUGS } from './development-terminology-registry'

import type { DevelopmentTerminologySlug } from './development-terminology-registry'
import type { PromptGlossaryDocument, PromptGlossaryItem } from './glossary'

export interface GlossaryShowcaseDefinition {
  before: string
  outcome: string
  slug: DevelopmentTerminologySlug
  termId: string
}

export interface ResolvedGlossaryShowcase extends GlossaryShowcaseDefinition {
  item: PromptGlossaryItem
}

const SHOWCASES: Record<DevelopmentTerminologySlug, GlossaryShowcaseDefinition> = {
  [DEVELOPMENT_TERMINOLOGY_SLUGS.aiAgents]: {
    before: '我希望 AI 不只回答问题，还能自己查库存并在关键步骤让我确认。',
    outcome: 'AI 会理解何时调用工具、何时等待人工批准，以及怎样把结果带回对话。',
    slug: DEVELOPMENT_TERMINOLOGY_SLUGS.aiAgents,
    termId: 'tool-calling',
  },
  [DEVELOPMENT_TERMINOLOGY_SLUGS.backendData]: {
    before: '聊天消息不要每次刷新页面才能看到，最好能马上出现。',
    outcome: 'AI 会知道这不是普通轮询，而是一条需要重连和状态反馈的实时连接。',
    slug: DEVELOPMENT_TERMINOLOGY_SLUGS.backendData,
    termId: 'websocket',
  },
  [DEVELOPMENT_TERMINOLOGY_SLUGS.contentDisplay]: {
    before: '订单信息全挤在一起很乱，我想一眼看出每行是什么状态。',
    outcome: 'AI 会按列组织数据，补齐表头、状态和可扫描的行结构。',
    slug: DEVELOPMENT_TERMINOLOGY_SLUGS.contentDisplay,
    termId: 'table',
  },
  [DEVELOPMENT_TERMINOLOGY_SLUGS.deploymentOperations]: {
    before: '新版本上线后登录坏了，先赶紧恢复，再查哪里出了问题。',
    outcome: 'AI 会先恢复稳定版本并验证指标，不会在故障现场继续盲目修改。',
    slug: DEVELOPMENT_TERMINOLOGY_SLUGS.deploymentOperations,
    termId: 'rollback',
  },
  [DEVELOPMENT_TERMINOLOGY_SLUGS.designStyles]: {
    before: '我想要一点毛玻璃的感觉，但文字必须清楚，不能整页都雾蒙蒙。',
    outcome: 'AI 会把半透明和模糊限制在合适的浮层，同时保留对比度和回退样式。',
    slug: DEVELOPMENT_TERMINOLOGY_SLUGS.designStyles,
    termId: 'glassmorphism',
  },
  [DEVELOPMENT_TERMINOLOGY_SLUGS.feedbackNavigation]: {
    before: '保存成功后告诉我一下，但不要弹一个大窗口打断操作。',
    outcome: 'AI 会选择轻量提示而不是阻塞弹窗，并处理成功、失败和消失时机。',
    slug: DEVELOPMENT_TERMINOLOGY_SLUGS.feedbackNavigation,
    termId: 'toast',
  },
  [DEVELOPMENT_TERMINOLOGY_SLUGS.formControls]: {
    before: '保存按钮点下去以后像没反应一样，用户会一直重复点。',
    outcome: 'AI 会补齐处理中、成功和失败状态，并避免重复提交。',
    slug: DEVELOPMENT_TERMINOLOGY_SLUGS.formControls,
    termId: 'button',
  },
  [DEVELOPMENT_TERMINOLOGY_SLUGS.gitCollaboration]: {
    before: '我想试一个大改版，但又不想把现在能用的版本弄乱。',
    outcome: 'AI 会在独立开发线上完成实验，验证后再决定是否合入稳定主线。',
    slug: DEVELOPMENT_TERMINOLOGY_SLUGS.gitCollaboration,
    termId: 'branch',
  },
  [DEVELOPMENT_TERMINOLOGY_SLUGS.layoutResponsive]: {
    before: '这排卡片在电脑上正常，到了手机上全都挤在一行里。',
    outcome: 'AI 会按不同宽度重排布局，而不是简单把整页缩小。',
    slug: DEVELOPMENT_TERMINOLOGY_SLUGS.layoutResponsive,
    termId: 'responsive-design',
  },
  [DEVELOPMENT_TERMINOLOGY_SLUGS.productPlanning]: {
    before: '我要做会员中心，但现在只有想法，不知道应该先交付什么。',
    outcome: 'AI 会先围绕目标用户、核心价值和最小可验证范围组织工作。',
    slug: DEVELOPMENT_TERMINOLOGY_SLUGS.productPlanning,
    termId: 'mvp',
  },
  [DEVELOPMENT_TERMINOLOGY_SLUGS.toolingTesting]: {
    before: '我要确认结账流程真的能用，不只是某个函数跑通。',
    outcome: 'AI 会从用户入口走到最终结果，并检查关键页面、接口和状态是否协作。',
    slug: DEVELOPMENT_TERMINOLOGY_SLUGS.toolingTesting,
    termId: 'end-to-end-test',
  },
  [DEVELOPMENT_TERMINOLOGY_SLUGS.visualMotion]: {
    before: '打开抽屉时太生硬了，想让它自然一点，但不要拖拖拉拉。',
    outcome: 'AI 会定义属性、时长和缓动，让变化可感知但不妨碍操作。',
    slug: DEVELOPMENT_TERMINOLOGY_SLUGS.visualMotion,
    termId: 'transition',
  },
  [DEVELOPMENT_TERMINOLOGY_SLUGS.webBasics]: {
    before: '这张商品卡在好几个页面都出现了，我不想每个地方单独改。',
    outcome: 'AI 会把重复界面收敛成一个可复用单元，让样式和行为统一更新。',
    slug: DEVELOPMENT_TERMINOLOGY_SLUGS.webBasics,
    termId: 'component',
  },
}

export function getGlossaryShowcaseDefinition(slug: string) {
  return isDevelopmentTerminologySlug(slug) ? SHOWCASES[slug] : null
}

export function resolveGlossaryShowcase(slug: string, document: PromptGlossaryDocument): ResolvedGlossaryShowcase | null {
  const definition = getGlossaryShowcaseDefinition(slug)
  if (!definition)
    return null
  const item = document.sections.flatMap(section => section.items).find(item => item.id === definition.termId)
  return item ? { ...definition, item } : null
}

function isDevelopmentTerminologySlug(value: string): value is DevelopmentTerminologySlug {
  return Object.hasOwn(SHOWCASES, value)
}
