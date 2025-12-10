"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface MarkdownViewerProps {
  content: string
  className?: string
}

export function MarkdownViewer({ content, className = "" }: MarkdownViewerProps) {
  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none font-sans ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => <h1 className="mb-4 mt-6 text-2xl font-bold" {...props} />,
          h2: ({ node, ...props }) => <h2 className="mb-3 mt-5 text-xl font-semibold" {...props} />,
          h3: ({ node, ...props }) => <h3 className="mb-2 mt-4 text-lg font-semibold" {...props} />,
          h4: ({ node, ...props }) => <h4 className="mb-2 mt-3 text-base font-semibold" {...props} />,
          p: ({ node, ...props }) => <p className="mb-3 leading-relaxed" {...props} />,
          ul: ({ node, ...props }) => <ul className="mb-3 ml-6 list-disc space-y-1" {...props} />,
          ol: ({ node, ...props }) => <ol className="mb-3 ml-6 list-decimal space-y-1" {...props} />,
          li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
          strong: ({ node, ...props }) => <strong className="font-semibold" {...props} />,
          em: ({ node, ...props }) => <em className="italic" {...props} />,
          code: ({ node, inline, ...props }: any) =>
            inline ? (
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono" {...props} />
            ) : (
              <code className="block rounded-md bg-muted p-3 text-xs font-mono" {...props} />
            ),
          pre: ({ node, ...props }) => <pre className="mb-3 overflow-x-auto rounded-md bg-muted p-3" {...props} />,
          blockquote: ({ node, ...props }) => (
            <blockquote className="my-3 border-l-4 border-border pl-4 italic" {...props} />
          ),
          hr: ({ node, ...props }) => <hr className="my-4 border-border" {...props} />,
          a: ({ node, ...props }) => <a className="text-primary underline hover:text-primary/80" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

