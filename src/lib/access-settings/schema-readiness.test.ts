import { describe, expect, it } from 'vitest'

import {
  missingSiteAccessSettingsColumns,
  REQUIRED_SITE_ACCESS_SETTINGS_COLUMNS,
} from './schema-readiness'

describe('site access settings schema readiness', () => {
  it('reports every access column missing before the submission migration', () => {
    expect(missingSiteAccessSettingsColumns(['id', 'registration_enabled'])).toEqual(
      expect.arrayContaining([
        'website_submission_enabled',
        'website_submission_visible',
        'skill_submission_enabled',
        'mcp_submission_enabled',
        'prompt_submission_enabled',
        'wonderland_submission_enabled',
        'work_submission_enabled',
      ]),
    )
  })

  it('returns no missing columns for the current schema', () => {
    expect(missingSiteAccessSettingsColumns(REQUIRED_SITE_ACCESS_SETTINGS_COLUMNS)).toEqual([])
  })
})
