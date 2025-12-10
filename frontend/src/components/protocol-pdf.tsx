import React from "react"
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"

interface ProtocolPDFProps {
  title: string
  intent: string
  content: string
  safetyScore?: number
  empathyScore?: number
  iterationCount?: number
  createdAt?: string
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: "Helvetica",
  },
  header: {
    marginBottom: 20,
    borderBottom: "2 solid #000",
    paddingBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 12,
    color: "#666",
    marginBottom: 15,
  },
  metadata: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    padding: 10,
    backgroundColor: "#f5f5f5",
  },
  metadataItem: {
    fontSize: 10,
  },
  content: {
    fontSize: 11,
    lineHeight: 1.6,
  },
  section: {
    marginBottom: 12,
  },
  paragraph: {
    marginBottom: 10,
    textAlign: "justify",
  },
  h1: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    marginTop: 15,
  },
  h2: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
    marginTop: 12,
  },
  h3: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 6,
    marginTop: 10,
  },
  h4: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 5,
    marginTop: 8,
  },
  list: {
    marginLeft: 20,
    marginBottom: 8,
  },
  listItem: {
    marginBottom: 4,
    fontSize: 11,
  },
  listBullet: {
    marginRight: 5,
  },
  bold: {
    fontWeight: "bold",
  },
  italic: {
    fontStyle: "italic",
  },
  code: {
    fontFamily: "Courier",
    fontSize: 10,
    backgroundColor: "#f5f5f5",
    padding: 2,
  },
  codeBlock: {
    fontFamily: "Courier",
    fontSize: 9,
    backgroundColor: "#f5f5f5",
    padding: 8,
    marginBottom: 10,
    marginTop: 5,
  },
  blockquote: {
    borderLeft: "3 solid #ccc",
    paddingLeft: 10,
    marginLeft: 10,
    marginBottom: 10,
    fontStyle: "italic",
    color: "#666",
  },
  horizontalRule: {
    borderBottom: "1 solid #ccc",
    marginTop: 15,
    marginBottom: 15,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 9,
    color: "#666",
    borderTop: "1 solid #ccc",
    paddingTop: 10,
  },
})

interface MarkdownElement {
  type: "h1" | "h2" | "h3" | "h4" | "p" | "ul" | "ol" | "code" | "blockquote" | "hr"
  content: string | string[]
  items?: string[]
}

// Parse markdown content into structured elements
function parseMarkdown(content: string): MarkdownElement[] {
  const lines = content.split("\n")
  const elements: MarkdownElement[] = []
  let currentList: string[] | null = null
  let currentListType: "ul" | "ol" | null = null
  let currentCodeBlock: string[] | null = null
  let currentBlockquote: string[] | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Handle code blocks
    if (trimmed.startsWith("```")) {
      if (currentCodeBlock !== null) {
        // End code block
        elements.push({
          type: "code",
          content: currentCodeBlock.join("\n"),
        })
        currentCodeBlock = null
      } else {
        // Start code block
        currentCodeBlock = []
      }
      continue
    }

    if (currentCodeBlock !== null) {
      currentCodeBlock.push(line)
      continue
    }

    // Handle blockquotes
    if (trimmed.startsWith(">")) {
      if (currentBlockquote === null) {
        currentBlockquote = []
      }
      currentBlockquote.push(trimmed.substring(1).trim())
      continue
    } else if (currentBlockquote !== null) {
      elements.push({
        type: "blockquote",
        content: currentBlockquote.join(" "),
      })
      currentBlockquote = null
    }

    // Handle horizontal rules
    if (trimmed.match(/^[-*_]{3,}$/)) {
      if (currentList !== null) {
        elements.push({
          type: currentListType!,
          content: "",
          items: currentList,
        })
        currentList = null
        currentListType = null
      }
      elements.push({ type: "hr", content: "" })
      continue
    }

    // Handle headers
    if (trimmed.startsWith("# ")) {
      if (currentList !== null) {
        elements.push({
          type: currentListType!,
          content: "",
          items: currentList,
        })
        currentList = null
        currentListType = null
      }
      elements.push({ type: "h1", content: trimmed.substring(2).trim() })
      continue
    }
    if (trimmed.startsWith("## ")) {
      if (currentList !== null) {
        elements.push({
          type: currentListType!,
          content: "",
          items: currentList,
        })
        currentList = null
        currentListType = null
      }
      elements.push({ type: "h2", content: trimmed.substring(3).trim() })
      continue
    }
    if (trimmed.startsWith("### ")) {
      if (currentList !== null) {
        elements.push({
          type: currentListType!,
          content: "",
          items: currentList,
        })
        currentList = null
        currentListType = null
      }
      elements.push({ type: "h3", content: trimmed.substring(4).trim() })
      continue
    }
    if (trimmed.startsWith("#### ")) {
      if (currentList !== null) {
        elements.push({
          type: currentListType!,
          content: "",
          items: currentList,
        })
        currentList = null
        currentListType = null
      }
      elements.push({ type: "h4", content: trimmed.substring(5).trim() })
      continue
    }

    // Handle lists
    const unorderedMatch = trimmed.match(/^[-*+]\s+(.+)$/)
    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/)

    if (unorderedMatch || orderedMatch) {
      const listType = unorderedMatch ? "ul" : "ol"
      const itemContent = (unorderedMatch || orderedMatch)![1]

      if (currentList === null || currentListType !== listType) {
        if (currentList !== null) {
          elements.push({
            type: currentListType!,
            content: "",
            items: currentList,
          })
        }
        currentList = []
        currentListType = listType
      }
      currentList.push(parseInlineMarkdown(itemContent))
      continue
    }

    // End list if we hit a non-list, non-empty line
    if (currentList !== null && trimmed !== "") {
      elements.push({
        type: currentListType!,
        content: "",
        items: currentList,
      })
      currentList = null
      currentListType = null
    }

    // Handle paragraphs
    if (trimmed !== "") {
      elements.push({
        type: "p",
        content: parseInlineMarkdown(trimmed),
      })
    }
  }

  // Close any open lists or code blocks
  if (currentList !== null) {
    elements.push({
      type: currentListType!,
      content: "",
      items: currentList,
    })
  }
  if (currentCodeBlock !== null) {
    elements.push({
      type: "code",
      content: currentCodeBlock.join("\n"),
    })
  }
  if (currentBlockquote !== null) {
    elements.push({
      type: "blockquote",
      content: currentBlockquote.join(" "),
    })
  }

  return elements
}

// Parse inline markdown (bold, italic, code, links)
function parseInlineMarkdown(text: string): string {
  // Remove markdown formatting but keep the text
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1") // Bold
    .replace(/\*(.*?)\*/g, "$1") // Italic (but not bold)
    .replace(/`([^`]+)`/g, "$1") // Inline code
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1") // Links
    .trim()
}

// Render inline markdown with formatting for react-pdf
// Returns an array of Text elements that can be used as children
function renderInlineMarkdown(text: string): (string | React.ReactElement)[] {
  const parts: (string | React.ReactElement)[] = []
  let remaining = text
  let key = 0

  // Process bold, italic, code, and links
  while (remaining.length > 0) {
    // Find the earliest match
    let earliestMatch: {
      index: number
      length: number
      text: string
      style: any
    } | null = null

    // Check for bold (**text**)
    const boldMatch = /\*\*(.*?)\*\*/.exec(remaining)
    if (boldMatch && (!earliestMatch || boldMatch.index < earliestMatch.index)) {
      earliestMatch = {
        index: boldMatch.index,
        length: boldMatch[0].length,
        text: boldMatch[1],
        style: styles.bold,
      }
    }

    // Check for italic (*text*) - but not if it's part of bold
    const italicMatch = /(?<!\*)\*([^*]+?)\*(?!\*)/.exec(remaining)
    if (italicMatch && (!earliestMatch || italicMatch.index < earliestMatch.index)) {
      earliestMatch = {
        index: italicMatch.index,
        length: italicMatch[0].length,
        text: italicMatch[1],
        style: styles.italic,
      }
    }

    // Check for inline code (`code`)
    const codeMatch = /`([^`]+)`/.exec(remaining)
    if (codeMatch && (!earliestMatch || codeMatch.index < earliestMatch.index)) {
      earliestMatch = {
        index: codeMatch.index,
        length: codeMatch[0].length,
        text: codeMatch[1],
        style: styles.code,
      }
    }

    // Check for links [text](url)
    const linkMatch = /\[([^\]]+)\]\([^\)]+\)/.exec(remaining)
    if (linkMatch && (!earliestMatch || linkMatch.index < earliestMatch.index)) {
      earliestMatch = {
        index: linkMatch.index,
        length: linkMatch[0].length,
        text: linkMatch[1],
        style: null,
      }
    }

    if (earliestMatch) {
      // Add text before match
      if (earliestMatch.index > 0) {
        parts.push(remaining.substring(0, earliestMatch.index))
      }
      // Add formatted text
      if (earliestMatch.style) {
        parts.push(
          <Text key={`inline-${key++}`} style={earliestMatch.style}>
            {earliestMatch.text}
          </Text>
        )
      } else {
        parts.push(earliestMatch.text)
      }
      remaining = remaining.substring(earliestMatch.index + earliestMatch.length)
    } else {
      // No more matches, add remaining text
      if (remaining.length > 0) {
        parts.push(remaining)
      }
      break
    }
  }

  return parts.length > 0 ? parts : [text]
}

export function ProtocolPDFDocument({
  title,
  intent,
  content,
  safetyScore = 0,
  empathyScore = 0,
  iterationCount = 0,
  createdAt,
}: ProtocolPDFProps) {
  const elements = parseMarkdown(content)
  const formattedDate = createdAt ? new Date(createdAt).toLocaleDateString() : new Date().toLocaleDateString()

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{intent}</Text>
        </View>

        <View style={styles.metadata}>
          <Text style={styles.metadataItem}>Safety Score: {safetyScore}%</Text>
          <Text style={styles.metadataItem}>Empathy Score: {empathyScore}%</Text>
          <Text style={styles.metadataItem}>Iterations: {iterationCount}</Text>
          <Text style={styles.metadataItem}>Generated: {formattedDate}</Text>
        </View>

        <View style={styles.content}>
          {elements.map((element, index) => {
            switch (element.type) {
              case "h1":
                return (
                  <Text key={index} style={styles.h1}>
                    {parseInlineMarkdown(element.content as string)}
                  </Text>
                )
              case "h2":
                return (
                  <Text key={index} style={styles.h2}>
                    {parseInlineMarkdown(element.content as string)}
                  </Text>
                )
              case "h3":
                return (
                  <Text key={index} style={styles.h3}>
                    {parseInlineMarkdown(element.content as string)}
                  </Text>
                )
              case "h4":
                return (
                  <Text key={index} style={styles.h4}>
                    {parseInlineMarkdown(element.content as string)}
                  </Text>
                )
              case "p":
                return (
                  <Text key={index} style={styles.paragraph}>
                    {renderInlineMarkdown(element.content as string)}
                  </Text>
                )
              case "ul":
                return (
                  <View key={index} style={styles.list}>
                    {element.items?.map((item, itemIndex) => (
                      <Text key={itemIndex} style={styles.listItem}>
                        • {parseInlineMarkdown(item)}
                      </Text>
                    ))}
                  </View>
                )
              case "ol":
                return (
                  <View key={index} style={styles.list}>
                    {element.items?.map((item, itemIndex) => (
                      <Text key={itemIndex} style={styles.listItem}>
                        {itemIndex + 1}. {parseInlineMarkdown(item)}
                      </Text>
                    ))}
                  </View>
                )
              case "code":
                return (
                  <View key={index} style={styles.codeBlock}>
                    <Text style={styles.code}>{element.content}</Text>
                  </View>
                )
              case "blockquote":
                return (
                  <View key={index} style={styles.blockquote}>
                    <Text>{parseInlineMarkdown(element.content as string)}</Text>
                  </View>
                )
              case "hr":
                return <View key={index} style={styles.horizontalRule} />
              default:
                return null
            }
          })}
        </View>

        <View style={styles.footer} fixed>
          <Text>Cerina Protocol Foundry - Generated Protocol</Text>
        </View>
      </Page>
    </Document>
  )
}

