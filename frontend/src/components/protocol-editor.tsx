"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useProtocolStore } from "@/stores/protocol-store"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Shield, Heart, IterationCw, Eye, Edit, AlertCircle, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MarkdownViewer } from "@/components/markdown-viewer"

export function ProtocolEditor() {
  const { activeProtocol, editedContent, setEditedContent, isStreaming } = useProtocolStore()
  const [viewMode, setViewMode] = useState<"edit" | "preview">("preview")

  // Get display content - prioritize editedContent, then currentDraft
  const displayContent = editedContent || activeProtocol?.currentDraft || ""

  // Sync editedContent with currentDraft when protocol changes
  useEffect(() => {
    if (activeProtocol?.currentDraft && !editedContent) {
      setEditedContent(activeProtocol.currentDraft)
    }
  }, [activeProtocol?.currentDraft, editedContent, setEditedContent])

  if (!activeProtocol) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>No protocol selected</p>
      </div>
    )
  }

  const isAwaitingApproval = activeProtocol.status === "awaiting_approval"
  const isApproved = activeProtocol.status === "approved"
  const isRejected = activeProtocol.status === "rejected"
  const showGenerating = isStreaming && (activeProtocol.status === "reviewing" || activeProtocol.status === "drafting")

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header with metrics */}
      <div className="border-b border-border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{activeProtocol.title}</h2>
          <Badge
            variant={
              isApproved
                ? "default"
                : isAwaitingApproval
                  ? "secondary"
                  : "outline"
            }
            className={isAwaitingApproval ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" : ""}
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
              Safety: <strong>{activeProtocol.safetyScore?.score ?? 0}%</strong>
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5">
            <Heart className="h-4 w-4 text-pink-500" />
            <span className="text-xs">
              Empathy: <strong>{activeProtocol.empathyMetrics?.score ?? 0}%</strong>
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
              disabled={isApproved}
            >
              <Edit className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
          <AnimatePresence mode="wait">
            {showGenerating && (
              <motion.div
                key="generating"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                <span>Content is being generated...</span>
              </motion.div>
            )}
            {isAwaitingApproval && (
              <motion.div
                key="awaiting"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400"
              >
                <AlertCircle className="h-3.5 w-3.5" />
                <span>Awaiting your approval</span>
              </motion.div>
            )}
            {isApproved && (
              <motion.div
                key="approved"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Protocol approved</span>
              </motion.div>
            )}
            {isRejected && (
              <motion.div
                key="rejected"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400"
              >
                <X className="h-3.5 w-3.5" />
                <span>Protocol rejected</span>
              </motion.div>
            )}
          </AnimatePresence>
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
            disabled={isApproved}
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
      {activeProtocol.safetyScore?.flags && activeProtocol.safetyScore.flags.length > 0 && (
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
