"use client"

import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface ProtocolTypeCardProps {
  title: string
  description: string
  icon: LucideIcon
  selected: boolean
  onSelect: () => void
}

export function ProtocolTypeCard({ title, description, icon: Icon, selected, onSelect }: ProtocolTypeCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative flex flex-col items-start rounded-lg border p-4 text-left transition-all hover:border-foreground/50",
        selected ? "border-foreground bg-accent" : "border-border bg-card",
      )}
    >
      {/* Selection indicator */}
      <div
        className={cn(
          "absolute right-3 top-3 h-4 w-4 rounded-full border-2 transition-colors",
          selected ? "border-foreground bg-foreground" : "border-muted-foreground",
        )}
      >
        {selected && (
          <svg viewBox="0 0 16 16" className="h-full w-full text-background">
            <circle cx="8" cy="8" r="3" fill="currentColor" />
          </svg>
        )}
      </div>

      <div className="mb-3 rounded-md border border-border bg-background p-2">
        <Icon className="h-5 w-5 text-foreground" />
      </div>

      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </button>
  )
}
