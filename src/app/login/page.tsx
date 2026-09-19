import { getPublicSiteAccessSettings } from '@/lib/access-settings/service'

import LoginForm from './login-form'

export const dynamic = 'force-dynamic'

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [accessSettings, query] = await Promise.all([
    getPublicSiteAccessSettings(),
    searchParams,
  ])
  const callbackError = readSingleValue(query.error)
  const authError = readSingleValue(query.authError)
    ?? (callbackError === 'ACCESS_REGISTRATION_DISABLED_V1'
      ? 'registration-disabled'
      : callbackError === 'ACCESS_EMAIL_NOT_ALLOWED_V1'
        ? 'email-not-allowed'
        : undefined)

  return (
    <LoginForm
      authError={authError}
      emailAccessMode={accessSettings.emailAccessMode}
      registrationEnabled={accessSettings.registrationEnabled}
    />
  )
}

function readSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}
