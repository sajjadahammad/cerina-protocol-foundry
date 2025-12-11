"use client"

import { useEffect, useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { pdf } from "@react-pdf/renderer"
import { useProtocolStore } from "@/stores/protocol-store"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Shield, Heart, IterationCw, Eye, Edit, AlertCircle, Check, X, Copy, Download, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MarkdownViewer } from "@/components/markdown-viewer"
import { toast } from "sonner"
import { ProtocolPDFDocument } from "./protocol-pdf"

export function ProtocolEditor() {
  const { activeProtocol, editedContent, setEditedContent, isStreaming } = useProtocolStore()
  const [viewMode, setViewMode] = useState<"edit" | "preview">("preview")
  const contentContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lastContentLengthRef = useRef(0)
  const userScrolledUpRef = useRef(false)

  // Get display content - prioritize editedContent, then currentDraft
  const displayContent = editedContent || activeProtocol?.currentDraft || ""

  // Sync editedContent with currentDraft when protocol changes
  useEffect(() => {
    if (activeProtocol?.currentDraft && !editedContent) {
      setEditedContent(activeProtocol.currentDraft)
    }
  }, [activeProtocol?.currentDraft, editedContent, setEditedContent])

  // Auto-scroll when content is streaming
  useEffect(() => {
    const currentLength = displayContent.length
    const isContentGrowing = currentLength > lastContentLengthRef.current
    
    if (isContentGrowing && isStreaming) {
      // Check if user has scrolled up (not at bottom)
      const container = viewMode === "edit" 
        ? textareaRef.current 
        : contentContainerRef.current
      
      if (container) {
        const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100 // 100px threshold
        
        // Auto-scroll only if user hasn't manually scrolled up
        if (isAtBottom || !userScrolledUpRef.current) {
          requestAnimationFrame(() => {
            if (container) {
              container.scrollTop = container.scrollHeight
              userScrolledUpRef.current = false
            }
          })
        } else {
          userScrolledUpRef.current = true
        }
      }
    }

    lastContentLengthRef.current = currentLength
  }, [displayContent, isStreaming, viewMode])

  // Handle manual scroll to detect if user scrolled up
  useEffect(() => {
    const container = viewMode === "edit" 
      ? textareaRef.current 
      : contentContainerRef.current
    
    if (!container) return

    const handleScroll = () => {
      if (isStreaming) {
        const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100
        userScrolledUpRef.current = !isAtBottom
      }
    }

    container.addEventListener("scroll", handleScroll)
    return () => container.removeEventListener("scroll", handleScroll)
  }, [viewMode, isStreaming])

  // Reset scroll tracking when streaming starts
  useEffect(() => {
    if (isStreaming) {
      lastContentLengthRef.current = displayContent.length
      userScrolledUpRef.current = false
    }
  }, [isStreaming])

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
  // Only show generating indicator if actively streaming AND content is still being generated
  const showGenerating = isStreaming && (activeProtocol.status === "reviewing" || activeProtocol.status === "drafting") && !displayContent

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayContent)
      toast.success("Protocol copied to clipboard")
    } catch (error) {
      toast.error("Failed to copy protocol")
    }
  }

  const handleDownload = () => {
    try {
      const blob = new Blob([displayContent], { type: "text/markdown" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${activeProtocol.title.replace(/\s+/g, "_")}_protocol.md`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success("Protocol downloaded successfully")
    } catch (error) {
      toast.error("Failed to download protocol")
    }
  }

  const handleDownloadPDF = async () => {
    try {
      toast.loading("Generating PDF...", { id: "pdf-generate" })
      
      const pdfDoc = (
        <ProtocolPDFDocument
          title={activeProtocol.title}
          intent={activeProtocol.intent}
          content={displayContent}
          safetyScore={activeProtocol.safetyScore?.score ?? 0}
          empathyScore={activeProtocol.empathyMetrics?.score ?? 0}
          iterationCount={activeProtocol.iterationCount}
          createdAt={activeProtocol.createdAt}
        />
      )

      const blob = await pdf(pdfDoc).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${activeProtocol.title.replace(/\s+/g, "_")}_protocol.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      toast.success("PDF downloaded successfully", { id: "pdf-generate" })
    } catch (error) {
      toast.error("Failed to generate PDF", { id: "pdf-generate" })
      console.error("PDF generation error:", error)
    }
  }

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
            {displayContent && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="h-7 text-xs"
                  title="Copy protocol to clipboard"
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copy
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDownload}
                  className="h-7 text-xs"
                  title="Download protocol as markdown file"
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Markdown
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDownloadPDF}
                  className="h-7 text-xs"
                  title="Download protocol as PDF"
                >
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  PDF
                </Button>
              </>
            )}
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
      <div className="flex-1 overflow-auto p-4" ref={contentContainerRef}>
        {viewMode === "edit" ? (
          <Textarea
            ref={textareaRef}
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
