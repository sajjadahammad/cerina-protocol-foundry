import api from "@/lib/axios"

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

export interface CreateProtocolRequest {
  intent: string
  type: string
}

export interface ApproveProtocolRequest {
  protocolId: string
  editedContent?: string
}

export const protocolsApi = {
  list: async (): Promise<Protocol[]> => {
    const { data } = await api.get<Protocol[]>("/protocols")
    return data
  },

  get: async (id: string): Promise<Protocol> => {
    const { data } = await api.get<Protocol>(`/protocols/${id}`)
    return data
  },

  create: async (request: CreateProtocolRequest): Promise<Protocol> => {
    const { data } = await api.post<Protocol>("/protocols", request)
    return data
  },

  approve: async (request: ApproveProtocolRequest): Promise<Protocol> => {
    const { data } = await api.post<Protocol>(`/protocols/${request.protocolId}/approve`, {
      editedContent: request.editedContent,
    })
    return data
  },

  reject: async (protocolId: string, reason: string): Promise<Protocol> => {
    const { data } = await api.post<Protocol>(`/protocols/${protocolId}/reject`, { reason })
    return data
  },

  halt: async (protocolId: string): Promise<void> => {
    await api.post(`/protocols/${protocolId}/halt`)
  },

  resume: async (protocolId: string): Promise<void> => {
    await api.post(`/protocols/${protocolId}/resume`)
  },

  // SSE stream for real-time agent thoughts
  streamUrl: (protocolId: string): string => {
    return `${api.defaults.baseURL}/protocols/${protocolId}/stream`
  },
}
