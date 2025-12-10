"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import Link from "next/link"
import { useProtocols } from "@/hooks/use-protocols"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Search, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react"
import type { ProtocolStatus } from "@/lib/protocols"

const statusVariant: Record<ProtocolStatus, "default" | "secondary" | "outline" | "destructive"> = {
  approved: "default",
  awaiting_approval: "secondary",
  drafting: "outline",
  reviewing: "outline",
  rejected: "destructive",
}

export function ProtocolHistoryTable() {
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const { data: paginatedData, isLoading } = useProtocols(page * pageSize, pageSize)

  // Debounce search input to avoid excessive filtering
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput)
      // Reset to first page when search changes
      setPage(0)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchInput])

  // Optimized client-side filtering with early returns
  const filteredProtocols = useMemo(() => {
    if (!paginatedData?.items) return []
    
    const searchLower = search.toLowerCase()
    const hasSearch = searchLower.length > 0
    
    return paginatedData.items.filter((protocol) => {
      // Early return for status filter
      if (statusFilter !== "all" && protocol.status !== statusFilter) {
        return false
      }
      
      // Early return if no search term
      if (!hasSearch) {
        return true
      }
      
      // Search in title and intent
      return (
        protocol.title.toLowerCase().includes(searchLower) ||
        protocol.intent.toLowerCase().includes(searchLower)
      )
    })
  }, [paginatedData?.items, search, statusFilter])

  const totalPages = paginatedData ? Math.ceil(paginatedData.total / pageSize) : 0

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
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
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

      {/* Pagination */}
      {paginatedData && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, paginatedData.total)} of {paginatedData.total} protocols
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <div className="text-sm text-muted-foreground">
              Page {page + 1} of {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
