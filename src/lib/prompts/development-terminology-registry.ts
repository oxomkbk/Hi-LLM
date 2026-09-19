export const DEVELOPMENT_TERMINOLOGY_SLUGS = {
  aiAgents: 'dev-terms-ai-agents',
  backendData: 'dev-terms-backend-data',
  contentDisplay: 'dev-terms-content-display',
  deploymentOperations: 'dev-terms-deployment-operations',
  designStyles: 'dev-terms-design-styles',
  feedbackNavigation: 'dev-terms-feedback-navigation',
  formControls: 'dev-terms-form-controls',
  gitCollaboration: 'dev-terms-git-collaboration',
  layoutResponsive: 'dev-terms-layout-responsive',
  productPlanning: 'dev-terms-product-planning',
  toolingTesting: 'dev-terms-tooling-testing',
  visualMotion: 'dev-terms-visual-motion',
  webBasics: 'dev-terms-web-basics',
} as const

export const DEVELOPMENT_TERMINOLOGY_SLUG_LIST = Object.values(DEVELOPMENT_TERMINOLOGY_SLUGS)

export type DevelopmentTerminologySlug = typeof DEVELOPMENT_TERMINOLOGY_SLUG_LIST[number]
