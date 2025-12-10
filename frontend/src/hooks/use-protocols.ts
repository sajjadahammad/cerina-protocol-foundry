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
  const { addStreamingThought, setStreaming, clearStreamingThoughts } = useProtocolStore()
  const eventSourceRef = useRef<EventSource | null>(null)

  const connect = useCallback(() => {
    if (!protocolId) return

    // Clear previous thoughts
    clearStreamingThoughts()
    setStreaming(true)

    const url = protocolsApi.streamUrl(protocolId)
    const eventSource = new EventSource(url)
    eventSourceRef.current = eventSource

    eventSource.onmessage = (event) => {
      try {
        const thought = JSON.parse(event.data) as AgentThought
        addStreamingThought(thought)
      } catch (error) {
        console.error("Failed to parse SSE message:", error)
      }
    }

    eventSource.onerror = () => {
      setStreaming(false)
      eventSource.close()
    }

    eventSource.addEventListener("complete", () => {
      setStreaming(false)
      eventSource.close()
    })
  }, [protocolId, addStreamingThought, setStreaming, clearStreamingThoughts])

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

  return { connect, disconnect }
}
