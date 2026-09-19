import ServicesShowcase from './services-showcase'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: `技术开发服务 | ${process.env.NEXT_PUBLIC_APP_NAME}`,
  description: '程序开发、网站与软件开发、脚本自动化、数据采集、数据大屏、企业级 AI 定制，以及软件安装、系统清理、电脑性能优化与故障排查服务。',
  keywords: ['程序开发', '网站开发', '软件开发', '自动化开发', '爬虫开发', '数据采集', '数据大屏', '企业级 AI 定制', '电脑技术支持', '软件安装', '系统清理', '电脑性能优化', '电脑故障排查'],
  openGraph: {
    title: `技术开发服务 | ${process.env.NEXT_PUBLIC_APP_NAME}`,
    description: '从复杂业务开发到电脑系统诊断，以工程化方式解决软件与设备问题。',
    type: 'website',
  },
}

export default function ServicesPage() {
  return (
    <div className="services-full-bleed">
      <ServicesShowcase />
    </div>
  )
}
