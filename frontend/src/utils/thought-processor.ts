/** Shared utility for processing agent thoughts (used by both worker and sync fallback) */
import type { AgentThought } from "@/types/protocols"

export function processThoughts(
  historicalThoughts: AgentThought[],
  streamingThoughts: AgentThought[]
): AgentThought[] {
  // Deduplicate thoughts by ID using Map
  const thoughtMap = new Map<string, AgentThought>()

  // Add historical thoughts first
  historicalThoughts.forEach((thought) => {
    if (thought.id) {
      thoughtMap.set(thought.id, thought)
    }
  })

  // Add streaming thoughts (will overwrite historical if same ID, keeping latest)
  streamingThoughts.forEach((thought) => {
    if (thought.id) {
      thoughtMap.set(thought.id, thought)
    }
  })

  // Filter to show only relevant thoughts:
  // - Remove duplicate feedback messages with same content
  // - Keep only the most recent thought per agent per type
  const allThoughts = Array.from(thoughtMap.values())
  const filteredThoughts = allThoughts.filter((thought, index, arr) => {
    // Keep all action and thought types
    if (thought.type === "action" || thought.type === "thought") {
      return true
    }
    // For feedback types, only keep if it's different from previous feedback from same agent
    if (thought.type === "feedback") {
      const previousFeedback = arr
        .slice(0, index)
        .reverse()
        .find((t) => t.agentRole === thought.agentRole && t.type === "feedback")
      if (previousFeedback && previousFeedback.content === thought.content) {
        return false // Duplicate feedback, skip it
      }
      return true
    }
    return true
  })

  // Sort by timestamp to maintain chronological order
  return filteredThoughts.sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime()
    const timeB = new Date(b.timestamp).getTime()
    return timeA - timeB
  })
}

