import './globals.css'

import { Analytics } from '@vercel/analytics/next'
import { MotionConfig } from 'motion/react'
import { ThemeProvider } from 'next-themes'

import { GoogleUtilities, MicrosoftClarity } from '@/components/Analytics'
import pkg from '#/package.json'

import Provider from './Provider'

import type { Metadata } from 'next'

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'HiLLM NAV'
const APP_TITLE = process.env.NEXT_PUBLIC_APP_TITLE || '发现、收藏并分享值得访问的 AI 工具'
const APP_DESC = process.env.NEXT_PUBLIC_APP_DESC || 'AI 工具、Skills、MCP 与 Prompts 的开源导航和社区平台。'
const APP_KEYWORDS = process.env.NEXT_PUBLIC_APP_KEYWORDS || 'HiLLM NAV,AI 工具,Skills,MCP,Prompts,网址导航'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const OG_IMAGE_URL = `${APP_URL}/opengraph-image`
const FONT_ASSET_ORIGIN = (process.env.NEXT_PUBLIC_FONT_ASSET_ORIGIN
  || 'https://dhweb-1322083196.cos.ap-chengdu.myqcloud.com').replace(/\/+$/, '')
const FONT_STYLESHEET_URL = `${FONT_ASSET_ORIGIN}/hillm/fonts/v1/fonts.css`
const AUTHOR_NAME = process.env.NEXT_PUBLIC_AUTHOR_NAME || pkg.author.name
const VERCEL_ANALYTICS_ENABLED = Boolean(process.env.VERCEL) || process.env.NEXT_PUBLIC_VERCEL_ANALYTICS === 'true'

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: `${APP_TITLE} | ${APP_NAME}`,
  description: APP_DESC,
  keywords: APP_KEYWORDS,
  authors: [{ name: AUTHOR_NAME, url: pkg.author.url }],
  creator: AUTHOR_NAME,
  publisher: AUTHOR_NAME,
  icons: {
    icon: '/icon1.png',
    apple: '/apple-icon.png',
  },
  openGraph: {
    title: APP_NAME,
    description: APP_DESC,
    url: APP_URL,
    siteName: APP_NAME,
    images: [
      {
        url: OG_IMAGE_URL,
        width: 1200,
        height: 630,
      },
    ],
    locale: 'zh_CN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: APP_NAME,
    description: APP_DESC,
    creator: AUTHOR_NAME,
    images: [OG_IMAGE_URL],
  },
  manifest: `${APP_URL}/manifest.json`,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <link crossOrigin="anonymous" href={FONT_ASSET_ORIGIN} rel="preconnect" />
        <link crossOrigin="anonymous" href={FONT_STYLESHEET_URL} rel="stylesheet" />
        <meta name="version" content={pkg.version} />
        <meta name="apple-mobile-web-app-title" content={APP_NAME} />
        {/* Google 统计 */}
        <GoogleUtilities />
        {/* 微软统计 */}
        <MicrosoftClarity />
        {VERCEL_ANALYTICS_ENABLED ? <Analytics /> : null}
      </head>
      <body className="bg-background text-foreground flex min-h-screen flex-col">
        <ThemeProvider attribute="class" enableSystem={false}>
          <MotionConfig reducedMotion="user">
            <Provider>
              {children}
            </Provider>
          </MotionConfig>
        </ThemeProvider>
      </body>
    </html>
  )
}
