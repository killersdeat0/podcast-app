import Link from 'next/link'

interface EmptyStateProps {
  title: string
  description?: string
  cta?: {
    label: string
    href: string
  }
}

export function EmptyState({ title, description, cta }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <p className="text-lg font-semibold text-on-surface mb-2">{title}</p>
      {description && (
        <p className="text-sm text-on-surface-variant max-w-xs mb-6">{description}</p>
      )}
      {cta && (
        <Link
          href={cta.href}
          className="bg-brand hover:bg-brand text-on-surface text-sm font-medium px-5 py-2 rounded-lg transition-colors"
        >
          {cta.label}
        </Link>
      )}
    </div>
  )
}
