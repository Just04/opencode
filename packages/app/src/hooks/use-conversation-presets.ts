import { createMemo } from "solid-js"
import { useParams } from "@solidjs/router"
import type { Config } from "@opencode-ai/sdk/v2/client"
import {
  conversationPresetsWithDefaults,
  effectiveConversationConfig,
} from "@/config/conversation-presets"
import { useGlobalSync } from "@/context/global-sync"
import { decode64 } from "@/utils/base64"

export function useConversationConfig() {
  const globalSync = useGlobalSync()
  const params = useParams()

  return createMemo((): Config | undefined => {
    const globalConfig = globalSync.data.config
    const slug = params.dir
    if (slug) {
      const directory = decode64(slug)
      if (directory) {
        const [store] = globalSync.child(directory, { bootstrap: false })
        return effectiveConversationConfig(globalConfig, store.config)
      }
    }
    return globalConfig
  })
}

export function useConversationPresets() {
  const config = useConversationConfig()
  return createMemo(() => conversationPresetsWithDefaults(config()))
}
