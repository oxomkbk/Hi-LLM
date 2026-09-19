'use client'
import { AppProgressProvider as ProgressProvider } from '@bprogress/next'
import { Toast } from '@heroui/react'
import { usePathname } from 'next/navigation'
import { ViewTransition } from 'react'

import AccessSettingsProvider from '@/components/AccessSettingsProvider'
import BackTop from '@/components/BackTop'
import Footer from '@/components/Footer'
import Header from '@/components/Header'
import TranslationProvider from '@/components/TranslationProvider'
import { isEditorWorkspaceRoute, isProfileRoute } from '@/lib/routes/public-shell'

import type { FC, PropsWithChildren } from 'react'

const Providers: FC<PropsWithChildren> = ({ children }) => {
  const pathname = usePathname()
  const isAdminRoute = pathname.startsWith('/admin')
  const editorWorkspaceRoute = isEditorWorkspaceRoute(pathname)
  const profileRoute = isProfileRoute(pathname)
  const main = (
    <main id="main-content" data-editor-workspace-route={editorWorkspaceRoute || undefined} className={`app-shell-main flex min-h-0 flex-1 flex-col ${isAdminRoute || editorWorkspaceRoute ? 'min-h-screen' : ''} ${profileRoute ? 'profile-route-main' : ''}`}>
      <div className={editorWorkspaceRoute ? 'flex min-h-screen w-full flex-1 flex-col' : isAdminRoute ? 'flex min-h-screen w-full flex-1 flex-col' : `container mx-auto flex flex-1 flex-col gap-4 p-4 ${profileRoute ? 'profile-route-container' : ''}`}>
        {children}
      </div>
    </main>
  )
  const shell = (
    <>
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-50 rounded-lg bg-foreground px-3 py-2 text-xs font-bold text-background focus:not-sr-only"
      >
        跳到主要内容
      </a>
      {/* 后台使用独立控制台壳层，不复用前台导航。 */}
      {!isAdminRoute && !editorWorkspaceRoute && <Header />}
      {/* 后台强调连续操作，不叠加前台的整页视图过渡。 */}
      {isAdminRoute ? main : <ViewTransition name="blur-slide">{main}</ViewTransition>}
      {/* 底部版权 */}
      {!isAdminRoute && !editorWorkspaceRoute && (
        <div className="app-shell-footer">
          <Footer />
        </div>
      )}
      {!isAdminRoute && !editorWorkspaceRoute && <BackTop />}
    </>
  )

  return (
    <ProgressProvider color="var(--accent)" options={{ showSpinner: false }} shallowRouting>
      {isAdminRoute
        ? shell
        : (
            <AccessSettingsProvider>
              <TranslationProvider>{shell}</TranslationProvider>
            </AccessSettingsProvider>
          )}
      <Toast.Provider placement="top" />
    </ProgressProvider>
  )
}
export default Providers
