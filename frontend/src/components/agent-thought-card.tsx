"use client"

import { cn } from "@/lib/utils"
import type { AgentThought, AgentRole } from "@/lib/protocols"
import { Shield, Pencil, Brain, Users } from "lucide-react"

const agentConfig: Record<AgentRole, { icon: typeof Shield; label: string; colorClass: string }> = {
  drafter: { icon: Pencil, label: "Drafter", colorClass: "border-l-blue-500 bg-blue-500/5" },
  safety_guardian: { icon: Shield, label: "Safety Guardian", colorClass: "border-l-red-500 bg-red-500/5" },
  clinical_critic: { icon: Brain, label: "Clinical Critic", colorClass: "border-l-green-500 bg-green-500/5" },
  supervisor: { icon: Users, label: "Supervisor", colorClass: "border-l-purple-500 bg-purple-500/5" },
}

// Default config for unknown agent roles
const defaultConfig = { icon: Brain, label: "Agent", colorClass: "border-l-gray-500 bg-gray-500/5" }

interface AgentThoughtCardProps {
  thought: AgentThought
  isStreaming?: boolean
}

export function AgentThoughtCard({ thought, isStreaming }: AgentThoughtCardProps) {
  const config = agentConfig[thought.agentRole] || defaultConfig
  const Icon = config.icon

  return (
    <div
      className={cn(
        "rounded-md border border-border border-l-4 p-3 transition-all",
        config.colorClass,
        isStreaming && "thought-streaming",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate text-[10px] font-medium">{config.label}</span>
          <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
            {thought.type}
          </span>
        </div>
        <span className="shrink-0 text-[9px] text-muted-foreground">
          {(() => {
            try {
              if (thought.timestamp) {
                const date = new Date(thought.timestamp)
                if (!isNaN(date.getTime())) {
                  // Use local timezone - toLocaleTimeString automatically uses browser's timezone
                  return date.toLocaleTimeString(undefined, { 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: '2-digit',
                    hour12: true 
                  })
                }
              }
              // Fallback to current time if timestamp is invalid
              return new Date().toLocaleTimeString(undefined, { 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit',
                hour12: true 
              })
            } catch {
              return new Date().toLocaleTimeString(undefined, { 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit',
                hour12: true 
              })
            }
          })()}
        </span>
      </div>
      <div className="max-h-32 overflow-y-auto">
        <p className="break-words text-xs leading-relaxed text-foreground">{thought.content}</p>
      </div>
    </div>
  )
}
