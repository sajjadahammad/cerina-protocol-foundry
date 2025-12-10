"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useProtocolStore } from "@/stores/protocol-store"
import { AgentThoughtCard } from "./agent-thought-card"
import { Loader2, Brain } from "lucide-react"
import { useEffect, useRef, useState, useMemo } from "react"
import type { AgentThought } from "@/lib/protocols"

// Fallback processing function (runs on main thread if worker unavailable)
function processThoughtsSync(
  historicalThoughts: AgentThought[],
  streamingThoughts: AgentThought[]
): AgentThought[] {
  const thoughtMap = new Map<string, AgentThought>()

  historicalThoughts.forEach((thought) => {
    if (thought.id) {
      thoughtMap.set(thought.id, thought)
    }
  })

  streamingThoughts.forEach((thought) => {
    if (thought.id) {
      thoughtMap.set(thought.id, thought)
    }
  })

  const allThoughts = Array.from(thoughtMap.values())
  const filteredThoughts = allThoughts.filter((thought, index, arr) => {
    if (thought.type === "action" || thought.type === "thought") {
      return true
    }
    if (thought.type === "feedback") {
      const previousFeedback = arr
        .slice(0, index)
        .reverse()
        .find((t) => t.agentRole === thought.agentRole && t.type === "feedback")
      if (previousFeedback && previousFeedback.content === thought.content) {
        return false
      }
      return true
    }
    return true
  })

  return filteredThoughts.sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime()
    const timeB = new Date(b.timestamp).getTime()
    return timeA - timeB
  })
}

export function AgentThoughtsPanel() {
  const { activeProtocol, streamingThoughts, isStreaming } = useProtocolStore()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const [processedThoughts, setProcessedThoughts] = useState<AgentThought[]>([])
  const [useWorker, setUseWorker] = useState(true)

  const historicalThoughts = activeProtocol?.agentThoughts || []

  // Initialize web worker
  useEffect(() => {
    if (typeof window === "undefined") return

    try {
      const worker = new Worker(
        new URL("../workers/thought-processor.worker.ts", import.meta.url),
        { type: "module" }
      )

      worker.onmessage = (e) => {
        setProcessedThoughts(e.data.sortedThoughts)
      }

      worker.onerror = (error) => {
        console.warn("Web worker error, falling back to main thread processing:", error)
        setUseWorker(false)
        worker.terminate()
      }

      workerRef.current = worker

      return () => {
        worker.terminate()
        workerRef.current = null
      }
    } catch (error) {
      console.warn("Failed to initialize web worker, using main thread:", error)
      setUseWorker(false)
    }
  }, [])

  // Process thoughts - use worker if available, otherwise use memoized sync processing
  const sortedThoughts = useMemo(() => {
    if (!useWorker || !workerRef.current) {
      return processThoughtsSync(historicalThoughts, streamingThoughts)
    }
    return processedThoughts
  }, [historicalThoughts, streamingThoughts, useWorker, processedThoughts])

  // Send data to worker when it changes
  useEffect(() => {
    if (useWorker && workerRef.current) {
      workerRef.current.postMessage({
        historicalThoughts,
        streamingThoughts,
      })
    }
  }, [historicalThoughts, streamingThoughts, useWorker])

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
