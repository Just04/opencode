import { Icon } from "@opencode-ai/ui/icon"
import type { ConversationPresetIconClass } from "@/config/conversation-presets"
import { resolveConversationIcon, type ConversationPresetIconName } from "@/config/conversation-preset-icons"

export function ConversationPresetIcon(props: {
  icon?: string
  iconClass?: ConversationPresetIconClass
  name?: ConversationPresetIconName
  size?: "small" | "normal" | "medium"
  class?: string
}) {
  const resolved = () => props.name ?? resolveConversationIcon({ icon: props.icon, iconClass: props.iconClass })
  return (
    <Icon
      name={resolved()}
      size={props.size ?? "normal"}
      classList={{
        "text-text-interactive-base": true,
        [props.class ?? ""]: !!props.class,
      }}
    />
  )
}