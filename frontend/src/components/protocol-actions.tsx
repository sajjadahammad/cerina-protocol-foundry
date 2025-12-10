"use client"

import { useState } from "react"
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
import { Check, X, Pause, Loader2 } from "lucide-react"

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
      <div className="flex items-center gap-2 border-t border-border bg-card p-4">
        {canHalt && (
          <Button variant="outline" onClick={handleHalt} disabled={haltMutation.isPending || !isStreaming}>
            {haltMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Pause className="mr-2 h-4 w-4" />
            )}
            Halt
          </Button>
        )}

        <div className="flex-1" />

        {isAwaitingApproval && (
          <>
            <Button variant="outline" onClick={() => setRejectDialogOpen(true)} disabled={rejectMutation.isPending}>
              <X className="mr-2 h-4 w-4" />
              Reject
            </Button>
            <Button onClick={handleApprove} disabled={approveMutation.isPending}>
              {approveMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Approve
            </Button>
          </>
        )}
      </div>

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
