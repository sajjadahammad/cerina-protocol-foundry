"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  protocolsApi,
  type CreateProtocolRequest,
  type ApproveProtocolRequest,
  type AgentThought,
} from "@/lib/protocols"
import { useProtocolStore } from "@/stores/protocol-store"
import { useCallback, useEffect, useRef } from "react"

export function useProtocols(skip: number = 0, limit: number = 20) {
  return useQuery({
    queryKey: ["protocols", skip, limit],
    queryFn: () => protocolsApi.list(skip, limit),
  })
}

export function useProtocol(id: string) {
  const { setActiveProtocol } = useProtocolStore()

  const query = useQuery({
    queryKey: ["protocol", id],
    queryFn: () => protocolsApi.get(id),
    enabled: !!id,
    staleTime: 10000, // Consider data fresh for 10 seconds (SSE stream provides real-time updates)
    refetchOnWindowFocus: false, // Don't refetch on window focus since we have SSE
  })

  useEffect(() => {
    if (query.data) {
      setActiveProtocol(query.data)
    }
  }, [query.data, setActiveProtocol])

  return query
}

export function useCreateProtocol() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: CreateProtocolRequest) => protocolsApi.create(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["protocols"] })
    },
  })
}

export function useApproveProtocol() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: ApproveProtocolRequest) => protocolsApi.approve(request),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["protocols"] })
      queryClient.invalidateQueries({ queryKey: ["protocol", variables.protocolId] })
    },
  })
}

export function useRejectProtocol() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ protocolId, reason }: { protocolId: string; reason: string }) =>
      protocolsApi.reject(protocolId, reason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["protocols"] })
      queryClient.invalidateQueries({ queryKey: ["protocol", variables.protocolId] })
    },
  })
}

export function useHaltProtocol() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (protocolId: string) => protocolsApi.halt(protocolId),
    onSuccess: (_, protocolId) => {
      queryClient.invalidateQueries({ queryKey: ["protocol", protocolId] })
    },
  })
}

export function useProtocolStream(protocolId: string | null) {
  const { addStreamingThought, setStreaming, clearStreamingThoughts, setActiveProtocol, isStreaming } = useProtocolStore()
  const queryClient = useQueryClient()
  const eventSourceRef = useRef<EventSource | null>(null)

  const connect = useCallback(() => {
    if (!protocolId) return
    
    // Don't reconnect if already connected
    if (eventSourceRef.current) return

    // Clear previous thoughts
    clearStreamingThoughts()
    setStreaming(true)

    // Get token from localStorage for SSE authentication
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null
    const url = protocolsApi.streamUrl(protocolId, token || undefined)
    const eventSource = new EventSource(url)
    eventSourceRef.current = eventSource

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        if (data.type === "protocol_update_incremental") {
          // Incremental updates should only happen when workflow is complete (shouldn't happen during process)
          // Only process if chunk exists
          if (data.chunk) {
            queryClient.setQueryData(["protocol", protocolId], (old: any) => {
              if (!old) return old
              const currentDraft = (old.currentDraft || "") + (data.chunk || "")
              return {
                ...old,
                currentDraft: currentDraft,
                status: data.status,
                iterationCount: data.iterationCount,
                safetyScore: data.safetyScore,
                empathyMetrics: data.empathyMetrics,
              }
            })
            setActiveProtocol((prev) => {
              if (prev?.id === protocolId) {
                const currentDraft = (prev.currentDraft || "") + (data.chunk || "")
                return {
                  ...prev,
                  currentDraft: currentDraft,
                  status: data.status,
                  iterationCount: data.iterationCount,
                  safetyScore: data.safetyScore,
                  empathyMetrics: data.empathyMetrics,
                }
              }
              return prev
            })
          }
        } else if (data.type === "protocol_update") {
          // Only update content when workflow is complete (terminal states)
          const terminalStates = ["awaiting_approval", "approved", "rejected"]
          const isTerminal = terminalStates.includes(data.status)
          
          queryClient.setQueryData(["protocol", protocolId], (old: any) => {
            if (!old) return old
            return {
              ...old,
              // Only set currentDraft if workflow is complete, otherwise keep existing
              currentDraft: isTerminal ? (data.currentDraft || "") : (old.currentDraft || ""),
              status: data.status,
              iterationCount: data.iterationCount,
              safetyScore: data.safetyScore,
              empathyMetrics: data.empathyMetrics,
            }
          })
          setActiveProtocol((prev) => {
            if (prev?.id === protocolId) {
              return {
                ...prev,
                // Only set currentDraft if workflow is complete
                currentDraft: isTerminal ? (data.currentDraft || "") : (prev.currentDraft || ""),
                status: data.status,
                iterationCount: data.iterationCount,
                safetyScore: data.safetyScore,
                empathyMetrics: data.empathyMetrics,
              }
            }
            return prev
          })
          
          // Stop streaming if status is terminal
          if (data.status === "awaiting_approval" || data.status === "approved" || data.status === "rejected") {
            setStreaming(false)
          }
        } else if (data.type === "complete") {
          // Handle completion message
          setStreaming(false)
          eventSource.close()
          eventSourceRef.current = null
          queryClient.invalidateQueries({ queryKey: ["protocol", protocolId] })
        } else if (data.id && data.content) {
          // It's an agent thought - debounce to prevent rapid updates
          requestAnimationFrame(() => {
            const thought = data as AgentThought
            // Ensure all required fields are present
            if (thought.id && thought.content) {
              addStreamingThought(thought)
            }
          })
        }
      } catch (error) {
        console.error("Failed to parse SSE message:", error)
      }
    }

    eventSource.onerror = () => {
      setStreaming(false)
      eventSource.close()
      eventSourceRef.current = null
    }

    eventSource.addEventListener("complete", (event) => {
      setStreaming(false)
      // Get final protocol state once after stream completes
      queryClient.invalidateQueries({ queryKey: ["protocol", protocolId] })
      eventSource.close()
      eventSourceRef.current = null
    })
  }, [protocolId, addStreamingThought, setStreaming, clearStreamingThoughts, setActiveProtocol, queryClient])

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
      setStreaming(false)
    }
  }, [setStreaming])

  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  const isConnected = eventSourceRef.current !== null && isStreaming

  return { connect, disconnect, isConnected }
}
