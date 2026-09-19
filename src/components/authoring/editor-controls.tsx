'use client'

import { Button, Tooltip } from '@heroui/react'

import styles from './editor-controls.module.css'

import type { ComponentType, CSSProperties, SVGProps } from 'react'

export interface EditorToolButtonProps {
  active?: boolean
  disabled?: boolean
  icon: ComponentType<SVGProps<SVGSVGElement>>
  label: string
  onPress: () => void
  shortcut?: string
}

export function AuthoringEditorSkeleton({ minHeight = '28rem' }: { minHeight?: string }) {
  return (
    <div
      aria-busy="true"
      aria-label="正在加载编辑器"
      role="status"
      className={styles.loading}
      style={{ '--authoring-editor-min-height': minHeight } as CSSProperties}
    >
      <div className={styles.loadingToolbar}>
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className={styles.loadingBody}>
        <span className={styles.loadingLine} />
        <span className={styles.loadingLine} />
        <span className={styles.loadingLine} />
        <span className={styles.loadingLine} />
      </div>
      <span className="sr-only">编辑器正在加载</span>
    </div>
  )
}

export function EditorToolButton({ active, disabled = false, icon: Icon, label, onPress, shortcut }: EditorToolButtonProps) {
  return (
    <Tooltip closeDelay={0} delay={350}>
      <Button
        aria-label={label}
        aria-pressed={active}
        type="button"
        variant="tertiary"
        isDisabled={disabled}
        isIconOnly
        onPress={onPress}
        className={styles.toolButton}
      >
        <Icon />
      </Button>
      <Tooltip.Content className={styles.tooltip}>
        {label}
        {shortcut ? <kbd>{shortcut}</kbd> : null}
      </Tooltip.Content>
    </Tooltip>
  )
}
