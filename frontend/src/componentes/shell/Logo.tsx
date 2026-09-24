/**
 * Logotipo provisional (la marca es F8.0): un escudo con un pequeño grafo dentro, el nodo comprometido en ámbar.
 */
import { cn } from '@/lib/utils'

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-9', className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#1f2a37" />
      <path d="M16 5 7 8.5v6.8c0 5.6 3.8 10.1 9 11.7 5.2-1.6 9-6.1 9-11.7V8.5L16 5Z" fill="none" stroke="#7aa2d9" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 14 20 12.5M12 14l4 6M20 12.5 16 20" stroke="#9fb8d9" strokeWidth="1.2" />
      <circle cx="12" cy="14" r="1.8" fill="#9fb8d9" />
      <circle cx="20" cy="12.5" r="1.8" fill="#9fb8d9" />
      <circle cx="16" cy="20" r="1.8" fill="#e0a45a" />
    </svg>
  )
}
