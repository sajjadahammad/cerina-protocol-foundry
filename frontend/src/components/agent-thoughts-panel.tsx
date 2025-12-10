"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useProtocolStore } from "@/stores/protocol-store"
import { AgentThoughtCard } from "./agent-thought-card"
import { Loader2, Brain } from "lucide-react"
import { useEffect, useRef } from "react"

export function AgentThoughtsPanel() {
  const { activeProtocol, streamingThoughts, isStreaming } = useProtocolStore()
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Combine historical and streaming thoughts, deduplicating by ID
  const historicalThoughts = activeProtocol?.agentThoughts || []
  const thoughtMap = new Map<string, typeof historicalThoughts[0]>()
  
  // Add historical thoughts first
  historicalThoughts.forEach((thought) => {
    if (thought.id) {
      thoughtMap.set(thought.id, thought)
    }
  })
  
  // Add streaming thoughts (will overwrite historical if same ID, keeping latest)
  streamingThoughts.forEach((thought) => {
    if (thought.id) {
      thoughtMap.set(thought.id, thought)
    }
  })
  
  // Filter to show only relevant thoughts:
  // - Remove duplicate feedback messages with same content
  // - Keep only the most recent thought per agent per type
  const allThoughts = Array.from(thoughtMap.values())
  const filteredThoughts = allThoughts.filter((thought, index, arr) => {
    // Keep all action and thought types
    if (thought.type === "action" || thought.type === "thought") {
      return true
    }
    // For feedback types, only keep if it's different from previous feedback from same agent
    if (thought.type === "feedback") {
      const previousFeedback = arr
        .slice(0, index)
        .reverse()
        .find((t) => t.agentRole === thought.agentRole && t.type === "feedback")
      if (previousFeedback && previousFeedback.content === thought.content) {
        return false // Duplicate feedback, skip it
      }
      return true
    }
    return true
  })
  
  // Sort by timestamp to maintain chronological order
  const sortedThoughts = filteredThoughts.sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime()
    const timeB = new Date(b.timestamp).getTime()
    return timeA - timeB
  })

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
  }, [sortedThoughts.length, sortedThoughts])

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
