"use client"

import Link from "next/link"
import { useProtocols } from "@/hooks/use-protocols"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowRight, Loader2 } from "lucide-react"

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  approved: "default",
  awaiting_approval: "secondary",
  drafting: "outline",
  reviewing: "outline",
  rejected: "destructive",
}

export function RecentProtocols() {
  const { data: protocols, isLoading } = useProtocols()

  const recentProtocols = protocols?.slice(0, 5) || []

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Recent Protocols</CardTitle>
        <Link href="/dashboard/history">
          <Button variant="ghost" size="sm" className="text-xs">
            View all
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : recentProtocols.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No protocols yet</p>
            <Link href="/dashboard/new">
              <Button variant="link" size="sm" className="mt-2">
                Create your first protocol
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {recentProtocols.map((protocol) => (
              <Link
                key={protocol.id}
                href={`/dashboard/protocol/${protocol.id}`}
                className="block rounded-md border border-border p-3 transition-colors hover:bg-accent"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="text-sm font-medium">{protocol.title}</h4>
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{protocol.intent}</p>
                  </div>
                  <Badge variant={statusVariant[protocol.status]} className="ml-2 text-[10px]">
                    {protocol.status.replace("_", " ")}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground sm:gap-4">
                  <span className="whitespace-nowrap">Safety: {protocol.safetyScore.score}%</span>
                  <span className="whitespace-nowrap">Empathy: {protocol.empathyMetrics.score}%</span>
                  <span className="whitespace-nowrap">Iterations: {protocol.iterationCount}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
