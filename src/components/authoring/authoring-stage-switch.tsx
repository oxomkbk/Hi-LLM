'use client'

import { Check, Pencil, ShieldCheck } from '@gravity-ui/icons'
import { Button } from '@heroui/react'

import styles from './authoring-stage-switch.module.css'

import type { AuthoringCompletion, AuthoringStage } from './workspace-model'

interface AuthoringStageSwitchProps {
  completion: AuthoringCompletion
  onChange: (stage: AuthoringStage) => void
  persistenceHint?: string
  stage: AuthoringStage
}

export function AuthoringStageSwitch({ completion, onChange, persistenceHint = '内容会自动保存在当前设备', stage }: AuthoringStageSwitchProps) {
  return (
    <section aria-label="编辑流程" className={`${styles.root} authoring-stage-switch`}>
      <div className={styles.intro}>
        <span className={styles.eyebrow}>编辑流程</span>
        <strong>{stage === 'write' ? '先把内容写完整' : '完成发布前检查'}</strong>
        <span className={styles.hint}>{persistenceHint}</span>
      </div>
      <div aria-label="编辑阶段" role="group" className={styles.tabs}>
        <Button
          aria-pressed={stage === 'write'}
          type="button"
          variant="ghost"
          onPress={() => onChange('write')}
          className={`${styles.tab} ${stage === 'write' ? styles.active : ''}`}
        >
          <Pencil />
          <span>写作</span>
        </Button>
        <Button
          aria-pressed={stage === 'publish'}
          type="button"
          variant="ghost"
          onPress={() => onChange('publish')}
          className={`${styles.tab} ${stage === 'publish' ? styles.active : ''}`}
        >
          <ShieldCheck />
          <span>发布检查</span>
        </Button>
      </div>
      <div aria-label={`发布检查完成 ${completion.completed} 项，共 ${completion.total} 项`} className={styles.completion}>
        <span className={styles.completionIcon}><Check /></span>
        <span>
          <b>
            {completion.completed}
            /
            {completion.total}
          </b>
          {' '}
          已完成
        </span>
        <span className={styles.progress}><i style={{ width: `${completion.percent}%` }} /></span>
      </div>
    </section>
  )
}
