import { create } from "zustand"
import type { Protocol, AgentThought } from "@/lib/protocols"

interface ProtocolState {
  activeProtocol: Protocol | null
  streamingThoughts: AgentThought[]
  isStreaming: boolean
  editedContent: string
  setActiveProtocol: (protocol: Protocol | null | ((prev: Protocol | null) => Protocol | null)) => void
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
  setActiveProtocol: (protocol) => {
    if (typeof protocol === "function") {
      set((state) => {
        const newProtocol = protocol(state.activeProtocol)
        return {
          activeProtocol: newProtocol,
          editedContent: newProtocol?.currentDraft || state.editedContent || "",
        }
      })
    } else {
      set({ activeProtocol: protocol, editedContent: protocol?.currentDraft || "" })
    }
  },
  addStreamingThought: (thought) =>
    set((state) => {
      // Check if thought already exists (by ID) to avoid duplicates
      // Use a more robust check to prevent infinite loops
      if (!thought || !thought.id) {
        return state // Don't add invalid thoughts
      }
      
      const exists = state.streamingThoughts.some((t) => t && t.id === thought.id)
      if (exists) {
        return state // Return unchanged state to prevent re-render
      }
      
      // Create new array to ensure proper state update
      const newThoughts = [...state.streamingThoughts, thought]
      return {
        streamingThoughts: newThoughts,
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
