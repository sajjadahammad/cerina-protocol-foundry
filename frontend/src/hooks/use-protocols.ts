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
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 5
  const reconnectDelay = 3000 // 3 seconds

  const connect = useCallback(() => {
    if (!protocolId) return
    
    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    // Clear any pending reconnection
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    // Clear previous thoughts only on first connection
    if (reconnectAttemptsRef.current === 0) {
      clearStreamingThoughts()
    }
    
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
          // Reset reconnect attempts on successful completion
          reconnectAttemptsRef.current = 0
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current)
            reconnectTimeoutRef.current = null
          }
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

    eventSource.onerror = (error) => {
      console.error("SSE connection error:", error, "readyState:", eventSource.readyState)
      
      // EventSource states: CONNECTING (0), OPEN (1), CLOSED (2)
      if (eventSource.readyState === EventSource.CLOSED) {
        // Connection is closed - attempt to reconnect
        eventSourceRef.current = null
        setStreaming(false)
        
        // Attempt reconnection if we haven't exceeded max attempts
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1
          console.log(`Attempting to reconnect SSE (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`)
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, reconnectDelay)
        } else {
          console.error("Max reconnection attempts reached. Please refresh the page.")
          // Fallback: periodically refetch to get updates
          const fallbackInterval = setInterval(() => {
            queryClient.invalidateQueries({ queryKey: ["protocol", protocolId] })
          }, 5000) // Refetch every 5 seconds as fallback
          
          // Clear fallback after 5 minutes
          setTimeout(() => clearInterval(fallbackInterval), 300000)
        }
      } else if (eventSource.readyState === EventSource.CONNECTING) {
        // Connection is trying to reconnect - keep streaming state
        console.log("SSE reconnecting...")
      }
    }

    eventSource.onopen = () => {
      // Connection opened successfully - reset reconnect attempts
      console.log("SSE connection opened")
      reconnectAttemptsRef.current = 0
      setStreaming(true)
    }

    eventSource.addEventListener("complete", (event) => {
      setStreaming(false)
      // Reset reconnect attempts on successful completion
      reconnectAttemptsRef.current = 0
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      // Get final protocol state once after stream completes
      queryClient.invalidateQueries({ queryKey: ["protocol", protocolId] })
      eventSource.close()
      eventSourceRef.current = null
    })
  }, [protocolId, addStreamingThought, setStreaming, clearStreamingThoughts, setActiveProtocol, queryClient])

  const disconnect = useCallback(() => {
    // Clear reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    
    // Reset reconnect attempts
    reconnectAttemptsRef.current = 0
    
    // Close connection
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
