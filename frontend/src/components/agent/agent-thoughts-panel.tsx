"use client"

import { useProtocolStore } from "@/stores/protocol-store"
import { AgentThoughtCard } from "./agent-thought-card"
import { Loader2, Brain } from "lucide-react"
import { useEffect, useRef, useMemo } from "react"
import type { AgentThought } from "@/types/protocols"

export function AgentThoughtsPanel() {
  const { activeProtocol, streamingThoughts, isStreaming } = useProtocolStore()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const userScrolledUpRef = useRef(false)
  const lastThoughtCountRef = useRef(0)

  const historicalThoughts = activeProtocol?.agentThoughts || []

  // Display thoughts - backend already sends them sorted by timestamp
  const sortedThoughts = useMemo(() => {
    // Both historical and streaming thoughts are already sorted by backend
    // Just deduplicate by ID (keep latest if duplicate) while preserving order
    const thoughtMap = new Map<string, AgentThought>()
    
    // Add historical thoughts first (already sorted)
    historicalThoughts.forEach((thought) => {
      if (thought.id) {
        thoughtMap.set(thought.id, thought)
      }
    })
    
    // Add streaming thoughts (already sorted, will overwrite duplicates)
    streamingThoughts.forEach((thought) => {
      if (thought.id) {
        thoughtMap.set(thought.id, thought)
      }
    })
    
    // Map preserves insertion order, so values are in correct order
    return Array.from(thoughtMap.values())
  }, [historicalThoughts, streamingThoughts])

  // Track user scroll to pause auto-scroll if they scroll up
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      if (!container) return
      const { scrollHeight, scrollTop, clientHeight } = container
      const isAtBottom = scrollHeight - scrollTop - clientHeight <= 10 // 10px threshold
      
      if (isAtBottom) {
        userScrolledUpRef.current = false
      } else {
        userScrolledUpRef.current = true
      }
    }

    container.addEventListener("scroll", handleScroll)
    return () => {
      container.removeEventListener("scroll", handleScroll)
    }
  }, [])

  // Auto-scroll to bottom when new thoughts arrive
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const currentCount = sortedThoughts.length
    const isNewThought = currentCount > lastThoughtCountRef.current
    lastThoughtCountRef.current = currentCount

    // Auto-scroll if:
    // 1. New thoughts arrived AND
    // 2. (Streaming is active OR user hasn't scrolled up)
    if (isNewThought && (isStreaming || !userScrolledUpRef.current)) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
          userScrolledUpRef.current = false // Reset after auto-scrolling
        }
      })
    }
  }, [sortedThoughts.length, isStreaming])

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
            <span>Active</span>
          </div>
        )}
      </div>
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ minHeight: 0 }}
      >
        <div className="p-4 space-y-3">
          {sortedThoughts.map((thought, index) => (
            <AgentThoughtCard
              key={thought.id || `thought-${index}-${thought.timestamp}`}
              thought={thought}
              isStreaming={isStreaming && index === sortedThoughts.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
