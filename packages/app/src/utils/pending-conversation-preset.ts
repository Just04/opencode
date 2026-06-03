import type { ConversationPreset } from "@/config/conversation-presets"

let pending: ConversationPreset | undefined

export const PendingConversationPreset = {
  set(preset: ConversationPreset) {
    pending = preset
  },
  peek() {
    return pending
  },
  take() {
    const value = pending
    pending = undefined
    return value
  },
}