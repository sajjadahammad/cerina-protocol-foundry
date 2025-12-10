import api from "@/lib/axios"
import type {
  Protocol,
  CreateProtocolRequest,
  ApproveProtocolRequest,
  PaginatedResponse,
} from "@/types/protocols"

// Re-export types for backward compatibility
export type {
  AgentRole,
  ProtocolStatus,
  AgentThought,
  ProtocolVersion,
  SafetyScore,
  EmpathyMetrics,
  Protocol,
  PaginatedResponse,
  CreateProtocolRequest,
  ApproveProtocolRequest,
} from "@/types/protocols"

export const protocolsApi = {
  list: async (skip: number = 0, limit: number = 20): Promise<PaginatedResponse<Protocol>> => {
    const { data } = await api.get<PaginatedResponse<Protocol>>("/protocols", {
      params: { skip, limit },
    })
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
  streamUrl: (protocolId: string, token?: string): string => {
    // Get base URL without /api/v1 prefix for SSE (EventSource doesn't use axios)
    const baseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : ""
    return `${baseURL}/api/v1/protocols/${protocolId}/stream${tokenParam}`
  },
}
