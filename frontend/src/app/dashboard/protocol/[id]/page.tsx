"use client"

import { use, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useProtocol, useProtocolStream, useApproveProtocol, useRejectProtocol } from "@/hooks/use-protocols"
import { AgentThoughtsPanel } from "@/components/agent-thoughts-panel"
import { ProtocolEditor } from "@/components/protocol-editor"
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
import { ArrowLeft, Loader2, Check, X } from "lucide-react"
import Link from "next/link"
import { useProtocolStore } from "@/stores/protocol-store"

export default function ProtocolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: protocol, isLoading, refetch } = useProtocol(id)
  const { connect, disconnect } = useProtocolStream(id)
  const { setActiveProtocol, editedContent } = useProtocolStore()
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

  const approveMutation = useApproveProtocol()
  const rejectMutation = useRejectProtocol()

  // Sync active protocol with fetched data
  useEffect(() => {
    if (protocol) {
      setActiveProtocol(protocol)
    }
  }, [protocol, setActiveProtocol])

  useEffect(() => {
    if (!protocol) return

    // Connect SSE for agent thoughts if protocol is in an active state
    const activeStatuses = ["drafting", "reviewing", "awaiting_approval"]
    const shouldConnect = activeStatuses.includes(protocol.status)

    if (shouldConnect) {
      connect()
    } else {
      disconnect()
      // Refetch once when workflow completes to get final state
      if (protocol.status === "approved" || protocol.status === "rejected") {
        refetch()
      }
    }

    return () => {
      // Only disconnect on unmount
      disconnect()
    }
  }, [protocol?.id, connect, disconnect]) // Reconnect if protocol ID changes

  // Separate effect to handle status changes and periodic refetch
  useEffect(() => {
    if (!protocol) return

    if (protocol.status === "awaiting_approval") {
      // Refetch to get final state when workflow completes
      refetch()
    } else if (protocol.status === "reviewing" || protocol.status === "drafting") {
      // Periodic refetch as fallback to ensure we get updates even if SSE fails
      const fallbackInterval = setInterval(() => {
        refetch()
      }, 10000) // Refetch every 10 seconds as fallback

      return () => {
        clearInterval(fallbackInterval)
      }
    }
  }, [protocol?.status, protocol?.id, refetch])

  const handleApprove = () => {
    if (!protocol) return
    approveMutation.mutate({
      protocolId: protocol.id,
      editedContent: editedContent !== protocol.currentDraft ? editedContent : undefined,
    })
  }

  const handleReject = () => {
    if (!protocol) return
    rejectMutation.mutate(
      { protocolId: protocol.id, reason: rejectReason },
      {
        onSuccess: () => {
          setRejectDialogOpen(false)
          setRejectReason("")
        },
      },
    )
  }

  const isAwaitingApproval = protocol?.status === "awaiting_approval"

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon">
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
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={!rejectReason || rejectMutation.isPending}>
              {rejectMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Reject Protocol
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
