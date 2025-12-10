"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/stores/auth-store"
import { useLogout } from "@/hooks/use-auth"
import { LayoutDashboard, Plus, History, Settings, LogOut, User, Mail, MessageCircle, Phone } from "lucide-react"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "New Protocol", href: "/dashboard/new", icon: Plus },
  { name: "History", href: "/dashboard/history", icon: History },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user } = useAuthStore()
  const logoutMutation = useLogout()

  return (
    <aside className="flex h-screen w-72 flex-col border-r border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border p-4">
        <Logo />
        <span className="text-sm font-semibold tracking-tight">Cerina Foundry</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* Support Section */}
      <div className="border-t border-border p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Support</p>

        <div className="space-y-3 text-xs">
          <div className="flex items-start gap-2">
            <Mail className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-muted-foreground">Email support</p>
              <p className="text-foreground">support@cerina.ai</p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <MessageCircle className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-muted-foreground">Live chat</p>
              <div className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                <span className="text-foreground">Online</span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Phone className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <p className="text-muted-foreground">Mon - Fri, 9AM - 5PM</p>
              <p className="text-foreground">+1 (555) 123-4567</p>
            </div>
          </div>
        </div>
      </div>

      {/* User Section */}
      <div className="border-t border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{user?.name || "User"}</span>
              <span className="text-xs text-muted-foreground">{user?.email}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </aside>
  )
}
