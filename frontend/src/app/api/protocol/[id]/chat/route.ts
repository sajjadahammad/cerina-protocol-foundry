import { NextRequest } from "next/server"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const authToken = request.headers.get("authorization")?.replace("Bearer ", "")

  if (!authToken) {
    return new Response("Unauthorized", { status: 401 })
  }

  // Create a readable stream that connects to our backend
  // The backend already sends data in Vercel AI SDK format, so we just proxy it
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/v1/protocols/${id}/chat`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${authToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ protocolId: id }),
          }
        )

        if (!response.ok) {
          controller.error(new Error(`Backend error: ${response.statusText}`))
          return
        }

        const reader = response.body?.getReader()
        if (!reader) {
          controller.error(new Error("No response body"))
          return
        }

        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            controller.close()
            break
          }

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            if (line.trim()) {
              // Forward the line as-is (already in Vercel AI SDK format)
              // Format: "0:content" for text or "8:data" for annotations
              controller.enqueue(
                new TextEncoder().encode(`${line}\n`)
              )
            }
          }
        }
      } catch (error) {
        console.error("Stream error:", error)
        controller.error(error)
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}

