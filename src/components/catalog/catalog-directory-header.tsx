import type { ReactNode } from 'react'

export default function CatalogDirectoryHeader({
  description,
  id,
  title,
  total,
  totalLabel = '个结果',
  trailing,
}: {
  description?: string
  id: string
  title: string
  total: number | string
  totalLabel?: string
  trailing?: ReactNode
}) {
  return (
    <div className="catalog-shell catalog-directory-header">
      <div>
        <h2 id={id} className="catalog-section-title">{title}</h2>
        {description ? <p className="catalog-section-description">{description}</p> : null}
      </div>
      <div className="catalog-directory-meta">
        {trailing}
        <span aria-live="polite" className="catalog-result-total">
          {total}
          {' '}
          {totalLabel}
        </span>
      </div>
    </div>
  )
}
