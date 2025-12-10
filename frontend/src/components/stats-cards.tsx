"use client"

import { useProtocols } from "@/hooks/use-protocols"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, CheckCircle, Clock, AlertTriangle } from "lucide-react"

export function StatsCards() {
  const { data: protocols } = useProtocols()

  const stats = {
    total: protocols?.length || 0,
    approved: protocols?.filter((p) => p.status === "approved").length || 0,
    pending: protocols?.filter((p) => p.status === "awaiting_approval").length || 0,
    inProgress: protocols?.filter((p) => p.status === "drafting" || p.status === "reviewing").length || 0,
  }

  const cards = [
    { title: "Total Protocols", value: stats.total, icon: FileText, color: "text-foreground" },
    { title: "Approved", value: stats.approved, icon: CheckCircle, color: "text-green-500" },
    { title: "Awaiting Approval", value: stats.pending, icon: Clock, color: "text-yellow-500" },
    { title: "In Progress", value: stats.inProgress, icon: AlertTriangle, color: "text-blue-500" },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title} className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
            <card.icon className={`h-4 w-4 ${card.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
