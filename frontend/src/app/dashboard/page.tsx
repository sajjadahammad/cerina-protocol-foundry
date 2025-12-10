import { DashboardLayout } from "@/components/dashboard-layout"
import { StatsCards } from "@/components/stats-cards"
import { RecentProtocols } from "@/components/recent-protocols"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Plus } from "lucide-react"

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Monitor your CBT protocol generation and agent activity
            </p>
          </div>
          <Link href="/dashboard/new">
            <Button>
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
    </DashboardLayout>
  )
}
