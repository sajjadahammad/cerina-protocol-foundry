"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Copy, Check, Eye, EyeOff } from "lucide-react"

export function ApiSettings() {
  const [showKey, setShowKey] = useState(false)
  const [copied, setCopied] = useState(false)
  const apiKey = "cer_live_xxxxxxxxxxxxxxxxxxxx" // Placeholder

  const handleCopy = () => {
    navigator.clipboard.writeText(apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle>API Access</CardTitle>
        <CardDescription>Manage your MCP server integration and API keys</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="api-key">API Key</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="api-key"
                type={showKey ? "text" : "password"}
                value={apiKey}
                readOnly
                className="pr-20 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-10 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Use this key to authenticate requests from MCP clients like Claude Desktop.
          </p>
        </div>

        <div className="space-y-2">
          <Label>MCP Server Endpoint</Label>
          <code className="block rounded-md bg-muted px-3 py-2 font-mono text-sm">http://localhost:8000/mcp</code>
          <p className="text-xs text-muted-foreground">
            Configure this endpoint in your MCP client to connect to the Cerina Foundry.
          </p>
        </div>

        <div className="rounded-md border border-border bg-muted/50 p-4">
          <h4 className="text-sm font-medium">Claude Desktop Configuration</h4>
          <pre className="mt-2 overflow-x-auto rounded bg-background p-3 font-mono text-xs">
            {JSON.stringify(
              {
                mcpServers: {
                  cerina: {
                    command: "uvx",
                    args: ["cerina-mcp"],
                    env: {
                      CERINA_API_KEY: "your-api-key",
                    },
                  },
                },
              },
              null,
              2,
            )}
          </pre>
        </div>
      </CardContent>
    </Card>
  )
}
