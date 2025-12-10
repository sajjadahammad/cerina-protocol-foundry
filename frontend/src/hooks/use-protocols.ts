"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  protocolsApi,
  type CreateProtocolRequest,
  type ApproveProtocolRequest,
  type AgentThought,
} from "@/lib/protocols"
import { useProtocolStore } from "../../stores/protocol-store"
import { useCallback, useEffect, useRef } from "react"

export function useProtocols() {
  return useQuery({
    queryKey: ["protocols"],
    queryFn: () => protocolsApi.list(),
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
        
        if (data.type === "protocol_update") {
          // Update protocol in store and cache (no need to refetch - we have the data)
          queryClient.setQueryData(["protocol", protocolId], (old: any) => {
            if (!old) return old
            return {
              ...old,
              currentDraft: data.currentDraft,
              status: data.status,
              iterationCount: data.iterationCount,
              safetyScore: data.safetyScore,
              empathyMetrics: data.empathyMetrics,
            }
          })
          // Update active protocol if it's the current one
          setActiveProtocol((prev) => {
            if (prev?.id === protocolId) {
              return {
                ...prev,
                currentDraft: data.currentDraft,
                status: data.status,
                iterationCount: data.iterationCount,
                safetyScore: data.safetyScore,
                empathyMetrics: data.empathyMetrics,
              }
            }
            return prev
          })
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
    }

    eventSource.addEventListener("complete", (event) => {
      setStreaming(false)
      // Get final protocol state once after stream completes
      queryClient.invalidateQueries({ queryKey: ["protocol", protocolId] })
      eventSource.close()
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
