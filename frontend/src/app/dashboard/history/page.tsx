import { DashboardLayout } from "@/components/dashboard-layout"
import { ProtocolHistoryTable } from "@/components/protocol-history-table"

export default function HistoryPage() {
  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Protocol History</h1>
          <p className="mt-1 text-sm text-muted-foreground">View and manage all your generated CBT protocols</p>
        </div>

        <ProtocolHistoryTable />
      </div>
    </DashboardLayout>
  )
}
