"use client"

import { use, useEffect } from "react"
import { useProtocol, useProtocolStream } from "@/hooks/use-protocols"
import { AgentThoughtsPanel } from "@/components/agent-thoughts-panel"
import { ProtocolEditor } from "@/components/protocol-editor"
import { ProtocolActions } from "@/components/protocol-actions"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2 } from "lucide-react"
import Link from "next/link"
import { useProtocolStore } from "@/stores/protocol-store"

export default function ProtocolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: protocol, isLoading, refetch } = useProtocol(id)
  const { connect, disconnect } = useProtocolStream(id)
  const { setActiveProtocol } = useProtocolStore()

  // Sync active protocol with fetched data
  useEffect(() => {
    if (protocol) {
      setActiveProtocol(protocol)
    }
  }, [protocol, setActiveProtocol])

  useEffect(() => {
    if (protocol) {
      // Connect SSE for agent thoughts if protocol is in an active state
      const activeStatuses = ["drafting", "reviewing"]
      const shouldConnect = activeStatuses.includes(protocol.status)

      if (shouldConnect) {
        connect()
      } else {
        disconnect()
        // Refetch once when workflow completes to get final state
        if (protocol.status === "awaiting_approval") {
          refetch()
        }
      }
    }

    return () => {
      disconnect()
    }
  }, [protocol?.status, connect, disconnect, refetch])

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
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Editor Panel */}
        <div className="flex flex-1 flex-col overflow-hidden border-b border-border lg:border-b-0 lg:border-r">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ProtocolEditor />
          </div>
          <ProtocolActions />
        </div>

        {/* Agent Thoughts Panel */}
        <div className="h-96 border-t border-border bg-muted/30 lg:h-auto lg:w-96 lg:border-t-0">
          <AgentThoughtsPanel />
        </div>
      </div>
    </div>
  )
}
