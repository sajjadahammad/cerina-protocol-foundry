"use client"

import { useProtocolStore } from "@/stores/protocol-store"
import { AgentThoughtCard } from "./agent-thought-card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, Brain } from "lucide-react"
import { useEffect, useRef } from "react"

export function AgentThoughtsPanel() {
  const { activeProtocol, streamingThoughts, isStreaming } = useProtocolStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Combine historical and streaming thoughts
  const allThoughts = [...(activeProtocol?.agentThoughts || []), ...streamingThoughts]

  // Auto-scroll to bottom when new thoughts arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [allThoughts.length])

  if (allThoughts.length === 0 && !isStreaming) {
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
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-3">
          {allThoughts.map((thought, index) => (
            <AgentThoughtCard
              key={thought.id || index}
              thought={thought}
              isStreaming={isStreaming && index === allThoughts.length - 1}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
