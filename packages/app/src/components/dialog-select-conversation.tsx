import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { createMemo, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import type { ConversationPreset } from "@/config/conversation-presets"
import { useConversationPresets } from "@/hooks/use-conversation-presets"
import { ConversationPresetIcon } from "@/components/conversation-preset-icon"
import { conversationIconClass } from "@/pages/layout/conversation-sidebar-styles"

export type DialogSelectConversationProps = {
  onSelect: (preset: ConversationPreset) => void
  mode?: "project" | "qa"
}

function OptionCard(props: { preset: ConversationPreset; onSelect: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      class="flex w-full items-start gap-3 rounded-[6px] px-4 py-3 cursor-default transition-colors hover:bg-[var(--vsp-row-hover,#fafafa)]"
      onClick={props.onSelect}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return
        e.preventDefault()
        props.onSelect()
      }}
    >
      <div
        classList={{
          "size-8 shrink-0 flex items-center justify-center rounded-[6px] text-16-regular": true,
          [conversationIconClass[props.preset.iconClass]]: true,
        }}
      >
        <ConversationPresetIcon icon={props.preset.icon} iconClass={props.preset.iconClass} size="medium" />
      </div>
      <div class="flex-1 min-w-0">
        <h3 class="text-14-medium text-text-strong mb-0.5">{props.preset.name}</h3>
        <p class="text-13-regular text-text-weak leading-snug">{props.preset.description}</p>
        <Show when={props.preset.skillTags.length > 0}>
          <div class="flex flex-wrap gap-1 mt-1.5">
            <For each={props.preset.skillTags}>
              {(tag) => (
                <span class="text-11-regular px-1.5 py-0.5 rounded-full bg-[#e8e8e8] text-text-weak">{tag}</span>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}

export function DialogSelectConversation(props: DialogSelectConversationProps) {
  const dialog = useDialog()
  const language = useLanguage()
  const layout = useLayout()
  const presets = useConversationPresets()
  const filtered = createMemo(() => {
    const mode = props.mode ?? layout.mode()
    return presets().filter((preset) => preset.mode === mode)
  })

  return (
    <Dialog
      title={language.t("dialog.conversation.new.title")}
      description={language.t("dialog.conversation.new.description")}
      size="large"
      fit
    >
      <div class="flex flex-col gap-1 px-4 pb-4 pt-2 max-h-[min(60vh,480px)] overflow-y-auto">
        <For each={filtered()}>
          {(preset) => (
            <OptionCard
              preset={preset}
              onSelect={() => {
                props.onSelect(preset)
                dialog.close()
              }}
            />
          )}
        </For>
      </div>
    </Dialog>
  )
}