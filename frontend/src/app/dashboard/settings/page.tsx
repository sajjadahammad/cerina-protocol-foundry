import { DashboardLayout } from "@/components/dashboard-layout"
import { ProfileSettings } from "@/components/profile-settings"
import { AppearanceSettings } from "@/components/appearance-settings"
import { ApiSettings } from "@/components/api-settings"

export default function SettingsPage() {
  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your account and application preferences</p>
        </div>

        <div className="space-y-6">
          <ProfileSettings />
          <AppearanceSettings />
          <ApiSettings />
        </div>
      </div>
    </DashboardLayout>
  )
}
