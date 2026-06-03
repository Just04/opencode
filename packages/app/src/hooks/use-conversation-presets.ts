import { createMemo } from "solid-js"
import { useParams } from "@solidjs/router"
import { conversationPresetsWithDefaults } from "@/config/conversation-presets"
import { useGlobalSync } from "@/context/global-sync"
import { decode64 } from "@/utils/base64"

export function useConversationPresets() {
  const globalSync = useGlobalSync()
  const params = useParams()

  return createMemo(() => {
    const slug = params.dir
    if (slug) {
      const directory = decode64(slug)
      if (directory) {
        const [store] = globalSync.child(directory, { bootstrap: false })
        return conversationPresetsWithDefaults(store.config)
      }
    }
    return conversationPresetsWithDefaults(globalSync.data.config)
  })
}