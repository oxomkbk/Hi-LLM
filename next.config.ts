import type { NextConfig } from 'next'

const FONT_ASSET_ORIGIN = (process.env.NEXT_PUBLIC_FONT_ASSET_ORIGIN
  || 'https://dhweb-1322083196.cos.ap-chengdu.myqcloud.com').replace(/\/+$/, '')

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  images: {
    unoptimized: true, // 禁用 Vercel 图片优化
  },
  // 允许开发资源跨域访问
  allowedDevOrigins: ['127.0.0.1'],
  async headers() {
    const headers = [
      { key: 'Content-Security-Policy-Report-Only', value: [
        'default-src \'self\'',
        'base-uri \'none\'',
        'object-src \'none\'',
        'frame-ancestors \'self\'',
        'script-src \'self\' \'unsafe-inline\' https://www.googletagmanager.com https://www.clarity.ms',
        `style-src 'self' 'unsafe-inline' ${FONT_ASSET_ORIGIN}`,
        `font-src 'self' ${FONT_ASSET_ORIGIN}`,
        'img-src \'self\' data: blob:',
        'connect-src \'self\' https://www.google-analytics.com https://analytics.google.com https://*.clarity.ms',
        'media-src \'self\' blob:',
      ].join('; ') },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
    ]

    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://')) {
      headers.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' })
    }
    return [{ source: '/(.*)', headers }]
  },
}

export default nextConfig
