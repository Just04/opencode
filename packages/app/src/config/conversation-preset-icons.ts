import type { ConversationPresetIconClass } from "@/config/conversation-presets"

export type ConversationPresetIconName =
  | "magnifying-glass-menu"
  | "open-file"
  | "fork"
  | "speech-bubble"
  | "code-lines"
  | "checklist"
  | "file-tree"

export const presetIconByClass: Record<ConversationPresetIconClass, ConversationPresetIconName> = {
  data: "magnifying-glass-menu",
  bid: "open-file",
  onto: "fork",
}

const emojiToIcon: Record<string, ConversationPresetIconName> = {
  "📊": "magnifying-glass-menu",
  "📄": "open-file",
  "🧠": "fork",
  "💬": "speech-bubble",
}

const validIcons = new Set<string>([
  "magnifying-glass-menu",
  "open-file",
  "fork",
  "speech-bubble",
  "code-lines",
  "checklist",
  "file-tree",
])

export function resolveConversationIcon(input: {
  icon?: string
  iconClass?: ConversationPresetIconClass
}): ConversationPresetIconName {
  const raw = input.icon?.trim()
  if (raw && validIcons.has(raw)) return raw as ConversationPresetIconName
  if (raw && emojiToIcon[raw]) return emojiToIcon[raw]
  if (input.iconClass) return presetIconByClass[input.iconClass]
  return "speech-bubble"
}