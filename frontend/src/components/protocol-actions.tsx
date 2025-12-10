"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useProtocolStore } from "@/stores/protocol-store"
import { useApproveProtocol, useRejectProtocol, useHaltProtocol } from "@/hooks/use-protocols"
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
import { Check, X, Pause, Loader2, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

export function ProtocolActions() {
  const { activeProtocol, editedContent, isStreaming } = useProtocolStore()
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

  const approveMutation = useApproveProtocol()
  const rejectMutation = useRejectProtocol()
  const haltMutation = useHaltProtocol()

  if (!activeProtocol) return null

  const isAwaitingApproval = activeProtocol.status === "awaiting_approval"
  const canHalt = activeProtocol.status === "drafting" || activeProtocol.status === "reviewing"

  const handleApprove = () => {
    approveMutation.mutate({
      protocolId: activeProtocol.id,
      editedContent: editedContent !== activeProtocol.currentDraft ? editedContent : undefined,
    })
  }

  const handleReject = () => {
    rejectMutation.mutate(
      { protocolId: activeProtocol.id, reason: rejectReason },
      {
        onSuccess: () => {
          setRejectDialogOpen(false)
          setRejectReason("")
        },
      },
    )
  }

  const handleHalt = () => {
    haltMutation.mutate(activeProtocol.id)
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`shrink-0 border-t border-border ${isAwaitingApproval ? 'bg-amber-500/5' : 'bg-card'}`}
      >
        {/* Approval Alert and Buttons */}
        <AnimatePresence>
          {isAwaitingApproval && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Alert className="m-4 border-amber-500/50 bg-amber-500/10">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <AlertDescription className="text-sm text-amber-900 dark:text-amber-100">
                  <strong>Action Required:</strong> Review the protocol above and approve or reject it to finalize.
                </AlertDescription>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-2 p-4">
          {canHalt && (
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button variant="outline" onClick={handleHalt} disabled={haltMutation.isPending || !isStreaming}>
                {haltMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Pause className="mr-2 h-4 w-4" />
                )}
                Halt
              </Button>
            </motion.div>
          )}

          <div className="flex-1" />

          {/* Always show approval buttons when status is awaiting_approval */}
          {isAwaitingApproval && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-3"
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
        </div>
      </motion.div>

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
    </>
  )
}
