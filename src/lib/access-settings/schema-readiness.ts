export const REQUIRED_SITE_ACCESS_SETTINGS_COLUMNS = [
  'id',
  'registration_enabled',
  'email_access_mode',
  'email_allowlist',
  'content_detail_open_mode',
  'translation_enabled',
  'translation_languages',
  'translation_default_language',
  'website_submission_mode',
  'website_submission_enabled',
  'website_submission_visible',
  'skill_submission_mode',
  'skill_submission_enabled',
  'skill_submission_visible',
  'mcp_submission_mode',
  'mcp_submission_enabled',
  'mcp_submission_visible',
  'prompt_submission_enabled',
  'prompt_submission_visible',
  'wonderland_submission_enabled',
  'wonderland_submission_visible',
  'wonderland_composer_mode',
  'work_submission_enabled',
  'work_submission_visible',
  'config_version',
  'updated_by',
  'created_at',
  'updated_at',
] as const

export function missingSiteAccessSettingsColumns(columns: Iterable<string>) {
  const available = new Set(columns)
  return REQUIRED_SITE_ACCESS_SETTINGS_COLUMNS.filter(column => !available.has(column))
}
