export const ACCOUNT_SECTION_IDS = ['overview', 'profile', 'appearance', 'security'] as const

export type AccountSection = typeof ACCOUNT_SECTION_IDS[number]

export function normalizeAccountSection(value: string | string[] | undefined): AccountSection {
  const section = Array.isArray(value) ? value[0] : value
  return ACCOUNT_SECTION_IDS.includes(section as AccountSection) ? section as AccountSection : 'overview'
}
