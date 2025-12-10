"use client"

import { useProtocolStore } from "@/stores/protocol-store"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Shield, Heart, IterationCw } from "lucide-react"

export function ProtocolEditor() {
  const { activeProtocol, editedContent, setEditedContent } = useProtocolStore()

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
        <div className="flex gap-4">
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

      {/* Editor */}
      <div className="flex-1 p-4">
        <Textarea
          value={editedContent}
          onChange={(e) => setEditedContent(e.target.value)}
          className="h-full min-h-[300px] resize-none font-mono text-sm leading-relaxed"
          placeholder="Protocol content will appear here..."
          disabled={activeProtocol.status === "approved"}
        />
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
