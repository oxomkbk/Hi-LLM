import type { ReactNode } from 'react'

interface AdminPageHeaderProps {
  actions?: ReactNode
  className?: string
  description?: ReactNode
  eyebrow?: ReactNode
  meta?: ReactNode
  title: ReactNode
}

interface AdminSectionHeaderProps {
  actions?: ReactNode
  className?: string
  description?: ReactNode
  title: ReactNode
}

export function AdminPageHeader({ actions, className, description, meta, title }: AdminPageHeaderProps) {
  return (
    <header className={joinClasses('admin-ui-page-header admin-page-heading', className)}>
      <div className="admin-ui-page-header__copy">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {meta ? <div className="admin-ui-page-header__meta">{meta}</div> : null}
      </div>
      {actions ? <div className="admin-ui-page-header__actions">{actions}</div> : null}
    </header>
  )
}

export function AdminSectionHeader({ actions, className, description, title }: AdminSectionHeaderProps) {
  return (
    <header className={joinClasses('admin-ui-section-header', className)}>
      <div className="admin-ui-section-header__copy">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="admin-ui-section-header__actions">{actions}</div> : null}
    </header>
  )
}

export function AdminStatus({ children, tone = 'neutral' }: { children: ReactNode, tone?: 'danger' | 'info' | 'neutral' | 'success' | 'warning' }) {
  return <span data-tone={tone} className="admin-ui-status">{children}</span>
}

export function AdminToolbar({ children, className }: { children: ReactNode, className?: string }) {
  return <div className={joinClasses('admin-ui-toolbar admin-filter-bar', className)}>{children}</div>
}

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(' ')
}
