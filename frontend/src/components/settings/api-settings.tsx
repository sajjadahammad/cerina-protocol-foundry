"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Copy, Check, Eye, EyeOff } from "lucide-react"

export function ApiSettings() {
  const [showKey, setShowKey] = useState(false)
  const [copied, setCopied] = useState(false)
  const apiKey = "cer_dummy_key_xxxxxxxxxxxxxxxxxxxx" // Placeholder

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

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-muted/50 p-4">
            <h4 className="text-sm font-medium mb-2">Claude Desktop Configuration (Windows)</h4>
            <p className="text-xs text-muted-foreground mb-2">
              Add this to your <code className="px-1 py-0.5 rounded bg-background">claude_desktop_config.json</code> file at:
              <code className="block mt-1 px-1 py-0.5 rounded bg-background">%APPDATA%\\Claude\\claude_desktop_config.json</code>
            </p>
            <pre className="mt-2 overflow-x-auto rounded bg-background p-3 font-mono text-xs">
              {JSON.stringify(
                {
                  mcpServers: {
                    "cerina-foundry": {
                      command: "D:\\projects\\cerina-protocol-foundry\\backend\\venv\\Scripts\\python.exe",
                      args: ["-m", "app.mcp.server"],
                      cwd: "D:\\projects\\cerina-protocol-foundry\\backend",
                      env: {
                        PYTHONPATH: "D:\\projects\\cerina-protocol-foundry\\backend",
                        MISTRAL_API_KEY: "your-mistral-api-key-here",
                        LLM_PROVIDER: "mistral",
                        MISTRAL_MODEL: "mistral-large-latest",
                      },
                    },
                  },
                },
                null,
                2,
              )}
            </pre>
            <div className="mt-2 space-y-1">
              <p className="text-xs text-muted-foreground">
                <strong>Important:</strong> Replace the paths with your actual project paths.
              </p>
              <p className="text-xs text-muted-foreground">
                <strong>Add API keys:</strong> Add one of the following to the <code className="px-1 py-0.5 rounded bg-background">env</code> section:
              </p>
              <ul className="text-xs text-muted-foreground list-disc list-inside ml-2 space-y-0.5">
                <li>For Mistral: <code className="px-1 py-0.5 rounded bg-background">"MISTRAL_API_KEY": "your-key"</code></li>
                <li>For Hugging Face: <code className="px-1 py-0.5 rounded bg-background">"HUGGINGFACE_API_KEY": "your-key"</code> and set <code className="px-1 py-0.5 rounded bg-background">"LLM_PROVIDER": "huggingface"</code></li>
              </ul>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/50 p-4">
            <h4 className="text-sm font-medium mb-2">Claude Desktop Configuration (macOS/Linux)</h4>
            <p className="text-xs text-muted-foreground mb-2">
              Add this to your <code className="px-1 py-0.5 rounded bg-background">claude_desktop_config.json</code> file at:
              <code className="block mt-1 px-1 py-0.5 rounded bg-background">~/Library/Application Support/Claude/claude_desktop_config.json</code> (macOS)
              <code className="block mt-1 px-1 py-0.5 rounded bg-background">~/.config/Claude/claude_desktop_config.json</code> (Linux)
            </p>
            <pre className="mt-2 overflow-x-auto rounded bg-background p-3 font-mono text-xs">
              {JSON.stringify(
                {
                  mcpServers: {
                    "cerina-foundry": {
                      command: "/full/path/to/backend/venv/bin/python",
                      args: ["-m", "app.mcp.server"],
                      cwd: "/full/path/to/cerina-protocol-foundry/backend",
                      env: {
                        PYTHONPATH: "/full/path/to/cerina-protocol-foundry/backend",
                        LLM_PROVIDER: "mistral",
                        MISTRAL_MODEL: "mistral-large-latest",
                        DATABASE_URL: "sqlite:///./cerina_foundry.db",
                        SECRET_KEY: "your-secret-key",
                      },
                    },
                  },
                },
                null,
                2,
              )}
            </pre>
            <div className="mt-2 space-y-1">
              <p className="text-xs text-muted-foreground">
                <strong>Important:</strong> Replace the paths with your actual project paths.
              </p>
              <p className="text-xs text-muted-foreground">
                <strong>Add API keys:</strong> Add one of the following to the <code className="px-1 py-0.5 rounded bg-background">env</code> section:
              </p>
              <ul className="text-xs text-muted-foreground list-disc list-inside ml-2 space-y-0.5">
                <li>For Mistral: <code className="px-1 py-0.5 rounded bg-background">"MISTRAL_API_KEY": "your-key"</code></li>
                <li>For Hugging Face: <code className="px-1 py-0.5 rounded bg-background">"HUGGINGFACE_API_KEY": "your-key"</code> and set <code className="px-1 py-0.5 rounded bg-background">"LLM_PROVIDER": "huggingface"</code></li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
