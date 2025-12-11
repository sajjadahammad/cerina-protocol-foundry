"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useProtocolStore } from "@/stores/protocol-store"
import { AgentThoughtCard } from "./agent-thought-card"
import { Loader2, Brain } from "lucide-react"
import { useEffect, useRef, useMemo } from "react"
import type { AgentThought } from "@/types/protocols"
import { processThoughts } from "@/utils/thought-processor"

export function AgentThoughtsPanel() {
  const { activeProtocol, streamingThoughts, isStreaming } = useProtocolStore()
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const historicalThoughts = activeProtocol?.agentThoughts || []

  // Process thoughts directly without web worker
  const sortedThoughts = useMemo(() => {
    return processThoughts(historicalThoughts, streamingThoughts)
  }, [historicalThoughts, streamingThoughts])

  // Auto-scroll to bottom when new thoughts arrive
  useEffect(() => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current
      // Only auto-scroll if user is near bottom (within 100px)
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
      if (isNearBottom) {
        // Use requestAnimationFrame to ensure DOM is updated
        requestAnimationFrame(() => {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
          }
        })
      }
    }
  }, [sortedThoughts.length])

  if (sortedThoughts.length === 0 && !isStreaming) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <Brain className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h3 className="text-sm font-medium text-muted-foreground">No agent activity yet</h3>
        <p className="mt-1 text-xs text-muted-foreground/70">Agent thoughts will appear here in real-time</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">Agent Activity</h3>
        {isStreaming && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Processing...</span>
          </div>
        )}
      </div>
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ minHeight: 0 }}
      >
        <div className="p-4 space-y-3">
          <AnimatePresence mode="popLayout">
            {sortedThoughts.map((thought, index) => (
              <AgentThoughtCard
                key={thought.id || `thought-${index}-${thought.timestamp}`}
                thought={thought}
                isStreaming={isStreaming && index === sortedThoughts.length - 1}
                index={index}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
