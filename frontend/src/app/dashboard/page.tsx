import { StatsCards } from "@/components/dashboard/stats-cards"
import { RecentProtocols } from "@/components/dashboard/recent-protocols"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Plus } from "lucide-react"

export default function DashboardPage() {
  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor your CBT protocol generation and agent activity
          </p>
        </div>
        <Link href="/dashboard/new">
          <Button className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            New Protocol
          </Button>
        </Link>
      </div>

      <div className="space-y-6">
        <StatsCards />
        <RecentProtocols />
      </div>
    </div>
  )
}
