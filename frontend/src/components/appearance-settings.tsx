"use client"

import { useThemeStore } from "@/stores/theme-store"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Sun, Moon, Monitor } from "lucide-react"

export function AppearanceSettings() {
  const { theme, setTheme } = useThemeStore()

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Customize the look and feel of the application</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Label>Theme</Label>
          <RadioGroup value={theme} onValueChange={(value) => setTheme(value as "light" | "dark" | "system")}>
            <div className="grid grid-cols-3 gap-4">
              <Label
                htmlFor="light"
                className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-border p-4 hover:bg-accent [&:has([data-state=checked])]:border-foreground"
              >
                <RadioGroupItem value="light" id="light" className="sr-only" />
                <Sun className="h-6 w-6" />
                <span className="text-sm">Light</span>
              </Label>
              <Label
                htmlFor="dark"
                className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-border p-4 hover:bg-accent [&:has([data-state=checked])]:border-foreground"
              >
                <RadioGroupItem value="dark" id="dark" className="sr-only" />
                <Moon className="h-6 w-6" />
                <span className="text-sm">Dark</span>
              </Label>
              <Label
                htmlFor="system"
                className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-border p-4 hover:bg-accent [&:has([data-state=checked])]:border-foreground"
              >
                <RadioGroupItem value="system" id="system" className="sr-only" />
                <Monitor className="h-6 w-6" />
                <span className="text-sm">System</span>
              </Label>
            </div>
          </RadioGroup>
        </div>
      </CardContent>
    </Card>
  )
}
