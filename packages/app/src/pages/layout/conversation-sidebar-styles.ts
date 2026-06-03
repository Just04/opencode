import type { ConversationPresetIconClass } from "@/config/conversation-presets"

export const conversationDotClass: Record<ConversationPresetIconClass, string> = {
  data: "bg-[var(--vsp-primary,#3b77c7)]",
  bid: "bg-[#fbb73c]",
  onto: "bg-[#edb2f1]",
}

export const conversationTagClass: Record<ConversationPresetIconClass, string> = {
  data: "bg-[var(--vsp-primary-soft-12,rgba(59,119,199,0.12))] text-[var(--vsp-primary,#3b77c7)]",
  bid: "bg-[rgba(251,183,60,0.15)] text-[#c68400]",
  onto: "bg-[rgba(237,178,241,0.125)] text-[#9b5aa0]",
}

export const conversationIconClass: Record<ConversationPresetIconClass, string> = {
  data: "bg-[var(--vsp-primary-soft,rgba(59,119,199,0.06))]",
  bid: "bg-[rgba(251,183,60,0.15)]",
  onto: "bg-[rgba(237,178,241,0.125)]",
}