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
    textAlign: "justify",
  },
  section: {
    marginBottom: 15,
  },
  heading: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
    marginTop: 12,
  },
  subheading: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 6,
    marginTop: 10,
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

// Simple markdown to text converter (basic)
function markdownToText(markdown: string): string {
  return markdown
    .replace(/^### (.*$)/gim, "$1") // Headers
    .replace(/^#### (.*$)/gim, "$1")
    .replace(/^## (.*$)/gim, "$1")
    .replace(/^# (.*$)/gim, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1") // Bold
    .replace(/\*(.*?)\*/g, "$1") // Italic
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1") // Links
    .replace(/^\s*[-*+]\s+/gm, "• ") // Lists
    .replace(/^\s*\d+\.\s+/gm, "") // Numbered lists
    .trim()
}

function parseContent(content: string) {
  const lines = content.split("\n")
  const sections: Array<{ type: "heading" | "subheading" | "text"; content: string }> = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed.startsWith("### ")) {
      sections.push({ type: "heading", content: trimmed.replace(/^###\s+/, "") })
    } else if (trimmed.startsWith("#### ")) {
      sections.push({ type: "subheading", content: trimmed.replace(/^####\s+/, "") })
    } else {
      sections.push({ type: "text", content: trimmed })
    }
  }

  return sections
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
  const sections = parseContent(content)
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
          {sections.map((section, index) => {
            if (section.type === "heading") {
              return (
                <Text key={index} style={styles.heading}>
                  {section.content}
                </Text>
              )
            } else if (section.type === "subheading") {
              return (
                <Text key={index} style={styles.subheading}>
                  {section.content}
                </Text>
              )
            } else {
              return (
                <Text key={index} style={styles.section}>
                  {section.content}
                </Text>
              )
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

