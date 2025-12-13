"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useCreateProtocol } from "@/hooks/use-protocols"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { ProtocolTypeCard } from "./protocol-type-card"
import { Logo } from "@/components/shared/logo"
import { ArrowLeft, ArrowRight, Loader2, Brain, Shield, Heart, Target, Sparkles, HelpCircle } from "lucide-react"
import Link from "next/link"

const protocolTypes = [
  {
    id: "exposure_hierarchy",
    title: "Exposure Hierarchy",
    description: "Create graded exposure exercises.",
    icon: Target,
  },
  {
    id: "thought_record",
    title: "Thought Record",
    description: "Cognitive restructuring exercises.",
    icon: Brain,
  },
  {
    id: "behavioral_activation",
    title: "Behavioral Activation",
    description: "Activity scheduling protocols.",
    icon: Sparkles,
  },
  {
    id: "safety_planning",
    title: "Safety Planning",
    description: "Crisis management protocols.",
    icon: Shield,
  },
  {
    id: "sleep_hygiene",
    title: "Sleep Hygiene",
    description: "Sleep improvement exercises.",
    icon: Heart,
  },
  {
    id: "custom",
    title: "Something else",
    description: "We're here to help!",
    icon: HelpCircle,
  },
]

type Step = "type" | "intent"

export function CreateProtocolForm() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("type")
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [intent, setIntent] = useState("")
  const createMutation = useCreateProtocol()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedType || !intent) return

    createMutation.mutate(
      { type: selectedType, intent },
      {
        onSuccess: (protocol) => {
          router.push(`/dashboard/protocol/${protocol.id}`)
        },
      },
    )
  }

  const canContinue = step === "type" ? !!selectedType : !!intent.trim()

  return (
    <div className="flex min-h-screen">
      {/* Left Sidebar */}
      <aside className="flex w-72 flex-col border-r border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="text-sm font-semibold tracking-tight">Cerina Foundry</span>
        </div>

        <div className="mt-8 space-y-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Protocol Types</p>
            <p className="mt-1 text-sm">Choose from our predefined CBT exercise templates.</p>
          </div>

          <div className="border-t border-dashed border-border pt-6">
            <p className="text-xs font-medium text-muted-foreground">AI-Powered</p>
            <p className="mt-1 text-sm">
              Our multi-agent system will draft, review, and refine your protocol automatically.
            </p>
          </div>

          <div className="border-t border-dashed border-border pt-6">
            <p className="text-xs font-medium text-muted-foreground">Human Review</p>
            <p className="mt-1 text-sm">You approve every protocol before it&apos;s finalized.</p>
          </div>
        </div>

        <div className="mt-auto">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex flex-1 flex-col items-center justify-center p-8">
        <div className="w-full max-w-2xl">
          <div className="mb-8 flex justify-center">
            <Logo />
          </div>

          <form onSubmit={handleSubmit}>
            {step === "type" && (
              <div className="space-y-6">
                <div className="text-center">
                  <h1 className="text-2xl font-semibold tracking-tight">What do you need help with?</h1>
                  <p className="mt-2 text-muted-foreground">
                    Select a protocol type to get started with AI-assisted generation.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {protocolTypes.map((type) => (
                    <ProtocolTypeCard
                      key={type.id}
                      title={type.title}
                      description={type.description}
                      icon={type.icon}
                      selected={selectedType === type.id}
                      onSelect={() => setSelectedType(type.id)}
                    />
                  ))}
                </div>

                <div className="flex justify-between pt-4">
                  <Link href="/dashboard">
                    <Button type="button" variant="outline">
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Go back
                    </Button>
                  </Link>
                  <Button type="button" onClick={() => setStep("intent")} disabled={!canContinue}>
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {step === "intent" && (
              <div className="space-y-6">
                <div className="text-center">
                  <h1 className="text-2xl font-semibold tracking-tight">Describe the protocol</h1>
                  <p className="mt-2 text-muted-foreground">
                    Be specific about the clinical context and desired outcome.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="rounded-lg border border-border bg-muted/50 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Selected Type</p>
                    <p className="text-sm font-medium">{protocolTypes.find((t) => t.id === selectedType)?.title}</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="intent">Protocol Intent</Label>
                    <Textarea
                      id="intent"
                      value={intent}
                      onChange={(e) => setIntent(e.target.value)}
                      placeholder="e.g., Create an exposure hierarchy for a patient with social anxiety, focusing on workplace interactions. The patient is comfortable with one-on-one conversations but struggles with group meetings."
                      rows={6}
                      className="resize-none font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Include relevant clinical context, patient characteristics, and specific goals.
                    </p>
                  </div>
                </div>

                <div className="flex justify-between pt-4">
                  <Button type="button" variant="outline" onClick={() => setStep("type")}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Go back
                  </Button>
                  <Button type="submit" disabled={!canContinue || createMutation.isPending}>
                    {createMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        Generate Protocol
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </form>
        </div>
      </main>
    </div>
  )
}
