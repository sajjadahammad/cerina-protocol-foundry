"use client"

import { useState } from "react"
import Link from "next/link"
import { useProtocols } from "@/hooks/use-protocols"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Search, ExternalLink } from "lucide-react"
import type { ProtocolStatus } from "@/lib/protocols"

const statusVariant: Record<ProtocolStatus, "default" | "secondary" | "outline" | "destructive"> = {
  approved: "default",
  awaiting_approval: "secondary",
  drafting: "outline",
  reviewing: "outline",
  rejected: "destructive",
}

export function ProtocolHistoryTable() {
  const { data: protocols, isLoading } = useProtocols()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const filteredProtocols = protocols?.filter((protocol) => {
    const matchesSearch =
      protocol.title.toLowerCase().includes(search.toLowerCase()) ||
      protocol.intent.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === "all" || protocol.status === statusFilter
    return matchesSearch && matchesStatus
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search protocols..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="awaiting_approval">Awaiting Approval</SelectItem>
            <SelectItem value="drafting">Drafting</SelectItem>
            <SelectItem value="reviewing">Reviewing</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Safety</TableHead>
              <TableHead className="hidden md:table-cell">Empathy</TableHead>
              <TableHead className="hidden lg:table-cell">Iterations</TableHead>
              <TableHead className="hidden lg:table-cell">Created</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProtocols?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No protocols found
                </TableCell>
              </TableRow>
            ) : (
              filteredProtocols?.map((protocol) => (
                <TableRow key={protocol.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{protocol.title}</p>
                      <p className="line-clamp-2 whitespace-break-spaces text-xs text-muted-foreground">{protocol.intent}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[protocol.status]} className="text-[10px]">
                      {protocol.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-sm">{protocol.safetyScore.score}%</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-sm">{protocol.empathyMetrics.score}%</span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm">{protocol.iterationCount}</span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-xs text-muted-foreground">
                      {new Date(protocol.createdAt).toLocaleDateString()}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link href={`/dashboard/protocol/${protocol.id}`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
