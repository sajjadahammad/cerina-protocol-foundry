// Web worker for processing agent thoughts off the main thread
// This improves performance when dealing with large numbers of thoughts

import type { AgentThought } from "@/types/protocols"
import { processThoughts } from "@/utils/thought-processor"

interface ProcessThoughtsMessage {
  historicalThoughts: AgentThought[]
  streamingThoughts: AgentThought[]
}

interface ProcessedThoughtsResponse {
  sortedThoughts: AgentThought[]
}

self.onmessage = function (e: MessageEvent<ProcessThoughtsMessage>) {
  const { historicalThoughts, streamingThoughts } = e.data
  const sortedThoughts = processThoughts(historicalThoughts, streamingThoughts)
  const response: ProcessedThoughtsResponse = { sortedThoughts }
  self.postMessage(response)
}

