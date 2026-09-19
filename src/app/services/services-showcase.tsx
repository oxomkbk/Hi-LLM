'use client'

import {
  ArrowRight,
  BroomMotion,
  ChartAreaStackedNormalized,
  Code,
  Cpu,
  DatabaseMagnifier,
  DisplayPulse,
  FolderArrowRight,
  Globe,
  HardDrive,
  PaperPlane,
  PlugConnection,
  Route,
  Server,
  ShieldCheck,
  Stethoscope,
  TerminalLine,
  Wrench,
} from '@gravity-ui/icons'
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react'
import { useRef } from 'react'

import { SERVICES_CONTACT_URL } from '@/lib/services-contact'

import type { MotionValue } from 'motion/react'
import type { CSSProperties } from 'react'

const CAPABILITY_FRAMES = [
  {
    index: '01',
    signal: 'APPLICATION SYSTEMS',
    title: '程序、网站与软件',
    statement: '不只是一个界面，而是一套能承接业务增长的数字系统。',
    description: '从面向客户的品牌体验，到承载复杂流程的业务平台、桌面工具与 API 服务，围绕真实使用场景构建。',
    tags: ['WEB PLATFORM', 'DESKTOP APP', 'BUSINESS SYSTEM', 'API'],
    icon: Code,
    accent: '#155eef',
    visual: 'application',
  },
  {
    index: '02',
    signal: 'AUTOMATION & DATA',
    title: '脚本、自动化与采集',
    statement: '把重复劳动改造成一条可观测、可恢复的数据流水线。',
    description: '连接业务规则、第三方系统与公开数据源，让采集、清洗、处理和通知稳定地自动运行。',
    tags: ['WORKFLOW', 'CRAWLER', 'ETL', 'INTEGRATION'],
    icon: Route,
    accent: '#00a896',
    visual: 'automation',
  },
  {
    index: '03',
    signal: 'VISUAL COMMAND',
    title: '数据大屏与可视化',
    statement: '让复杂数据被快速理解，而不是被更多图表淹没。',
    description: '从指标结构、信息层级到实时动效，为运营、生产和指挥场景建立清晰的可视化界面。',
    tags: ['DASHBOARD', 'REALTIME', 'DATA STORY', 'COMMAND UI'],
    icon: ChartAreaStackedNormalized,
    accent: '#ff5c35',
    visual: 'visual',
  },
  {
    index: '04',
    signal: 'ENTERPRISE INTELLIGENCE',
    title: '企业级 AI 定制',
    statement: '让模型连接知识、工具和权限，真正进入业务链路。',
    description: '围绕企业知识库、智能工作流、模型评测、审计和私有化要求，构建可靠的 AI 应用。',
    tags: ['RAG', 'AGENT', 'EVALUATION', 'PRIVATE AI'],
    icon: Cpu,
    accent: '#7357ff',
    visual: 'ai',
  },
  {
    index: '05',
    signal: 'SYSTEM SUPPORT',
    title: '电脑技术支持',
    statement: '系统变慢、软件装不上、环境反复报错，不必靠重装碰运气。',
    description: '面向个人与小团队，提供故障定位、软件与开发环境配置、系统清理、性能优化、迁移与日常维护。',
    tags: ['SOFTWARE SETUP', 'CLEANUP', 'PERFORMANCE', 'TROUBLESHOOTING'],
    icon: DisplayPulse,
    accent: '#e044ff',
    visual: 'support',
  },
] as const

const SUPPORT_SERVICES = [
  {
    code: 'SETUP',
    description: '常用办公、设计、开发工具、数据库与驱动的安装配置，处理版本冲突和依赖异常。',
    icon: Wrench,
    index: '01',
    title: '软件安装与环境配置',
  },
  {
    code: 'CLEAN',
    description: '清理缓存、临时文件、残留软件与无效启动项，释放空间并整理系统负担。',
    icon: BroomMotion,
    index: '02',
    title: '系统清理与空间治理',
  },
  {
    code: 'TUNE',
    description: '分析 CPU、内存、磁盘、散热与启动链路，定位卡顿、发热、掉速和响应迟缓。',
    icon: DisplayPulse,
    index: '03',
    title: '电脑性能优化',
  },
  {
    code: 'FIX',
    description: '排查崩溃、蓝屏、更新失败、服务异常、应用闪退和各类难以复现的系统问题。',
    icon: Stethoscope,
    index: '04',
    title: '系统故障与异常修复',
  },
  {
    code: 'LINK',
    description: '处理网络连接、打印机、蓝牙、显示器、存储设备与常见外设的连接故障。',
    icon: PlugConnection,
    index: '05',
    title: '网络与外设排查',
  },
  {
    code: 'MOVE',
    description: '新旧电脑资料迁移、目录规划与备份方案配置，让换机和升级过程更稳妥。',
    icon: FolderArrowRight,
    index: '06',
    title: '数据备份与迁移',
  },
  {
    code: 'GUARD',
    description: '检查异常启动项、账户权限、系统补丁与基础安全设置，减少持续性的环境风险。',
    icon: ShieldCheck,
    index: '07',
    title: '安全检查与基础加固',
  },
  {
    code: 'CARE',
    description: '维护办公与开发工具链、IDE、依赖和协作环境，为个人和小团队提供持续支持。',
    icon: HardDrive,
    index: '08',
    title: '办公与开发环境维护',
  },
] as const

const PROCESS = [
  {
    index: '01',
    code: 'SCOPE',
    title: '拆解问题',
    description: '明确目标、用户、约束、数据与优先级，把模糊想法变成可执行边界。',
  },
  {
    index: '02',
    code: 'PROVE',
    title: '验证关键路径',
    description: '先证明最重要的体验和技术链路，再投入完整工程，降低返工与方向风险。',
  },
  {
    index: '03',
    code: 'BUILD',
    title: '构建可交付系统',
    description: '实现前端、后端、数据和部署链路，以可维护、可测试、可观测为完成标准。',
  },
  {
    index: '04',
    code: 'EVOLVE',
    title: '上线并持续演进',
    description: '完成验收、部署与交接，在真实反馈中继续优化产品，而不是交付后失联。',
  },
] as const

const PRINCIPLES = [
  '关键决策有依据，不用技术名词掩盖问题',
  '每个阶段都有可检查的产物与边界',
  '代码、数据、部署和监控一起交付',
  '优先做真正产生价值的版本',
] as const

const KINETIC_WORDS = [
  'SOFTWARE',
  'WEB',
  'AUTOMATION',
  'DATA',
  'VISUAL',
  'ENTERPRISE AI',
  'SYSTEM SUPPORT',
] as const

const KINETIC_LOOP = [
  ...KINETIC_WORDS.map(word => ({ id: `a-${word}`, word, duplicate: false })),
  ...KINETIC_WORDS.map(word => ({ id: `b-${word}`, word, duplicate: true })),
]

const APPLICATION_NAV = [
  { id: 'code', icon: Code },
  { id: 'web', icon: Globe },
  { id: 'server', icon: Server },
  { id: 'data', icon: DatabaseMagnifier },
] as const

const SUPPORT_METRICS = [
  { id: 'cpu', label: 'CPU LOAD', value: '24%', width: '24%' },
  { id: 'memory', label: 'MEMORY', value: '58%', width: '58%' },
  { id: 'disk', label: 'DISK HEALTH', value: '96%', width: '96%' },
  { id: 'network', label: 'NETWORK', value: 'STABLE', width: '84%' },
] as const

const SUPPORT_EVENTS = [
  { id: 'startup', state: 'OPTIMIZED', task: 'startup.sequence' },
  { id: 'storage', state: 'CLEAN', task: 'storage.residue' },
  { id: 'runtime', state: 'HEALTHY', task: 'runtime.environment' },
] as const

const EASE_OUT = [0.16, 1, 0.3, 1] as const

type FrameAccentStyle = CSSProperties & { '--frame-accent': string }

export default function ServicesShowcase() {
  const heroRef = useRef<HTMLElement>(null)
  const capabilitiesRef = useRef<HTMLElement>(null)
  const shouldReduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll()
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  })
  const { scrollYProgress: capabilityProgress } = useScroll({
    target: capabilitiesRef,
    offset: ['start start', 'end end'],
  })
  const smoothPageProgress = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.35 })
  const heroCopyY = useTransform(heroProgress, [0, 1], [0, 64])
  const blueprintY = useTransform(heroProgress, [0, 1], [0, 130])
  const capabilityX = useTransform(capabilityProgress, [0, 1], ['0%', '-80%'])

  return (
    <div className="services-page">
      <motion.div
        aria-hidden="true"
        className="fixed inset-x-0 top-16 z-50 h-[3px] origin-left bg-[#155eef]"
        style={{ scaleX: smoothPageProgress }}
      />

      <section ref={heroRef} className="services-hero relative min-h-[calc(100svh-4rem)] overflow-hidden border-b border-black/12">
        <div aria-hidden="true" className="services-paper-grid absolute inset-0" />
        <div className="relative mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-[112rem] grid-rows-[auto_1fr_auto] px-4 sm:px-6 lg:px-10">
          <div className="grid grid-cols-2 border-x border-black/10 text-[8px] font-black tracking-[0.18em] text-black/42 uppercase sm:grid-cols-4 sm:text-[9px]">
            <span className="border-r border-black/10 px-3 py-3">Field / Digital systems</span>
            <span className="hidden border-r border-black/10 px-3 py-3 sm:block">Mode / Independent studio</span>
            <span className="hidden border-r border-black/10 px-3 py-3 sm:block">Region / China · Remote</span>
            <span className="px-3 py-3 text-right">
              Status /
              <span className="text-[#00a66a]">Available</span>
            </span>
          </div>

          <div className="grid items-center gap-10 border-x border-black/10 py-12 lg:grid-cols-[minmax(0,1.18fr)_minmax(32rem,0.82fr)] lg:gap-4 lg:py-0">
            <motion.div className="relative z-10 px-2 sm:px-5 lg:px-8" style={{ y: shouldReduceMotion ? 0 : heroCopyY }}>
              <motion.div
                animate={{ opacity: 1, x: 0 }}
                initial={{ opacity: 0, x: -28 }}
                transition={{ duration: 0.72, ease: EASE_OUT }}
                className="mb-8 flex items-center gap-4"
              >
                <span className="h-px w-14 bg-[#155eef]" />
                <span className="text-[9px] font-black tracking-[0.22em] text-[#155eef] uppercase sm:text-[10px]">Software engineering / 00—∞</span>
              </motion.div>

              <motion.h1
                animate={{ opacity: 1, y: 0 }}
                initial={{ opacity: 0, y: 44 }}
                transition={{ duration: 0.9, delay: 0.08, ease: EASE_OUT }}
                className="whitespace-nowrap text-[clamp(4rem,7.6vw,9.5rem)] leading-[0.98] font-black tracking-[-0.055em] text-black"
              >
                让代码，
                <span className="mt-1 block text-[#155eef] sm:pl-[0.28em]">推动业务。</span>
              </motion.h1>

              <motion.div
                animate={{ opacity: 1, y: 0 }}
                initial={{ opacity: 0, y: 26 }}
                transition={{ duration: 0.78, delay: 0.22, ease: EASE_OUT }}
                className="mt-10 grid max-w-4xl gap-7 border-t border-black/14 pt-6 sm:grid-cols-[1fr_auto] sm:items-end"
              >
                <p className="max-w-2xl text-sm leading-7 font-bold text-black/58 sm:text-base sm:leading-8">
                  程序、网站、软件、自动化、数据采集、可视化大屏、企业 AI 与电脑技术支持。把复杂问题拆清楚，再做成真正能运行的产品。
                </p>
                <a
                  href={SERVICES_CONTACT_URL}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="group inline-flex h-12 w-fit items-center gap-6 bg-black px-5 text-[10px] font-black tracking-[0.14em] text-white uppercase transition-[background-color,color,transform] hover:-translate-y-1 hover:bg-[#c6ff37] hover:text-black focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#155eef]"
                >
                  Discuss a build
                  <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" />
                </a>
              </motion.div>
            </motion.div>

            <BlueprintEngine offset={shouldReduceMotion ? 0 : blueprintY} />
          </div>

          <div className="grid grid-cols-[1fr_auto] border-x border-t border-black/10 text-[8px] font-black tracking-[0.16em] text-black/42 uppercase sm:grid-cols-[1fr_1fr_auto] sm:text-[9px]">
            <span className="px-3 py-3">Build / Observe / Improve</span>
            <span className="hidden border-l border-black/10 px-3 py-3 sm:block">No template · No black box</span>
            <a href="#capability-track" className="group flex items-center gap-3 border-l border-black/10 px-3 py-3 text-black transition-colors hover:bg-[#c6ff37]">
              Inspect capabilities
              <span aria-hidden="true" className="transition-transform group-hover:translate-y-1">↓</span>
            </a>
          </div>
        </div>
      </section>

      <KineticRail />

      <section ref={capabilitiesRef} id="capability-track" className="services-horizontal-stage relative h-[520vh] border-b border-black/12">
        <div className="services-horizontal-viewport sticky top-16 h-[calc(100svh-4rem)] overflow-hidden bg-[#e9e8e2]">
          <motion.div className="services-horizontal-track flex h-full w-[500vw]" style={{ x: capabilityX }}>
            {CAPABILITY_FRAMES.map((frame, index) => (
              <CapabilityFrame key={frame.index} frame={frame} index={index} />
            ))}
          </motion.div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-1 bg-black/10">
            <motion.div className="h-full origin-left bg-[#155eef]" style={{ scaleX: capabilityProgress }} />
          </div>
        </div>
      </section>

      <SystemSupportSection />

      <section className="relative border-b border-black/12 bg-[#f2f1ec] px-4 py-24 sm:px-6 sm:py-32 lg:px-10">
        <div className="mx-auto max-w-[112rem] border-x border-black/10">
          <div className="grid border-y border-black/10 lg:grid-cols-[0.7fr_1.3fr]">
            <Reveal className="border-b border-black/10 p-6 lg:border-b-0 lg:border-r lg:p-10">
              <TechnicalLabel index="07" label="DELIVERY METHOD" />
              <p className="mt-12 max-w-xs text-xs leading-6 font-bold text-black/48">
                A visible engineering pipeline. Every stage leaves evidence, not promises.
              </p>
            </Reveal>
            <Reveal delay={0.08} className="p-6 sm:p-10 lg:p-14">
              <h2 className="max-w-[12ch] text-5xl leading-[0.98] font-black tracking-[-0.055em] text-black sm:text-7xl lg:text-[7rem]">
                过程透明，
                <span className="block text-[#155eef]">结果才可控。</span>
              </h2>
            </Reveal>
          </div>

          <div>
            {PROCESS.map((step, index) => (
              <ProcessRow key={step.index} index={index} step={step} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-black px-4 py-20 text-white sm:px-6 sm:py-28 lg:px-10">
        <div className="mx-auto grid max-w-[112rem] border border-white/16 lg:grid-cols-[1.14fr_0.86fr]">
          <Reveal className="relative min-h-[38rem] overflow-hidden border-b border-white/16 p-5 sm:p-8 lg:border-b-0 lg:border-r lg:p-10">
            <div aria-hidden="true" className="services-console-grid absolute inset-0" />
            <div className="relative flex items-center justify-between border-b border-white/14 pb-4">
              <div className="flex items-center gap-3">
                <span className="size-2 bg-[#c6ff37] shadow-[0_0_18px_rgba(198,255,55,0.72)]" />
                <span className="text-[9px] font-black tracking-[0.18em] text-white/52 uppercase">Build telemetry / live</span>
              </div>
              <TerminalLine aria-hidden="true" className="size-4 text-[#c6ff37]" />
            </div>

            <div className="relative mt-10 grid min-h-[25rem] grid-rows-[1fr_auto]">
              <div className="space-y-5">
                {[
                  ['00:01.204', 'scope.map', 'READY'],
                  ['00:03.891', 'interface.prototype', 'VERIFIED'],
                  ['00:08.427', 'system.integrate', 'PASS'],
                  ['00:13.052', 'production.observe', 'ONLINE'],
                ].map(([time, task, state], index) => (
                  <motion.div
                    key={task}
                    initial={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.55, delay: index * 0.14, ease: EASE_OUT }}
                    viewport={{ once: true }}
                    whileInView={{ opacity: 1, x: 0 }}
                    className="grid grid-cols-[5.5rem_1fr_auto] gap-3 border-b border-white/9 pb-4 text-[9px] font-black tracking-[0.12em] uppercase sm:grid-cols-[7rem_1fr_auto] sm:text-[10px]"
                  >
                    <span className="text-white/28">{time}</span>
                    <span className="text-white/76">{task}</span>
                    <span className="text-[#c6ff37]">{state}</span>
                  </motion.div>
                ))}
              </div>
              <div className="flex items-end justify-between pt-10">
                <div>
                  <span className="block text-[9px] font-black tracking-[0.16em] text-white/34 uppercase">System state</span>
                  <span className="mt-2 block text-4xl font-black tracking-[-0.06em] text-[#c6ff37] sm:text-6xl">SHIP READY</span>
                </div>
                <TelemetryBars />
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1} className="flex flex-col justify-between p-6 sm:p-10 lg:p-12">
            <div>
              <TechnicalLabel index="08" invert label="ENGINEERING PRINCIPLES" />
              <h2 className="mt-14 text-[clamp(3.5rem,5.6vw,6rem)] leading-[1.03] font-black tracking-[-0.05em]">
                <span className="block whitespace-nowrap">炫酷之外，</span>
                <span className="block whitespace-nowrap text-white/38">必须可靠。</span>
              </h2>
            </div>
            <div className="mt-16 border-t border-white/16">
              {PRINCIPLES.map((principle, index) => (
                <div key={principle} className="grid grid-cols-[2rem_1fr] gap-4 border-b border-white/12 py-4">
                  <span className="text-[9px] font-black text-[#c6ff37]">
                    0
                    {index + 1}
                  </span>
                  <span className="text-xs leading-6 font-bold text-white/68 sm:text-sm">{principle}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section id="contact" className="relative overflow-hidden bg-[#c6ff37] px-4 py-20 text-black sm:px-6 sm:py-28 lg:px-10 lg:py-36">
        <div aria-hidden="true" className="services-cta-ruler absolute inset-0" />
        <div className="relative mx-auto max-w-[112rem] border-x border-black/14 px-4 sm:px-8 lg:px-12">
          <Reveal>
            <div className="flex items-center gap-4 text-[9px] font-black tracking-[0.2em] uppercase">
              <span className="size-2 bg-black" />
              Next project / Ready when you are
            </div>
            <h2 className="mt-12 max-w-[11ch] text-[clamp(4.2rem,11vw,12rem)] leading-[0.94] font-black tracking-[-0.06em]">
              说清问题。
              <span className="block pl-[0.2em]">做出产品。</span>
            </h2>
          </Reveal>

          <Reveal delay={0.1} className="mt-14 grid gap-8 border-t border-black/18 pt-7 sm:grid-cols-[1fr_auto] sm:items-end">
            <p className="max-w-xl text-sm leading-7 font-bold text-black/62 sm:text-base sm:leading-8">
              带上目标、现状，或者一个还没有成形的想法。先判断真正值得做什么，再讨论如何构建。
            </p>
            <a
              href={SERVICES_CONTACT_URL}
              rel="noopener noreferrer"
              target="_blank"
              className="group inline-flex h-14 w-fit items-center gap-8 bg-black px-6 text-[10px] font-black tracking-[0.15em] text-white uppercase transition-[background-color,color,transform] hover:-translate-y-1 hover:bg-white hover:text-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black"
            >
              Start the conversation
              <PaperPlane aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
            </a>
          </Reveal>
        </div>
      </section>
    </div>
  )
}

function ApplicationVisual() {
  return (
    <div className="relative h-full min-h-[24rem] overflow-hidden border border-black/16 bg-[#f7f6f1] p-4 sm:p-6">
      <div className="flex items-center justify-between border-b border-black/14 pb-3 text-[8px] font-black tracking-[0.16em] text-black/42 uppercase">
        <span>Runtime / app.shell</span>
        <span className="text-[#155eef]">Compiling</span>
      </div>
      <div className="mt-6 grid h-[calc(100%-2.5rem)] grid-cols-[3.5rem_1fr] border border-black/12">
        <div className="border-r border-black/12 bg-black p-3 text-white">
          {APPLICATION_NAV.map(({ id, icon: Icon }, index) => (
            <span key={id} className={`mb-3 grid size-8 place-items-center border border-white/16 ${index === 0 ? 'bg-[#155eef]' : 'text-white/36'}`}>
              <Icon aria-hidden="true" className="size-3.5" />
            </span>
          ))}
        </div>
        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-3 gap-px bg-black/10">
            {['INPUT', 'LOGIC', 'OUTPUT'].map((item, index) => (
              <div key={item} className={`px-2 py-3 text-[8px] font-black tracking-[0.14em] ${index === 1 ? 'bg-[#c6ff37] text-black' : 'bg-white text-black/42'}`}>{item}</div>
            ))}
          </div>
          <div className="mt-6 space-y-3">
            {[82, 64, 92, 46, 74].map((width, index) => (
              <motion.div
                key={width}
                initial={{ scaleX: 0 }}
                transition={{ duration: 0.7, delay: index * 0.1, ease: EASE_OUT }}
                viewport={{ once: true }}
                whileInView={{ scaleX: 1 }}
                className="h-2 origin-left bg-black/12"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <div className="aspect-[1.8] border border-black/12 bg-[#155eef] p-3 text-[8px] font-black tracking-[0.12em] text-white uppercase">Primary process</div>
            <div className="aspect-[1.8] border border-black/12 p-3 text-[8px] font-black tracking-[0.12em] text-black/48 uppercase">Secondary view</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AutomationVisual() {
  const nodes = [
    { label: 'SOURCE', top: '12%', left: '8%' },
    { label: 'COLLECT', top: '12%', left: '62%' },
    { label: 'CLEAN', top: '44%', left: '35%' },
    { label: 'STORE', top: '73%', left: '8%' },
    { label: 'TRIGGER', top: '73%', left: '64%' },
  ]

  return (
    <div className="services-node-field relative h-full min-h-[24rem] overflow-hidden border border-black/16 bg-[#0a1715] text-white">
      <svg aria-hidden="true" viewBox="0 0 600 440" className="absolute inset-0 size-full">
        <path d="M100 90 H390 Q430 90 430 130 V190 H300" className="services-flow-path" />
        <path d="M300 230 V320 H110" className="services-flow-path services-flow-path--delay" />
        <path d="M300 230 V320 H430" className="services-flow-path" />
      </svg>
      {nodes.map((node, index) => (
        <div key={node.label} className="absolute w-28 border border-white/18 bg-[#102520] p-3" style={{ left: node.left, top: node.top }}>
          <span className="block text-[8px] font-black tracking-[0.14em] text-white/38">
            0
            {index + 1}
          </span>
          <span className="mt-1 block text-[9px] font-black tracking-[0.12em] text-[#8df7d5]">{node.label}</span>
        </div>
      ))}
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between border-t border-white/14 pt-3 text-[8px] font-black tracking-[0.14em] text-white/38 uppercase">
        <span>Pipeline health</span>
        <span className="text-[#8df7d5]">05 nodes / online</span>
      </div>
    </div>
  )
}

function BlueprintEngine({ offset }: { offset: number | MotionValue<number> }) {
  const telemetry = [34, 62, 49, 78, 57, 92, 70, 100]

  return (
    <motion.div className="relative min-h-[34rem] border-l border-black/10 lg:min-h-[calc(100svh-10rem)]" style={{ y: offset }}>
      <div aria-hidden="true" className="services-blueprint-grid absolute inset-0" />
      <div className="absolute inset-4 border border-black/14 bg-[#ecebe5]/82 sm:inset-7 lg:inset-10">
        <div className="flex items-center justify-between border-b border-black/14 px-4 py-3 text-[8px] font-black tracking-[0.16em] text-black/42 uppercase">
          <span>System blueprint / BL-042</span>
          <span className="flex items-center gap-2 text-[#155eef]">
            <span className="size-1.5 bg-[#155eef]" />
            Live
          </span>
        </div>

        <div className="relative h-[calc(100%-2.5rem)] overflow-hidden p-5 sm:p-8">
          <div aria-hidden="true" className="services-blueprint-scan absolute inset-x-0 top-0 h-px bg-[#155eef] shadow-[0_0_24px_6px_rgba(21,94,239,0.26)]" />
          <div className="grid h-full grid-rows-[auto_1fr_auto]">
            <div className="grid grid-cols-3 gap-px bg-black/12 text-[7px] font-black tracking-[0.12em] uppercase sm:text-[8px]">
              <span className="bg-black px-3 py-2 text-white">Input / 12</span>
              <span className="bg-[#c6ff37] px-3 py-2 text-black">Logic / 08</span>
              <span className="bg-white px-3 py-2 text-black/44">Output / 04</span>
            </div>

            <div className="relative my-6 border border-black/12">
              <div className="absolute left-[12%] top-[12%] border border-black/14 bg-white px-3 py-2 text-[8px] font-black tracking-[0.12em]">REQUIREMENT</div>
              <div className="absolute right-[8%] top-[18%] border border-black/14 bg-[#155eef] px-3 py-2 text-[8px] font-black tracking-[0.12em] text-white">INTERFACE</div>
              <div className="absolute left-[37%] top-[44%] border border-black/14 bg-black px-4 py-3 text-[9px] font-black tracking-[0.12em] text-[#c6ff37]">ENGINE</div>
              <div className="absolute bottom-[13%] left-[10%] border border-black/14 bg-white px-3 py-2 text-[8px] font-black tracking-[0.12em]">DATABASE</div>
              <div className="absolute bottom-[11%] right-[9%] border border-black/14 bg-white px-3 py-2 text-[8px] font-black tracking-[0.12em]">DEPLOY</div>
              <svg aria-hidden="true" viewBox="0 0 520 330" className="absolute inset-0 size-full">
                <path d="M112 63 H260 V148" className="services-blueprint-path" />
                <path d="M422 82 H310 V148" className="services-blueprint-path services-blueprint-path--delay" />
                <path d="M260 180 V263 H110" className="services-blueprint-path" />
                <path d="M310 180 V260 H425" className="services-blueprint-path services-blueprint-path--delay" />
              </svg>
              <span className="services-blueprint-packet absolute left-[20%] top-[18%] size-2 bg-[#155eef]" />
            </div>

            <div className="grid grid-cols-[1fr_auto] items-end gap-6 border-t border-black/14 pt-4">
              <div>
                <span className="block text-[8px] font-black tracking-[0.14em] text-black/34 uppercase">Build integrity</span>
                <span className="mt-1 block text-2xl font-black tracking-[-0.06em] sm:text-4xl">SYSTEM / READY</span>
              </div>
              <div className="flex h-10 items-end gap-1">
                {telemetry.map((height, index) => (
                  <span key={height} className="services-blueprint-meter w-1.5 bg-[#155eef]" style={{ height: `${height}%`, animationDelay: `${index * 90}ms` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <span aria-hidden="true" className="absolute left-2 top-2 size-2 border-l border-t border-black/42" />
      <span aria-hidden="true" className="absolute bottom-2 right-2 size-2 border-b border-r border-black/42" />
    </motion.div>
  )
}

function CapabilityFrame({ frame, index }: { frame: (typeof CAPABILITY_FRAMES)[number], index: number }) {
  const Icon = frame.icon

  return (
    <article className="services-frame relative grid h-full w-screen shrink-0 grid-rows-[auto_1fr] overflow-hidden border-r border-black/12 px-4 sm:px-6 lg:px-10" style={{ '--frame-accent': frame.accent } as FrameAccentStyle}>
      <div className="mx-auto flex w-full max-w-[112rem] items-center justify-between border-x border-black/10 px-4 py-3 text-[8px] font-black tracking-[0.16em] text-black/42 uppercase sm:px-6 sm:text-[9px]">
        <span>
          Capability frame /
          {frame.index}
        </span>
        <span>
          Scroll vector /
          {String(index + 1).padStart(2, '0')}
          {' '}
          of 05
        </span>
      </div>

      <div className="mx-auto grid h-full w-full max-w-[112rem] border-x border-t border-black/10 lg:grid-cols-[minmax(0,0.9fr)_minmax(32rem,1.1fr)]">
        <div className="flex min-h-0 flex-col justify-between border-b border-black/10 p-6 sm:p-8 lg:border-b-0 lg:border-r lg:p-8 xl:p-10">
          <div>
            <div className="flex items-center justify-between">
              <span className="grid size-12 place-items-center border border-black/14 text-[var(--frame-accent)]">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <span className="text-[clamp(3rem,6vw,7rem)] leading-none font-black tracking-[-0.1em] text-black/7">{frame.index}</span>
            </div>
            <p className="mt-5 text-[9px] font-black tracking-[0.2em] text-[var(--frame-accent)] uppercase sm:text-[10px]">{frame.signal}</p>
            <h2 className="mt-3 max-w-[9ch] text-[clamp(3.4rem,5.2vw,5.4rem)] leading-[1.02] font-black tracking-[-0.045em] text-black">{frame.title}</h2>
            <p className="mt-5 max-w-2xl text-base leading-7 font-black text-black/72 sm:text-xl sm:leading-8">{frame.statement}</p>
            <p className="mt-3 max-w-xl text-xs leading-6 font-bold text-black/46 sm:text-sm">{frame.description}</p>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-black/12 pt-4">
            {frame.tags.map(tag => (
              <span key={tag} className="flex items-center gap-2 text-[8px] font-black tracking-[0.14em] text-black/54 uppercase sm:text-[9px]">
                <span className="size-1.5 bg-[var(--frame-accent)]" />
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="min-h-[26rem] p-4 sm:p-7 lg:p-10">
          <FrameVisual visual={frame.visual} />
        </div>
      </div>
    </article>
  )
}

function FrameVisual({ visual }: { visual: (typeof CAPABILITY_FRAMES)[number]['visual'] }) {
  if (visual === 'application')
    return <ApplicationVisual />

  if (visual === 'automation')
    return <AutomationVisual />

  if (visual === 'visual')
    return <VisualCommandVisual />

  if (visual === 'ai')
    return <IntelligenceVisual />

  return <SupportDiagnosticVisual />
}

function IntelligenceVisual() {
  const knowledge = ['POLICY', 'PRODUCT', 'PROCESS', 'CUSTOMER']

  return (
    <div className="relative h-full min-h-[24rem] overflow-hidden border border-black/16 bg-[#14121d] p-4 text-white sm:p-6">
      <div className="services-intelligence-scan absolute inset-y-0 left-0 w-px bg-[#9b87ff] shadow-[0_0_26px_6px_rgba(155,135,255,0.3)]" />
      <div className="flex items-center justify-between border-b border-white/14 pb-3 text-[8px] font-black tracking-[0.14em] text-white/38 uppercase">
        <span>Private intelligence layer</span>
        <span className="text-[#b6a8ff]">Secure / auditable</span>
      </div>
      <div className="mt-6 grid h-[calc(100%-2.5rem)] grid-cols-[0.82fr_1.18fr] gap-3">
        <div className="space-y-2">
          {knowledge.map((item, index) => (
            <div key={item} className="border border-white/12 p-3">
              <span className="block text-[7px] font-black text-white/28">
                K/
                {index + 1}
              </span>
              <span className="mt-1 block text-[8px] font-black tracking-[0.12em] text-[#b6a8ff]">{item}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-rows-[1fr_auto] border border-white/12">
          <div className="relative grid place-items-center p-4">
            <div className="absolute inset-[14%] border border-[#9b87ff]/30" />
            <div className="absolute inset-[27%] border border-[#9b87ff]/45" />
            <div className="relative grid size-24 place-items-center bg-[#7357ff] text-[9px] font-black tracking-[0.12em]">AI CORE</div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-white/12 text-[7px] font-black tracking-[0.1em] uppercase">
            <span className="bg-[#14121d] p-3 text-white/48">Evaluate / pass</span>
            <span className="bg-[#b6a8ff] p-3 text-black">Deploy / ready</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function KineticRail() {
  return (
    <div className="overflow-hidden border-b border-black bg-black py-4 text-white">
      <div className="services-kinetic-track flex w-max items-center">
        {KINETIC_LOOP.map(item => (
          <div key={item.id} aria-hidden={item.duplicate} className="flex items-center gap-8 px-6 sm:px-10">
            <span className="text-2xl font-black tracking-[-0.04em] uppercase sm:text-4xl">{item.word}</span>
            <span className="text-xl font-black text-[#c6ff37]">✳</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProcessRow({ step, index }: { step: (typeof PROCESS)[number], index: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 30 }}
      transition={{ duration: 0.72, delay: index * 0.06, ease: EASE_OUT }}
      viewport={{ once: true, amount: 0.35 }}
      whileInView={{ opacity: 1, y: 0 }}
      className="group grid border-b border-black/10 transition-colors hover:bg-[#c6ff37] sm:grid-cols-[8rem_0.55fr_1fr]"
    >
      <div className="border-b border-black/10 p-5 sm:border-b-0 sm:border-r sm:p-7">
        <span className="text-4xl font-black tracking-[-0.08em] text-black/14 transition-colors group-hover:text-black sm:text-5xl">{step.index}</span>
      </div>
      <div className="border-b border-black/10 p-5 sm:border-b-0 sm:border-r sm:p-7">
        <span className="text-[8px] font-black tracking-[0.18em] text-[#155eef] uppercase">{step.code}</span>
        <h3 className="mt-2 text-xl font-black tracking-[-0.04em] sm:text-2xl">{step.title}</h3>
      </div>
      <div className="flex items-center justify-between gap-6 p-5 sm:p-7">
        <p className="max-w-2xl text-sm leading-7 font-bold text-black/52 group-hover:text-black/68">{step.description}</p>
        <ArrowRight aria-hidden="true" className="size-5 shrink-0 -rotate-45 text-black/22 transition-[color,transform] group-hover:rotate-0 group-hover:text-black" />
      </div>
    </motion.article>
  )
}

function Reveal({ children, className, delay = 0 }: { children: React.ReactNode, className?: string, delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 34, filter: 'blur(8px)' }}
      transition={{ duration: 0.78, delay, ease: EASE_OUT }}
      viewport={{ once: true, amount: 0.2 }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

function SupportDiagnosticVisual() {
  return (
    <div className="services-support-visual relative h-full min-h-[24rem] overflow-hidden border border-black/16 bg-[#120c15] p-4 text-white sm:p-6">
      <div aria-hidden="true" className="services-support-visual-grid absolute inset-0" />
      <div aria-hidden="true" className="services-support-scan absolute inset-x-0 top-0 h-px bg-[#f08cff] shadow-[0_0_28px_7px_rgba(224,68,255,0.3)]" />

      <div className="relative flex items-center justify-between border-b border-white/14 pb-3 text-[8px] font-black tracking-[0.14em] uppercase">
        <span className="flex items-center gap-2 text-white/38">
          <Stethoscope aria-hidden="true" className="size-3.5 text-[#f08cff]" />
          Diagnostic core / active
        </span>
        <span className="services-terminal-cursor text-[#c6ff37]">CHECKING_</span>
      </div>

      <div className="relative mt-5 grid h-[calc(100%-2.5rem)] grid-rows-[auto_1fr_auto] gap-4">
        <div className="grid grid-cols-4 gap-px bg-white/12">
          {SUPPORT_METRICS.map((metric, index) => (
            <div key={metric.id} className={index === 2 ? 'bg-[#e044ff] p-3 text-black' : 'bg-[#120c15] p-3'}>
              <span className={`block text-[7px] font-black tracking-[0.1em] ${index === 2 ? 'text-black/54' : 'text-white/32'}`}>{metric.label}</span>
              <span className="mt-2 block text-sm font-black tracking-[-0.04em] sm:text-lg">{metric.value}</span>
            </div>
          ))}
        </div>

        <div className="grid min-h-0 grid-cols-[1fr_0.82fr] gap-3">
          <div className="grid grid-rows-[1fr_auto] border border-white/12 p-4">
            <svg aria-label="系统响应诊断趋势示意图" viewBox="0 0 380 180" className="size-full overflow-visible">
              <path d="M0 145 H380 M0 92 H380 M0 39 H380" stroke="rgba(255,255,255,.09)" strokeWidth="1" />
              <path d="M0 150 C38 148 62 126 95 132 S147 155 184 105 249 48 286 71 330 104 380 29" fill="none" stroke="#e85cff" strokeWidth="4" className="services-diagnostic-wave" />
            </svg>
            <div className="flex items-end justify-between border-t border-white/12 pt-3">
              <span className="text-[7px] font-black tracking-[0.12em] text-white/30 uppercase">Response gain</span>
              <span className="text-2xl font-black tracking-[-0.06em] text-[#f08cff]">+34%</span>
            </div>
          </div>
          <div className="space-y-2">
            {SUPPORT_EVENTS.map(event => (
              <div key={event.id} className="border border-white/12 p-3">
                <span className="block truncate text-[7px] font-black tracking-[0.08em] text-white/32 uppercase">{event.task}</span>
                <span className="mt-2 block text-[8px] font-black tracking-[0.1em] text-[#c6ff37]">{event.state}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/12 pt-3 text-[8px] font-black tracking-[0.14em] uppercase">
          <span className="text-white/30">Root cause analysis</span>
          <span className="flex items-center gap-2 text-[#f08cff]">
            <span className="services-status-pulse size-1.5 bg-[#f08cff]" />
            System stable
          </span>
        </div>
      </div>
    </div>
  )
}

function SupportServiceRow({ service, index }: { service: (typeof SUPPORT_SERVICES)[number], index: number }) {
  const Icon = service.icon

  return (
    <motion.article
      initial={{ opacity: 0, x: 32 }}
      transition={{ duration: 0.65, delay: index * 0.045, ease: EASE_OUT }}
      viewport={{ once: true, amount: 0.3 }}
      whileInView={{ opacity: 1, x: 0 }}
      className="services-support-row group relative grid overflow-hidden border-b border-black/12 p-5 sm:grid-cols-[3.5rem_1fr_auto] sm:gap-5 sm:p-7"
    >
      <span aria-hidden="true" className="services-support-row__signal absolute inset-y-0 left-0 w-1 bg-[#155eef]" />
      <div className="flex items-start justify-between sm:block">
        <span className="grid size-10 place-items-center border border-black/16 text-[#155eef] transition-[background-color,color,transform] group-hover:-translate-y-1 group-hover:bg-black group-hover:text-[#c6ff37]">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <span className="text-[8px] font-black text-black/24 sm:mt-4 sm:block">{service.index}</span>
      </div>
      <div className="mt-5 sm:mt-0">
        <span className="text-[8px] font-black tracking-[0.18em] text-[#155eef] uppercase">{service.code}</span>
        <h3 className="mt-1 text-xl font-black tracking-[-0.035em] text-black sm:text-2xl">{service.title}</h3>
        <p className="mt-3 max-w-2xl text-xs leading-6 font-bold text-black/50 sm:text-sm sm:leading-7">{service.description}</p>
      </div>
      <ArrowRight aria-hidden="true" className="mt-6 size-5 shrink-0 -rotate-45 text-black/20 transition-[color,transform] group-hover:rotate-0 group-hover:text-[#155eef] sm:mt-1" />
    </motion.article>
  )
}

function SystemDiagnosticConsole() {
  return (
    <div className="services-diagnostic-console relative min-h-[43rem] overflow-hidden bg-[#090b11] p-5 text-white sm:p-7">
      <div aria-hidden="true" className="services-diagnostic-grid absolute inset-0" />
      <div aria-hidden="true" className="services-diagnostic-scan absolute inset-x-0 top-0 h-px bg-[#5f8dff] shadow-[0_0_30px_8px_rgba(95,141,255,0.28)]" />

      <div className="relative flex items-center justify-between border-b border-white/14 pb-4 text-[8px] font-black tracking-[0.16em] uppercase">
        <span className="flex items-center gap-3 text-white/48">
          <DisplayPulse aria-hidden="true" className="size-4 text-[#7ca0ff]" />
          Workstation diagnostic / WD-08
        </span>
        <span className="services-terminal-cursor text-[#c6ff37]">SCANNING_</span>
      </div>

      <div className="relative mt-8 grid gap-8 sm:grid-cols-[0.82fr_1.18fr] sm:items-center">
        <div className="services-health-dial mx-auto grid aspect-square w-full max-w-52 place-items-center">
          <div className="services-health-dial__inner grid size-[72%] place-items-center bg-[#090b11] text-center">
            <div>
              <span className="block text-[8px] font-black tracking-[0.18em] text-white/34 uppercase">System health</span>
              <strong className="mt-1 block text-5xl font-black tracking-[-0.08em] text-white">92</strong>
              <span className="mt-1 block text-[8px] font-black tracking-[0.14em] text-[#c6ff37] uppercase">Optimal</span>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {SUPPORT_METRICS.map((metric, index) => (
            <div key={metric.id}>
              <div className="mb-2 flex items-center justify-between text-[8px] font-black tracking-[0.14em] uppercase">
                <span className="text-white/38">{metric.label}</span>
                <span className="text-[#8aa9ff]">{metric.value}</span>
              </div>
              <div className="h-1 overflow-hidden bg-white/12">
                <span className="services-diagnostic-meter block h-full origin-left bg-[#5f8dff]" style={{ animationDelay: `${index * 160}ms`, width: metric.width }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative mt-9 border-y border-white/12 py-5">
        <div className="mb-4 flex items-center justify-between text-[8px] font-black tracking-[0.15em] uppercase">
          <span className="text-white/34">Performance timeline</span>
          <span className="text-[#c6ff37]">+34% response</span>
        </div>
        <svg aria-label="电脑性能诊断趋势示意图" viewBox="0 0 620 120" className="h-24 w-full overflow-visible">
          <path d="M0 98 H620 M0 60 H620 M0 22 H620" stroke="rgba(255,255,255,.08)" strokeWidth="1" />
          <path d="M0 96 C48 91 78 85 115 90 S181 98 224 72 289 30 344 48 403 78 454 54 515 18 620 26" fill="none" stroke="#6f97ff" strokeWidth="3" className="services-diagnostic-wave" />
          <path d="M0 106 C72 103 108 94 152 99 S243 106 298 86 408 75 482 64 554 51 620 54" fill="none" stroke="rgba(198,255,55,.52)" strokeDasharray="5 7" strokeWidth="2" />
        </svg>
      </div>

      <div className="relative mt-6">
        <div className="mb-3 flex items-center justify-between text-[8px] font-black tracking-[0.15em] uppercase">
          <span className="text-white/34">Resolved sequence</span>
          <span className="text-white/24">03 / 03</span>
        </div>
        {SUPPORT_EVENTS.map((event, index) => (
          <div key={event.id} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-t border-white/10 py-3 text-[8px] font-black tracking-[0.12em] uppercase">
            <span className="text-white/22">
              0
              {index + 1}
            </span>
            <span className="text-white/64">{event.task}</span>
            <span className="text-[#c6ff37]">{event.state}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SystemSupportSection() {
  return (
    <section id="technical-support" className="services-support-section relative overflow-hidden border-b border-black/12 bg-[#dfe8ff] px-4 py-24 sm:px-6 sm:py-32 lg:px-10">
      <div aria-hidden="true" className="services-support-field absolute inset-0" />
      <div className="relative mx-auto max-w-[112rem] border-x border-black/12">
        <div className="grid border-y border-black/12 lg:grid-cols-[0.62fr_1.38fr]">
          <Reveal className="border-b border-black/12 p-6 lg:border-b-0 lg:border-r lg:p-10">
            <TechnicalLabel index="06" label="TECHNICAL SUPPORT" />
            <div className="mt-12 flex items-center gap-3 text-[9px] font-black tracking-[0.16em] text-black/48 uppercase">
              <span className="services-status-pulse size-2 bg-[#155eef]" />
              Diagnostic channel / online
            </div>
          </Reveal>
          <Reveal delay={0.08} className="p-6 sm:p-10 lg:p-14">
            <p className="text-[9px] font-black tracking-[0.2em] text-[#155eef] uppercase">From symptoms to root cause</p>
            <h2 className="mt-5 max-w-[14ch] text-[clamp(2rem,10vw,2.45rem)] leading-[0.98] font-black tracking-[-0.052em] text-black sm:text-[clamp(3.3rem,6.2vw,7.4rem)]">
              <span className="block whitespace-nowrap">电脑出问题，</span>
              <span className="block whitespace-nowrap text-[#155eef]">先诊断，再处理。</span>
            </h2>
            <p className="mt-8 max-w-3xl text-sm leading-7 font-bold text-black/58 sm:text-base sm:leading-8">
              从软件安装失败、系统卡顿到网络和外设异常，用工程化方式找出根因、记录处理过程，并给出可持续的维护建议。
            </p>
          </Reveal>
        </div>

        <div className="grid border-b border-black/12 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal className="border-b border-black/12 p-4 sm:p-7 lg:sticky lg:top-20 lg:self-start lg:border-b-0 lg:border-r lg:p-10">
            <SystemDiagnosticConsole />
          </Reveal>

          <div>
            {SUPPORT_SERVICES.map((service, index) => (
              <SupportServiceRow key={service.code} index={index} service={service} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function TechnicalLabel({ index, invert = false, label }: { index: string, invert?: boolean, label: string }) {
  return (
    <div className={`flex items-center gap-4 text-[9px] font-black tracking-[0.18em] uppercase ${invert ? 'text-white/48' : 'text-black/44'}`}>
      <span className={`grid size-8 place-items-center ${invert ? 'bg-[#c6ff37] text-black' : 'bg-black text-white'}`}>{index}</span>
      {label}
      <span className={`h-px flex-1 ${invert ? 'bg-white/16' : 'bg-black/14'}`} />
    </div>
  )
}

function TelemetryBars() {
  const heights = [34, 68, 47, 82, 54, 94, 72, 100]

  return (
    <div className="hidden h-16 items-end gap-1.5 sm:flex">
      {heights.map((height, index) => (
        <span key={height} className="services-console-meter w-2 bg-[#c6ff37]" style={{ height: `${height}%`, animationDelay: `${index * 100}ms` }} />
      ))}
    </div>
  )
}

function VisualCommandVisual() {
  return (
    <div className="relative h-full min-h-[24rem] overflow-hidden border border-black/16 bg-[#15110f] p-4 text-white sm:p-6">
      <div className="flex items-center justify-between border-b border-white/14 pb-3 text-[8px] font-black tracking-[0.14em] text-white/38 uppercase">
        <span>Command surface / realtime</span>
        <span className="text-[#ff8a6c]">Signal stable</span>
      </div>
      <div className="mt-5 grid h-[calc(100%-2.5rem)] grid-cols-[1.25fr_0.75fr] gap-3">
        <div className="grid grid-rows-[1fr_auto] border border-white/12 p-4">
          <svg aria-label="实时趋势示意图" viewBox="0 0 420 220" className="size-full overflow-visible">
            <path d="M0 180 H420 M0 120 H420 M0 60 H420" stroke="rgba(255,255,255,.1)" strokeWidth="1" />
            <path d="M0 188 C45 180 64 112 108 128 S171 172 205 103 278 36 321 75 376 104 420 28" fill="none" stroke="#ff6b45" strokeWidth="4" className="services-chart-line" />
            <path d="M0 202 C60 194 83 161 124 170 S199 188 238 146 325 98 420 116" fill="none" stroke="rgba(255,255,255,.34)" strokeDasharray="7 8" strokeWidth="2" />
          </svg>
          <div className="flex items-end justify-between border-t border-white/12 pt-3">
            <span className="text-[8px] font-black tracking-[0.12em] text-white/34 uppercase">Operational index</span>
            <span className="text-3xl font-black tracking-[-0.06em] text-[#ff8a6c]">84.7</span>
          </div>
        </div>
        <div className="grid grid-rows-3 gap-3">
          {[
            ['LIVE', '12'],
            ['TASK', '248'],
            ['ALERT', '03'],
          ].map(([label, value], index) => (
            <div key={label} className={`border border-white/12 p-3 ${index === 1 ? 'bg-[#ff5c35] text-black' : ''}`}>
              <span className={`block text-[7px] font-black tracking-[0.12em] ${index === 1 ? 'text-black/56' : 'text-white/34'}`}>{label}</span>
              <span className="mt-3 block text-2xl font-black tracking-[-0.06em] sm:text-3xl">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
