/** Protocol-related types */

export type AgentRole = "drafter" | "safety_guardian" | "clinical_critic" | "supervisor"
export type ProtocolStatus = "drafting" | "reviewing" | "awaiting_approval" | "approved" | "rejected"

export interface AgentThought {
  id: string
  agentRole: AgentRole
  agentName: string
  content: string
  timestamp: string
  type: "thought" | "action" | "feedback" | "revision"
}

export interface ProtocolVersion {
  version: number
  content: string
  timestamp: string
  author: AgentRole
}

export interface SafetyScore {
  score: number
  flags: string[]
  notes: string
}

export interface EmpathyMetrics {
  score: number
  tone: string
  suggestions: string[]
}

export interface Protocol {
  id: string
  title: string
  intent: string
  currentDraft: string
  versions: ProtocolVersion[]
  status: ProtocolStatus
  safetyScore: SafetyScore
  empathyMetrics: EmpathyMetrics
  iterationCount: number
  agentThoughts: AgentThought[]
  createdAt: string
  updatedAt: string
  approvedAt?: string
  approvedBy?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  skip: number
  limit: number
  hasMore: boolean
}

export interface CreateProtocolRequest {
  intent: string
  type: string
}

export interface ApproveProtocolRequest {
  protocolId: string
  editedContent?: string
}

