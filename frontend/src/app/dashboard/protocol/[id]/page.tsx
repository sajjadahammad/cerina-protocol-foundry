"use client"

import { use, useEffect, useState, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useProtocolStream, useApproveProtocol, useRejectProtocol } from "@/hooks/use-protocols"
import { AgentThoughtsPanel } from "@/components/agent/agent-thoughts-panel"
import { ProtocolEditor } from "@/components/protocol/protocol-editor"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ArrowLeft, Loader2, Check, X, AlertCircle, RefreshCw, WifiOff } from "lucide-react"
import Link from "next/link"
import { useProtocolStore } from "@/stores/protocol-store"
import { toast } from "sonner"

export default function ProtocolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: protocol, isLoading, error, refetch, connect, disconnect, isConnected, connectionError } = useProtocolStream(id)
  const { setActiveProtocol, editedContent } = useProtocolStore()
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

  const approveMutation = useApproveProtocol()
  const rejectMutation = useRejectProtocol()

  // Track refetched statuses to prevent infinite loops
  const refetchedStatusRef = useRef<Set<string>>(new Set())
  const lastStatusRef = useRef<string | null>(null)
  const lastProtocolIdRef = useRef<string | null>(null)

  // Reset tracking when protocol ID changes
  useEffect(() => {
    if (protocol?.id && lastProtocolIdRef.current !== protocol.id) {
      refetchedStatusRef.current.clear()
      lastStatusRef.current = null
      lastProtocolIdRef.current = protocol.id
    }
  }, [protocol?.id])


  // Handle connection/disconnection based on protocol status
  useEffect(() => {
    if (!protocol) return

    const status = protocol.status
    const protocolId = protocol.id

    // Connect streaming for agent thoughts if protocol is in an active state
    // Note: "awaiting_approval" is excluded - streaming stops when protocol reaches this state
    const activeStatuses = ["drafting", "reviewing"]
    const shouldConnect = activeStatuses.includes(status)

    if (shouldConnect && !isConnected) {
      // Only connect if not already connected
      connect()
    } else if (!shouldConnect && isConnected) {
      disconnect()
    }

    // Refetch once when status changes to terminal state
    // Only refetch if SSE is not connected (SSE should have already updated the cache)
    const terminalStatuses = ["approved", "rejected", "awaiting_approval"]
    if (terminalStatuses.includes(status) && lastStatusRef.current !== status && !isConnected) {
      const statusKey = `${protocolId}-${status}`
      if (!refetchedStatusRef.current.has(statusKey)) {
        refetchedStatusRef.current.add(statusKey)
        refetch()
      }
      lastStatusRef.current = status
    }

    return () => {
      // Only disconnect on unmount
      if (isConnected) {
        disconnect()
      }
    }
  }, [protocol?.id, protocol?.status, isConnected, connect, disconnect, refetch])

  // Fallback refetch only when SSE is disconnected and protocol is active
  useEffect(() => {
    if (!protocol) return

    const status = protocol.status
    const activeStatuses = ["reviewing", "drafting","awaiting_approval"]
    
    // Only set up fallback if status is active AND not connected
    if (activeStatuses.includes(status) && !isConnected) {
      const fallbackInterval = setInterval(() => {
        refetch()
      }, 15000) // Refetch every 15 seconds as fallback

      return () => clearInterval(fallbackInterval)
    }
  }, [protocol?.status, isConnected, refetch])

  const handleApprove = useCallback(() => {
    if (!protocol) return
    approveMutation.mutate(
      {
        protocolId: protocol.id,
        editedContent: editedContent !== protocol.currentDraft ? editedContent : undefined,
      },
      {
        onSuccess: () => {
          toast.success("Protocol approved successfully")
          // Refetch to get updated protocol data immediately
          refetch()
        },
        onError: (error: any) => {
          const message = error?.response?.data?.detail || error?.message || "Failed to approve protocol"
          toast.error(message)
        },
      },
    )
  }, [protocol, editedContent, approveMutation, refetch])

  const handleReject = useCallback(() => {
    if (!protocol) return
    rejectMutation.mutate(
      { protocolId: protocol.id, reason: rejectReason },
      {
        onSuccess: () => {
          setRejectDialogOpen(false)
          setRejectReason("")
          toast.success("Protocol rejected")
          // Refetch to get updated protocol data immediately
          refetch()
        },
        onError: (error: any) => {
          const message = error?.response?.data?.detail || error?.message || "Failed to reject protocol"
          toast.error(message)
        },
      },
    )
  }, [protocol, rejectReason, rejectMutation, refetch])

  const handleRetry = useCallback(() => {
    refetch()
    if (protocol) {
      const activeStatuses = ["drafting", "reviewing"]
      if (activeStatuses.includes(protocol.status)) {
        connect()
      }
    }
  }, [protocol, refetch, connect])

  const isAwaitingApproval = protocol?.status === "awaiting_approval"

  // Handle loading state
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center" role="status" aria-label="Loading protocol">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading protocol...</p>
        </div>
      </div>
    )
  }

  // Handle error state
  if (error) {
    const isNotFound = (error as any)?.response?.status === 404
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{isNotFound ? "Protocol Not Found" : "Error Loading Protocol"}</AlertTitle>
          <AlertDescription className="mt-2">
            {isNotFound
              ? "The protocol you're looking for doesn't exist or has been deleted."
              : (error as any)?.response?.data?.detail || (error as any)?.message || "An unexpected error occurred."}
          </AlertDescription>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => refetch()} aria-label="Retry loading protocol">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
            <Link href="/dashboard">
              <Button variant="ghost" aria-label="Go back to dashboard">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </Alert>
      </div>
    )
  }

  // Handle case where protocol is null after loading
  if (!protocol) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Protocol Not Available</AlertTitle>
          <AlertDescription className="mt-2">Unable to load protocol data.</AlertDescription>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => refetch()} aria-label="Retry loading protocol">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
            <Link href="/dashboard">
              <Button variant="ghost" aria-label="Go back to dashboard">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" aria-label="Go back to dashboard">
            <Button variant="ghost" size="icon" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Protocol Review</h1>
            <p className="text-xs text-muted-foreground">Human-in-the-Loop Approval</p>
          </div>
        </div>

        {/* Approval Buttons */}
        <AnimatePresence>
          {isAwaitingApproval && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="flex items-center gap-2"
            >
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant="outline"
                  onClick={() => setRejectDialogOpen(true)}
                  disabled={rejectMutation.isPending}
                  className="border-red-500/50 text-red-600 hover:bg-red-500/10 dark:text-red-400"
                  aria-label="Reject protocol"
                >
                  <X className="mr-2 h-4 w-4" />
                  Reject
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  onClick={handleApprove}
                  disabled={approveMutation.isPending}
                  className="bg-green-600 text-white hover:bg-green-700"
                  aria-label="Approve protocol"
                >
                  {approveMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  Approve Protocol
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* SSE Connection Error Banner */}
      <AnimatePresence>
        {connectionError && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="border-b border-amber-500/50 bg-amber-500/10 px-6 py-2"
          >
            <Alert variant="default" className="border-amber-500/50 bg-transparent py-2">
              <WifiOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertTitle className="text-sm text-amber-600 dark:text-amber-400">
                Connection Issue
              </AlertTitle>
              <AlertDescription className="text-xs text-amber-600/80 dark:text-amber-400/80">
                {connectionError}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRetry}
                  className="ml-2 h-auto p-0 text-xs underline"
                  aria-label="Retry connection"
                >
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Editor Panel */}
        <div className="flex flex-1 flex-col overflow-hidden border-b border-border lg:border-b-0 lg:border-r">
          <ProtocolEditor />
        </div>

        {/* Agent Thoughts Panel */}
        <div className="h-96 border-t border-border bg-muted/30 lg:h-auto lg:w-96 lg:border-t-0">
          <AgentThoughtsPanel />
        </div>
      </div>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Protocol</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejection. This feedback will be used to improve the protocol.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Enter rejection reason..."
            rows={4}
            aria-label="Rejection reason"
            aria-required="true"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
              aria-label="Cancel rejection"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              aria-label="Confirm protocol rejection"
            >
              {rejectMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Reject Protocol
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
