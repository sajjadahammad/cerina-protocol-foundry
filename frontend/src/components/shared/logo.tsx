export function Logo({ className }: { className?: string }) {
  return (
    <div className={className}>
      <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-8 w-8">
        <circle cx="16" cy="16" r="14" className="stroke-foreground" strokeWidth="2" />
        <path
          d="M10 16C10 12.6863 12.6863 10 16 10C19.3137 10 22 12.6863 22 16"
          className="stroke-foreground"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="16" cy="20" r="3" className="fill-foreground" />
      </svg>
    </div>
  )
}
