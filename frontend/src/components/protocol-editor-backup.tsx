"use client"

import { useEffect, useState } from "react"
import { useProtocolStore } from "@/stores/protocol-store"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Shield, Heart, IterationCw, Eye, Edit } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MarkdownViewer } from "@/components/markdown-viewer"

/**
 * BACKUP - Original protocol editor implementation.
 * Kept for reference. New implementation uses Vercel AI SDK useChat.
 */
export function ProtocolEditorBackup() {
  const { activeProtocol, editedContent, setEditedContent } = useProtocolStore()
  const [viewMode, setViewMode] = useState<"edit" | "preview">("preview")

  // Sync editedContent with protocol's currentDraft when it updates
  useEffect(() => {
    if (!activeProtocol?.currentDraft) return
    
    const draftLength = activeProtocol.currentDraft.length
    const currentLength = editedContent?.length || 0
    
    // Update if:
    // 1. No content yet
    // 2. Draft is significantly longer (new content added)
    // 3. Status is reviewing (actively streaming)
    // 4. Content is completely different (more than 50% different)
    const isSignificantlyDifferent = Math.abs(draftLength - currentLength) > 100
    const shouldUpdate = !editedContent || 
                        draftLength > currentLength + 50 || 
                        activeProtocol.status === "reviewing" ||
                        (isSignificantlyDifferent && activeProtocol.status !== "approved")
    
    if (shouldUpdate) {
      setEditedContent(activeProtocol.currentDraft)
    }
  }, [activeProtocol?.currentDraft, activeProtocol?.status, editedContent, setEditedContent])

  if (!activeProtocol) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>No protocol selected</p>
      </div>
    )
  }

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
          {activeProtocol.status === "reviewing" && (
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
            value={editedContent || activeProtocol.currentDraft}
            onChange={(e) => setEditedContent(e.target.value)}
            className="h-full min-h-[300px] resize-none font-mono text-sm leading-relaxed"
            placeholder="Protocol content will appear here..."
            disabled={activeProtocol.status === "approved"}
          />
        ) : (
          <div className="h-full min-h-[300px] rounded-md border border-border bg-card p-4">
            {editedContent || activeProtocol.currentDraft ? (
              <MarkdownViewer content={editedContent || activeProtocol.currentDraft} />
            ) : (
              <p className="text-sm text-muted-foreground">No content yet. Protocol is being generated...</p>
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

