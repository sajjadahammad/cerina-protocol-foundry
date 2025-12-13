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
    staleTime: Infinity, // Never consider stale - SSE stream provides real-time updates via setQueryData
    refetchOnWindowFocus: false, // Don't refetch on window focus since we have SSE
    refetchOnMount: false, // Don't refetch on mount if we have cached data
    refetchOnReconnect: false, // Don't refetch on reconnect - SSE will reconnect and update
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
  const { addStreamingThought, setStreaming, clearStreamingThoughts, setActiveProtocol } = useProtocolStore()
  const queryClient = useQueryClient()
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 5
  const reconnectDelay = 3000 // 3 seconds
  const connectionTimeout = 10000 // 10 seconds to establish connection
  
  // Track last agent role to detect changes
  const lastAgentRoleRef = useRef<string | null>(null)
  const agentRoleRefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const processSSEMessage = useCallback((data: any) => {
    const terminalStates = ["awaiting_approval", "approved", "rejected"]
    
    if (data.type === "protocol_update_incremental") {
      // Incremental updates should only happen when workflow is complete (terminal states)
      // Only process if chunk exists AND status is terminal
      const isTerminal = terminalStates.includes(data.status)
      if (data.chunk && isTerminal) {
        queryClient.setQueryData(["protocol", protocolId], (old: any) => {
          if (!old) return old
          const currentDraft = (old.currentDraft || "") + (data.chunk || "")
          // Only update if actually changed
          if (old.currentDraft === currentDraft) return old
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
          if (prev?.id !== protocolId) return prev
          const currentDraft = (prev.currentDraft || "") + (data.chunk || "")
          // Only update if actually changed
          if (prev.currentDraft === currentDraft) return prev
          return {
            ...prev,
            currentDraft: currentDraft,
            status: data.status,
            iterationCount: data.iterationCount,
            safetyScore: data.safetyScore,
            empathyMetrics: data.empathyMetrics,
          }
        })
      } else if (!isTerminal) {
        // During generation, clear the draft to prevent showing partial content
        queryClient.setQueryData(["protocol", protocolId], (old: any) => {
          if (!old) return old
          return {
            ...old,
            currentDraft: "", // Clear during generation
            status: data.status,
            iterationCount: data.iterationCount,
            safetyScore: data.safetyScore,
            empathyMetrics: data.empathyMetrics,
          }
        })
        setActiveProtocol((prev) => {
          if (prev?.id !== protocolId) return prev
          return {
            ...prev,
            currentDraft: "", // Clear during generation
            status: data.status,
            iterationCount: data.iterationCount,
            safetyScore: data.safetyScore,
            empathyMetrics: data.empathyMetrics,
          }
        })
      }
    } else if (data.type === "protocol_update") {
      // Only show preview when workflow is complete (terminal states)
      const terminalStates = ["awaiting_approval", "approved", "rejected"]
      const isTerminal = terminalStates.includes(data.status)
      
      queryClient.setQueryData(["protocol", protocolId], (old: any) => {
        if (!old) return old
        return {
          ...old,
          // Clear preview during process, only show when terminal
          currentDraft: isTerminal ? (data.currentDraft || "") : "",
          status: data.status,
          iterationCount: data.iterationCount,
          safetyScore: data.safetyScore,
          empathyMetrics: data.empathyMetrics,
        }
      })
      setActiveProtocol((prev) => {
        if (prev?.id !== protocolId) return prev
        return {
          ...prev,
          // Clear preview during process, only show when terminal
          currentDraft: isTerminal ? (data.currentDraft || "") : "",
          status: data.status,
          iterationCount: data.iterationCount,
          safetyScore: data.safetyScore,
          empathyMetrics: data.empathyMetrics,
        }
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
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      // Only invalidate if we don't have the final state already
      // The protocol_update message should have already updated the cache
      // So we only refetch if needed (e.g., to get any server-side computed fields)
      // Use a small delay to avoid race conditions
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["protocol", protocolId] })
      }, 500)
    } else if (data.id && data.content) {
      // It's an agent thought - debounce to prevent rapid updates
      requestAnimationFrame(() => {
        const thought = data as AgentThought
        // Ensure all required fields are present
        if (thought.id && thought.content) {
          addStreamingThought(thought)
          
          // Refetch protocol when agentRole changes to get latest state
          // Debounce to avoid too many refetches
          if (thought.agentRole && lastAgentRoleRef.current !== thought.agentRole) {
            lastAgentRoleRef.current = thought.agentRole
            
            // Clear any pending refetch
            if (agentRoleRefetchTimeoutRef.current) {
              clearTimeout(agentRoleRefetchTimeoutRef.current)
            }
            
            // Debounce refetch by 1 second to batch multiple role changes
            agentRoleRefetchTimeoutRef.current = setTimeout(() => {
              queryClient.invalidateQueries({ queryKey: ["protocol", protocolId] })
              agentRoleRefetchTimeoutRef.current = null
            }, 1000)
          }
        }
      })
    }
  }, [protocolId, addStreamingThought, setStreaming, setActiveProtocol, queryClient])

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
      lastAgentRoleRef.current = null // Reset agent role tracking
    }
    
    setStreaming(true)

    // Get token from localStorage for SSE authentication
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null
    const url = protocolsApi.streamUrl(protocolId, token || undefined)
    const eventSource = new EventSource(url)
    eventSourceRef.current = eventSource

    // Set up connection timeout - if connection doesn't open within timeout, treat as failed
    connectionTimeoutRef.current = setTimeout(() => {
      if (eventSourceRef.current && eventSourceRef.current.readyState === EventSource.CONNECTING) {
        console.warn("SSE connection timeout - closing and attempting reconnect")
        eventSourceRef.current.close()
        eventSourceRef.current = null
        // Trigger reconnection
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current += 1
          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, reconnectDelay)
        }
      }
    }, connectionTimeout)

    eventSource.onmessage = (event) => {
      // Clear connection timeout on successful message
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current)
        connectionTimeoutRef.current = null
      }
      try {
        const data = JSON.parse(event.data)
        processSSEMessage(data)
      } catch (error) {
        console.error("Failed to parse SSE message:", error)
      }
    }

    eventSource.onerror = (error) => {
      // EventSource states: CONNECTING (0), OPEN (1), CLOSED (2)
      const readyState = eventSource.readyState
      
      if (readyState === EventSource.CLOSED) {
        // Connection is closed - attempt to reconnect
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current)
          connectionTimeoutRef.current = null
        }
        console.log("SSE connection closed, attempting to reconnect...")
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
      } else if (readyState === EventSource.CONNECTING) {
        // Connection is still trying to connect - this is normal during initial connection
        // Don't log errors for CONNECTING state - wait for timeout or CLOSED state
        // The connection timeout will handle cases where it takes too long
      } else if (readyState === EventSource.OPEN) {
        // Connection is open - clear timeout
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current)
          connectionTimeoutRef.current = null
        }
      }
    }

    eventSource.onopen = () => {
      // Connection opened successfully - reset reconnect attempts and clear timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current)
        connectionTimeoutRef.current = null
      }
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
      // Close connection - processSSEMessage already handles the completion
      eventSource.close()
      eventSourceRef.current = null
    })
  }, [protocolId, processSSEMessage, setStreaming, clearStreamingThoughts, queryClient])

  const disconnect = useCallback(() => {
    // Clear reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    
    // Clear connection timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current)
      connectionTimeoutRef.current = null
    }
    
    // Clear agent role refetch timeout
    if (agentRoleRefetchTimeoutRef.current) {
      clearTimeout(agentRoleRefetchTimeoutRef.current)
      agentRoleRefetchTimeoutRef.current = null
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

  const isConnected = eventSourceRef.current !== null && eventSourceRef.current.readyState === EventSource.OPEN

  return { connect, disconnect, isConnected }
}
