import { getAdminEmailSettings } from '@/lib/email/settings'

import EmailSettingsForm from '../components/email-settings-form'

export const dynamic = 'force-dynamic'

export default async function AdminEmailPage() {
  return <EmailSettingsForm initialSettings={await getAdminEmailSettings()} />
}
