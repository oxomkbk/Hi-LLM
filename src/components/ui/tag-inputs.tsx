'use client'
import { CircleXmarkFill } from '@gravity-ui/icons'
import { Chip, Input, Label } from '@heroui/react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'

import type { FC, KeyboardEvent } from 'react'

interface TagInputsProps {
  disabled?: boolean
  maxTags?: number
  value: string[]
  onChange: (value: string[]) => void
  appearance?: 'default' | 'submission'
}

const MotionChip = motion.create(Chip)

const TagInputs: FC<TagInputsProps> = ({ value = [], onChange, appearance = 'default', disabled = false, maxTags = 8 }) => {
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const addTag = (text: string) => {
    const val = text.trim()
    if (val && value.length < maxTags && !value.includes(val)) {
      onChange?.([...value, val])
    }
    setInputValue('')
  }

  const removeTag = (text: string) => {
    onChange?.(value.filter(tag => tag !== text))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag(inputValue)
    }
    else if (e.key === 'Backspace' && inputValue === '' && value.length) {
      e.preventDefault()
      onChange?.(value.slice(0, -1))
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="tags">标签</Label>
        {appearance === 'submission'
          ? (
              <span className="text-[10px] text-muted">
                {value.length}
                /
                {maxTags}
              </span>
            )
          : null}
      </div>
      <div
        className={appearance === 'submission'
          ? 'flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-transparent bg-surface-secondary/65 px-2 py-1.5 transition-[border-color,box-shadow] focus-within:border-focus focus-within:ring-2 focus-within:ring-focus/20'
          : 'flex flex-wrap items-center gap-2 rounded-lg border border-default bg-transparent px-2 py-2'}
      >
        <AnimatePresence>
          {value.map(tag => (
            <MotionChip
              key={tag}
              size="sm"
              variant="soft"
              animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
              exit={{ opacity: 0, filter: 'blur(2px)', y: 10 }}
              initial={{ opacity: 0, filter: 'blur(2px)', y: 10 }}
              layout
              transition={{ duration: 0.2 }}
            >
              <Chip.Label>{tag}</Chip.Label>
              <button aria-label={`删除标签 ${tag}`} type="button" disabled={disabled} onClick={() => removeTag(tag)} className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-default disabled:opacity-50">
                <CircleXmarkFill className="cursor-pointer" />
              </button>
            </MotionChip>
          ))}
        </AnimatePresence>
        <Input
          ref={inputRef}
          id="tags"
          variant="secondary"
          disabled={disabled}
          placeholder="输入后回车"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className={appearance === 'submission' ? 'min-w-24 flex-1 py-1 text-xs' : 'w-25 py-1 text-xs'}
        />
      </div>
    </div>
  )
}
export default TagInputs
