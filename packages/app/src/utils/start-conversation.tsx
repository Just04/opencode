import type { useDialog } from "@opencode-ai/ui/context/dialog"
import { showToast } from "@opencode-ai/ui/toast"
import { DialogSelectConversation } from "@/components/dialog-select-conversation"
import { resolvePresetDirectory, type ConversationPreset } from "@/config/conversation-presets"
import { PendingConversationPreset } from "@/utils/pending-conversation-preset"
import type { useGlobalSDK } from "@/context/global-sdk"
import type { useLanguage } from "@/context/language"
import type { ServerConnection } from "@/context/server"
import {
  agentsMdForSkills,
  skillLabel,
  writeProjectAgentsMd,
  type ProjectSkill,
} from "@/utils/project-default-skill"

async function applyPresetSkills(input: {
  preset: ConversationPreset
  directory: string
  locale: string
  sdk: ReturnType<typeof useGlobalSDK>
  server: ServerConnection.HttpBase
  language: ReturnType<typeof useLanguage>
}) {
  if (input.preset.skills.length === 0) return

  const result = await input.sdk.client.app.skills({ directory: input.directory })
  const available = (result.data ?? []) as ProjectSkill[]
  const selected = input.preset.skills
    .map((name) => available.find((item) => item.name === name))
    .filter((item): item is ProjectSkill => !!item)

  if (selected.length === 0) {
    showToast({
      title: input.language.t("dialog.conversation.skill.missing.title"),
      description: input.language.t("dialog.conversation.skill.missing.description", {
        preset: input.preset.name,
      }),
    })
    return
  }

  const content = agentsMdForSkills(selected, input.locale)
  if (!content) return

  await writeProjectAgentsMd({
    server: input.server,
    directory: input.directory,
    content,
  }).catch(() => {
    showToast({
      title: input.language.t("dialog.conversation.skill.writeFailed.title"),
      description: input.language.t("dialog.conversation.skill.writeFailed.description", {
        preset: input.preset.name,
        skills: selected.map((skill) => skillLabel(skill, input.locale)).join(", "),
      }),
    })
  })
}

export function showNewConversationDialog(input: {
  dialog: ReturnType<typeof useDialog>
  sdk: ReturnType<typeof useGlobalSDK>
  server: ServerConnection.HttpBase | undefined
  language: ReturnType<typeof useLanguage>
  home: string
  targetDirectory?: string
  mode?: "project" | "qa"
  onOpen: (directory: string, preset: ConversationPreset) => void | Promise<void>
  onClose?: () => void
}) {
  input.dialog.show(
    () => (
      <DialogSelectConversation
        mode={input.mode}
        onSelect={(preset) => {
          const presetDir = resolvePresetDirectory(preset.directory, input.home)
          PendingConversationPreset.set(preset)
          if (!input.server) {
            void input.onOpen(input.targetDirectory ?? presetDir, preset)
            return
          }
          void applyPresetSkills({
            preset,
            directory: input.targetDirectory ?? presetDir,
            locale: input.language.locale(),
            sdk: input.sdk,
            server: input.server,
            language: input.language,
          }).finally(() => {
            void input.onOpen(input.targetDirectory ?? presetDir, preset)
          })
        }}
      />
    ),
    input.onClose,
  )
}