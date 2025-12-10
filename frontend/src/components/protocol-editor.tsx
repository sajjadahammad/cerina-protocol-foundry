"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useProtocolStore } from "@/stores/protocol-store"
import type { AgentThought } from "@/lib/protocols"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Shield, Heart, IterationCw, Eye, Edit } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MarkdownViewer } from "@/components/markdown-viewer"

export function ProtocolEditor() {
  const { activeProtocol, editedContent, setEditedContent, addStreamingThought, setStreaming, setActiveProtocol } = useProtocolStore()
  const [viewMode, setViewMode] = useState<"edit" | "preview">("preview")
  const [isStreamActive, setIsStreamActive] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const hasStartedStreamRef = useRef(false)

  // Get auth token for API calls
  const authToken = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null

  // Manual streaming function
  const startStream = useCallback(async (protocolId: string) => {
    if (hasStartedStreamRef.current || !authToken) return
    hasStartedStreamRef.current = true
    
    // Abort any existing stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    const abortController = new AbortController()
    abortControllerRef.current = abortController
    setIsStreamActive(true)
    setStreaming(true)
    
    try {
      const response = await fetch(`/api/protocol/${protocolId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ protocolId }),
        signal: abortController.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error("No response body")
      }

      const decoder = new TextDecoder()
      let buffer = ""
      let accumulatedContent = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (!line.trim()) continue

          // Parse Vercel AI SDK format: "0:content" or "8:data"
          const match = line.match(/^(\d+):(.+)$/)
          if (match) {
            const type = parseInt(match[1])
            const content = match[2]

            if (type === 0) {
              // Text content delta
              try {
                const textContent = JSON.parse(content)
                accumulatedContent += textContent
                setEditedContent(accumulatedContent)
              } catch {
                // Not JSON, use as-is
                accumulatedContent += content
                setEditedContent(accumulatedContent)
              }
            } else if (type === 8) {
              // Annotation/data
              try {
                const data = JSON.parse(content)
                if (data.type === "agent_thought" && data.id && data.content) {
                  const thought: AgentThought = {
                    id: data.id,
                    agentRole: data.agentRole || "supervisor",
                    agentName: data.agentName || "Agent",
                    content: data.content,
                    timestamp: data.timestamp || new Date().toISOString(),
                    type: data.thoughtType || "thought",
                  }
                  addStreamingThought(thought)
                } else if (data.type === "final") {
                  // Update protocol with final state
                  setActiveProtocol((prev) => {
                    if (prev?.id === protocolId) {
                      return {
                        ...prev,
                        status: data.status,
                        currentDraft: data.currentDraft || accumulatedContent,
                        iterationCount: data.iterationCount,
                        safetyScore: data.safetyScore,
                        empathyMetrics: data.empathyMetrics,
                      }
                    }
                    return prev
                  })
                  if (data.currentDraft) {
                    setEditedContent(data.currentDraft)
                  }
                }
              } catch (e) {
                console.error("Error parsing annotation:", e)
              }
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name !== "AbortError") {
        console.error("Stream error:", error)
      }
    } finally {
      setIsStreamActive(false)
      setStreaming(false)
      abortControllerRef.current = null
    }
  }, [authToken, addStreamingThought, setEditedContent, setStreaming, setActiveProtocol])

  // Auto-start streaming when protocol is in reviewing state
  useEffect(() => {
    const protocolId = activeProtocol?.id
    const protocolStatus = activeProtocol?.status
    
    if (protocolId && protocolStatus === "reviewing" && !isStreamActive && !hasStartedStreamRef.current) {
      startStream(protocolId)
    }
    
    // Reset when protocol changes
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [activeProtocol?.id, activeProtocol?.status, isStreamActive, startStream])

  // Reset stream flag when protocol changes
  useEffect(() => {
    hasStartedStreamRef.current = false
  }, [activeProtocol?.id])

  // Get display content
  const displayContent = editedContent || activeProtocol?.currentDraft || ""

  if (!activeProtocol) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>No protocol selected</p>
      </div>
    )
  }

  // Show generating indicator only when actively streaming AND status is reviewing
  const showGenerating = isStreamActive && activeProtocol.status === "reviewing"

  return (
    <div className="flex h-full flex-col">
      {/* Header with metrics */}
      <div className="border-b border-border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{activeProtocol.title}</h2>
          <Badge
            variant={
              activeProtocol.status === "approved"
                ? "default"
                : activeProtocol.status === "awaiting_approval"
                  ? "secondary"
                  : "outline"
            }
          >
            {activeProtocol.status.replace("_", " ")}
          </Badge>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">{activeProtocol.intent}</p>

        {/* Metrics */}
        <div className="flex flex-wrap gap-2 sm:gap-4">
          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5">
            <Shield className="h-4 w-4 text-red-500" />
            <span className="text-xs">
              Safety: <strong>{activeProtocol.safetyScore.score}%</strong>
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5">
            <Heart className="h-4 w-4 text-pink-500" />
            <span className="text-xs">
              Empathy: <strong>{activeProtocol.empathyMetrics.score}%</strong>
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5">
            <IterationCw className="h-4 w-4 text-blue-500" />
            <span className="text-xs">
              Iterations: <strong>{activeProtocol.iterationCount}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Editor/Preview Toggle */}
      <div className="border-b border-border px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button
              variant={viewMode === "preview" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("preview")}
              className="h-7 text-xs"
            >
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              Preview
            </Button>
            <Button
              variant={viewMode === "edit" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("edit")}
              className="h-7 text-xs"
              disabled={activeProtocol.status === "approved"}
            >
              <Edit className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
          {showGenerating && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
              <span>Content is being generated...</span>
            </div>
          )}
        </div>
      </div>

      {/* Editor/Preview Content */}
      <div className="flex-1 overflow-auto p-4">
        {viewMode === "edit" ? (
          <Textarea
            value={displayContent}
            onChange={(e) => setEditedContent(e.target.value)}
            className="h-full min-h-[300px] resize-none font-mono text-sm leading-relaxed"
            placeholder="Protocol content will appear here..."
            disabled={activeProtocol.status === "approved"}
          />
        ) : (
          <div className="h-full min-h-[300px] rounded-md border border-border bg-card p-4">
            {displayContent ? (
              <MarkdownViewer content={displayContent} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className="mb-2 flex justify-center">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                  </div>
                  <p className="text-sm text-muted-foreground">Generating protocol content...</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Safety Flags */}
      {activeProtocol.safetyScore.flags.length > 0 && (
        <div className="border-t border-border p-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Safety Flags</p>
          <div className="flex flex-wrap gap-2">
            {activeProtocol.safetyScore.flags.map((flag, index) => (
              <Badge key={index} variant="destructive" className="text-xs">
                {flag}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
