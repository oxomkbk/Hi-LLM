'use client'

import {
  ArrowRight,
  CircleExclamation,
  Globe,
  Medal,
  PaperPlane,
} from '@gravity-ui/icons'
import { Button, Modal, Tooltip, useOverlayState } from '@heroui/react'
import Image from 'next/image'
import Link from 'next/link'

import styles from './about-dialog.module.css'

const highlights = [
  {
    label: '精选导航',
    description: '收录值得访问的 AI 工具。',
    icon: Globe,
  },
  {
    label: '开放投稿',
    description: '分享你的新发现。',
    icon: PaperPlane,
  },
  {
    label: '社区共创',
    description: '连接问题、作品与经验。',
    icon: Medal,
  },
] as const

const acknowledgements = [
  {
    name: '银荡Lewd',
    avatar: '/api/files/e8dc3a37-d3ed-40dc-8760-1ca66a155adf',
  },
  {
    name: '☞啊润☜',
    avatar: '/api/files/10442e46-68ce-4ff5-a364-aa07eca3218c',
  },
] as const

export default function AboutDialog() {
  const state = useOverlayState()
  const displayName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'Hi LLM'
  const appDescription = process.env.NEXT_PUBLIC_APP_DESC || '发现、收藏并分享值得访问的网站。'
  const showHiLlmWordmark = displayName.replace(/\s+/g, '').toLowerCase() === 'hillm'

  return (
    <>
      <Tooltip delay={0}>
        <Button
          aria-label="关于我们"
          size="sm"
          variant="ghost"
          isIconOnly
          onPress={state.open}
        >
          <CircleExclamation aria-hidden="true" />
        </Button>
        <Tooltip.Content showArrow>
          <Tooltip.Arrow />
          关于我们
        </Tooltip.Content>
      </Tooltip>

      <Modal.Backdrop variant="blur" isOpen={state.isOpen} onOpenChange={state.setOpen}>
        <Modal.Container size="lg" placement="center" scroll="outside" className={styles.container}>
          <Modal.Dialog className={styles.dialog}>
            <Modal.CloseTrigger className={styles.closeButton} />

            <Modal.Header className={styles.header}>
              <div className={styles.editionLine}>
                <span>ABOUT HILLM</span>
              </div>

              <div className={styles.hero}>
                <div className={styles.heroCopy}>
                  <span className={styles.eyebrow}>你好，大模型</span>
                  <Modal.Heading
                    aria-label={showHiLlmWordmark ? displayName : undefined}
                    translate="no"
                    className={styles.heading}
                  >
                    {showHiLlmWordmark
                      ? (
                          <span aria-hidden="true" className={styles.wordmark}>
                            <span className={styles.wordmarkGreeting}>
                              H
                              <span className={styles.wordmarkI}>i</span>
                            </span>
                            <span className={styles.wordmarkModel}>LLM</span>
                          </span>
                        )
                      : displayName}
                  </Modal.Heading>
                  <p className={styles.description}>{appDescription}</p>
                </div>

                <div aria-hidden="true" className={styles.brandMark}>
                  <div className={styles.logo}>
                    <Image
                      alt=""
                      fill
                      priority
                      sizes="112px"
                      src="/logo-new.png"
                      className={styles.logoImage}
                    />
                  </div>
                </div>
              </div>
            </Modal.Header>

            <Modal.Body className={styles.body}>
              <section className={styles.introduction}>
                <div className={styles.introductionTitle}>
                  <h3>让 AI 探索更清晰。</h3>
                </div>
              </section>

              <section aria-label="平台特色" className={styles.highlights}>
                {highlights.map(({ label, description, icon: Icon }) => (
                  <article key={label} className={styles.highlight}>
                    <span className={styles.highlightIconWrap}>
                      <Icon aria-hidden="true" className={styles.highlightIcon} />
                    </span>
                    <strong className={styles.highlightLabel}>{label}</strong>
                    <p className={styles.highlightDescription}>{description}</p>
                  </article>
                ))}
              </section>

              <section aria-labelledby="about-team-title" className={styles.thanks}>
                <div className={styles.thanksCopy}>
                  <span className={styles.thanksEyebrow}>Operations</span>
                  <h3 id="about-team-title" className={styles.thanksTitle}>
                    运营团队
                  </h3>
                </div>

                <div className={styles.thanksPeople}>
                  {acknowledgements.map(({ name, avatar }, index) => (
                    <article key={name} className={styles.thanksPerson}>
                      <span className={styles.thanksAvatar}>
                        <span className={styles.thanksAvatarMedia}>
                          <Image
                            alt={`${name} 头像`}
                            fill
                            sizes="68px"
                            src={avatar}
                            unoptimized
                            className={styles.thanksAvatarImage}
                          />
                        </span>
                      </span>
                      <span className={styles.thanksPersonCopy}>
                        <strong className={styles.thanksName}>{name}</strong>
                        <span className={styles.thanksNote}>内容与社区运营</span>
                      </span>
                      <span aria-hidden="true" className={styles.personIndex}>
                        0
                        {index + 1}
                      </span>
                    </article>
                  ))}
                </div>
              </section>

            </Modal.Body>

            <Modal.Footer className={styles.footer}>
              <div className={styles.footerCopy}>
                <span className={styles.footerEyebrow}>HILLM</span>
                <span className={styles.closing}>持续更新，感谢访问。</span>
              </div>
              <Link
                aria-label="HiLLM 技术支持"
                href="/services"
                onClick={state.close}
                className={styles.supportLink}
              >
                <span className={styles.supportCopy}>
                  <small>SUPPORT</small>
                  <strong>技术支持</strong>
                </span>
                <ArrowRight aria-hidden="true" className={styles.supportArrow} />
              </Link>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  )
}
