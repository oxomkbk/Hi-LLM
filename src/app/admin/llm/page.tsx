import { getAdminLlmSettings } from '@/lib/llm/settings'

import LlmSettingsForm from '../components/llm-settings-form'

export const dynamic = 'force-dynamic'

export default async function AdminLlmPage() {
  return <LlmSettingsForm initialSettings={await getAdminLlmSettings()} />
}
