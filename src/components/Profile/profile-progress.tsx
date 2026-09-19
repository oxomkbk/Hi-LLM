'use client'

import { ProgressBar } from '@heroui/react'

import styles from './profile.module.css'

export function ProfileProgress({ label, value }: { label: string, value: number }) {
  return (
    <ProgressBar aria-label={label} value={value} className={styles.progressBar}>
      <ProgressBar.Track className={styles.progressTrack}>
        <ProgressBar.Fill className={styles.progressFill} />
      </ProgressBar.Track>
    </ProgressBar>
  )
}
