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
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          <span className="text-xs font-medium">{config.label}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {thought.type}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">{new Date(thought.timestamp).toLocaleTimeString()}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{thought.content}</p>
    </div>
  )
}
