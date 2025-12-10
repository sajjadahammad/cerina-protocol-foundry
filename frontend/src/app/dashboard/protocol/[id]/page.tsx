"use client"

import { use, useEffect } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { useProtocol, useProtocolStream } from "@/hooks/use-protocols"
import { AgentThoughtsPanel } from "@/components/agent-thoughts-panel"
import { ProtocolEditor } from "@/components/protocol-editor"
import { ProtocolActions } from "@/components/protocol-actions"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2 } from "lucide-react"
import Link from "next/link"

export default function ProtocolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: protocol, isLoading } = useProtocol(id)
  const { connect, disconnect } = useProtocolStream(id)

  useEffect(() => {
    if (protocol) {
      // Connect if protocol is in an active state or just created (might be transitioning)
      const activeStatuses = ["drafting", "reviewing", "awaiting_approval"]
      // Also connect if rejected but has no thoughts yet (might be starting)
      const shouldConnect =
        activeStatuses.includes(protocol.status) ||
        (protocol.status === "rejected" && protocol.agentThoughts.length <= 1)

      if (shouldConnect) {
        connect()
      } else {
        disconnect()
      }
    }

    return () => {
      disconnect()
    }
  }, [protocol, connect, disconnect])

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-border px-6 py-4">
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

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Editor Panel */}
          <div className="flex flex-1 flex-col border-r border-border">
            <ProtocolEditor />
            <ProtocolActions />
          </div>

          {/* Agent Thoughts Panel */}
          <div className="w-96 bg-muted/30">
            <AgentThoughtsPanel />
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
