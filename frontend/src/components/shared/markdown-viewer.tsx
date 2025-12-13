"use client"

import { memo, useMemo } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface MarkdownViewerProps {
  content: string
  className?: string
}

// Memoize markdown components to prevent unnecessary re-renders
const markdownComponents = {
  h1: ({ node, ...props }: any) => <h1 className="mb-4 mt-6 text-2xl font-bold" {...props} />,
  h2: ({ node, ...props }: any) => <h2 className="mb-3 mt-5 text-xl font-semibold" {...props} />,
  h3: ({ node, ...props }: any) => <h3 className="mb-2 mt-4 text-lg font-semibold" {...props} />,
  h4: ({ node, ...props }: any) => <h4 className="mb-2 mt-3 text-base font-semibold" {...props} />,
  p: ({ node, ...props }: any) => <p className="mb-3 leading-relaxed" {...props} />,
  ul: ({ node, ...props }: any) => <ul className="mb-3 ml-6 list-disc space-y-1" {...props} />,
  ol: ({ node, ...props }: any) => <ol className="mb-3 ml-6 list-decimal space-y-1" {...props} />,
  li: ({ node, ...props }: any) => <li className="leading-relaxed" {...props} />,
  strong: ({ node, ...props }: any) => <strong className="font-semibold" {...props} />,
  em: ({ node, ...props }: any) => <em className="italic" {...props} />,
  code: ({ node, inline, ...props }: any) =>
    inline ? (
      <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono" {...props} />
    ) : (
      <code className="block rounded-md bg-muted p-3 text-xs font-mono" {...props} />
    ),
  pre: ({ node, ...props }: any) => <pre className="mb-3 overflow-x-auto rounded-md bg-muted p-3" {...props} />,
  blockquote: ({ node, ...props }: any) => (
    <blockquote className="my-3 border-l-4 border-border pl-4 italic" {...props} />
  ),
  hr: ({ node, ...props }: any) => <hr className="my-4 border-border" {...props} />,
  a: ({ node, ...props }: any) => <a className="text-primary underline hover:text-primary/80" {...props} />,
}

function MarkdownViewerComponent({ content, className = "" }: MarkdownViewerProps) {
  // Memoize the rendered markdown to avoid re-parsing when content hasn't changed
  const renderedMarkdown = useMemo(
    () => (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    ),
    [content]
  )

  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none font-sans ${className}`}>
      {renderedMarkdown}
    </div>
  )
}

// Memoize the component to prevent re-renders when parent re-renders but props haven't changed
export const MarkdownViewer = memo(MarkdownViewerComponent)

