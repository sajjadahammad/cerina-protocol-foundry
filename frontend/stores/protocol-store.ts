import { create } from "zustand"
import type { Protocol, AgentThought } from "@/lib/protocols"

interface ProtocolState {
  activeProtocol: Protocol | null
  streamingThoughts: AgentThought[]
  isStreaming: boolean
  editedContent: string
  setActiveProtocol: (protocol: Protocol | null) => void
  addStreamingThought: (thought: AgentThought) => void
  clearStreamingThoughts: () => void
  setStreaming: (streaming: boolean) => void
  setEditedContent: (content: string) => void
  updateProtocolStatus: (status: Protocol["status"]) => void
}

export const useProtocolStore = create<ProtocolState>((set) => ({
  activeProtocol: null,
  streamingThoughts: [],
  isStreaming: false,
  editedContent: "",
  setActiveProtocol: (protocol) => set({ activeProtocol: protocol, editedContent: protocol?.currentDraft || "" }),
  addStreamingThought: (thought) =>
    set((state) => {
      // Check if thought already exists (by ID) to avoid duplicates
      const exists = state.streamingThoughts.some((t) => t.id === thought.id)
      if (exists) {
        return state
      }
      return {
        streamingThoughts: [...state.streamingThoughts, thought],
      }
    }),
  clearStreamingThoughts: () => set({ streamingThoughts: [] }),
  setStreaming: (isStreaming) => set({ isStreaming }),
  setEditedContent: (editedContent) => set({ editedContent }),
  updateProtocolStatus: (status) =>
    set((state) => ({
      activeProtocol: state.activeProtocol ? { ...state.activeProtocol, status } : null,
    })),
}))
