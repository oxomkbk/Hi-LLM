'use client'

import { Chip, Label, ListBox, Select, toast } from '@heroui/react'
import { useMemo } from 'react'

import type { CategoryOption } from '@/types'

const MAX_CATEGORY_COUNT = 8

interface CategoryMultiSelectProps {
  categories: CategoryOption[]
  className?: string
  disabled?: boolean
  loading?: boolean
  onChange: (categoryIds: string[]) => void
  value: string[]
}

export default function CategoryMultiSelect({
  categories,
  className,
  disabled = false,
  loading = false,
  onChange,
  value,
}: CategoryMultiSelectProps) {
  const categoryById = useMemo(
    () => new Map(categories.map(category => [category.id, category])),
    [categories],
  )
  const selectedCategories = value.flatMap((id) => {
    const category = categoryById.get(id)
    return category ? [category] : []
  })

  return (
    <div className={className}>
      <Select
        aria-label="所属分类"
        variant="secondary"
        isDisabled={disabled || loading || !categories.length}
        isRequired
        placeholder={loading ? '正在加载分类...' : '请选择分类（可多选）'}
        selectionMode="multiple"
        value={value}
        onChange={(selection) => {
          const nextValue = Array.isArray(selection)
            ? selection.map(String)
            : selection == null
              ? []
              : [String(selection)]
          if (nextValue.length > MAX_CATEGORY_COUNT) {
            toast.warning(`最多选择 ${MAX_CATEGORY_COUNT} 个分类`)
            return
          }
          onChange(nextValue)
        }}
      >
        <Label>所属分类</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {categories.map(category => (
              <ListBox.Item key={category.id} id={category.id} textValue={category.name}>
                {category.name}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      <div className="mt-2 flex min-h-6 flex-wrap items-center gap-1.5">
        {selectedCategories.map((category, index) => (
          <Chip key={category.id} color={index === 0 ? 'accent' : 'default'} size="sm" variant="soft">
            {category.name}
          </Chip>
        ))}
        <span className="ml-auto text-[11px] tabular-nums text-muted">
          {value.length}
          /
          {MAX_CATEGORY_COUNT}
        </span>
      </div>
    </div>
  )
}
