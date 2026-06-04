import type { Config } from "@opencode-ai/sdk/v2/client"
import { PendingConversationPreset } from "@/utils/pending-conversation-preset"
import { resolveConversationIcon } from "@/config/conversation-preset-icons"
import {
  conversationPresetsWithDefaults,
  normalizeIconClass,
  resolvePresetDirectory,
  type ConversationPreset,
  type ConversationPresetIconClass,
} from "@/config/conversation-presets"
import type { Session } from "@opencode-ai/sdk/v2/client"
import { pathKey } from "@/utils/path-key"
import { createStore } from "solid-js/store"

type SessionConversationData = {
  presetID?: string
  tagLabel?: string
  icon?: string
  iconClass?: string
}

type SessionWithConversation = Session & { conversation?: SessionConversationData }
const asSessionConv = (s: Session): SessionWithConversation => s as SessionWithConversation

export type ConversationSessionMeta = {
  presetID: string
  tagLabel: string
  icon: string
  iconClass: ConversationPresetIconClass
  mode?: "project" | "qa"
}

const STORAGE_KEY = "opencode.conversation-session-meta.v1"
const STORE_CAP = 600

function readStorage(): Record<string, ConversationSessionMeta> {
  if (typeof localStorage === "undefined") return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { bySession?: Record<string, ConversationSessionMeta> }
    return parsed.bySession ?? {}
  } catch {
    return {}
  }
}

function writeStorage(bySession: Record<string, ConversationSessionMeta>) {
  if (typeof localStorage === "undefined") return
  try {
    const entries = Object.entries(bySession)
    const trimmed =
      entries.length <= STORE_CAP
        ? bySession
        : Object.fromEntries(entries.slice(entries.length - STORE_CAP))
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ bySession: trimmed }))
  } catch {
    /* quota or private mode */
  }
}

const [store, setStore] = createStore({
  bySession: readStorage(),
})

export function conversationMetaFromPreset(preset: ConversationPreset): ConversationSessionMeta {
  return {
    presetID: preset.id,
    tagLabel: preset.tagLabel,
    icon: preset.icon,
    iconClass: preset.iconClass,
    mode: preset.mode,
  }
}

export function conversationPayloadFromMeta(meta: ConversationSessionMeta) {
  return {
    presetID: meta.presetID,
    tagLabel: meta.tagLabel,
    icon: meta.icon,
    iconClass: meta.iconClass,
    mode: meta.mode,
  }
}

type SessionClient = {
  session: {
    update: (input: { sessionID: string } & Record<string, unknown>) => Promise<{ data?: Session }>
  }
}

export async function persistConversationSessionMeta(input: {
  client: SessionClient
  sessionID: string
  meta: ConversationSessionMeta
}) {
  setConversationSessionMeta(input.sessionID, input.meta)
  try {
    const updated = await input.client.session.update({
      sessionID: input.sessionID,
      conversation: conversationPayloadFromMeta(input.meta),
    })
    return updated.data
  } catch {
    return undefined
  }
}

export function sessionWithConversation(session: Session, meta: ConversationSessionMeta): Session {
  if (asSessionConv(session).conversation?.tagLabel) return session
  return { ...session, conversation: conversationPayloadFromMeta(meta) } as Session
}

export function setConversationSessionMeta(sessionId: string, meta: ConversationSessionMeta) {
  setStore("bySession", (prev) => {
    const next = { ...prev, [sessionId]: meta }
    writeStorage(next)
    return next
  })
}

export function getConversationSessionMeta(sessionId: string) {
  return store.bySession[sessionId]
}

export function getConversationPresetID(session: { id: string } & Record<string, unknown>) {
  const meta = getConversationSessionMeta(session.id)
  console.log("[getConversationPresetID] step1 localStorage meta:", meta, "sessionId:", session.id)
  if (meta?.presetID) {
    console.log("[getConversationPresetID] found from localStorage:", meta.presetID)
    return meta.presetID
  }
  const direct = (session as { conversationPresetID?: string }).conversationPresetID
  console.log("[getConversationPresetID] step2 session.conversationPresetID:", direct)
  if (direct) return direct
  const pending = PendingConversationPreset.peek()
  console.log("[getConversationPresetID] step3 PendingConversationPreset:", pending?.id)
  if (pending) return pending.id
  console.log("[getConversationPresetID] all steps failed, returning undefined")
  return undefined
}

const TITLE_HINTS: Record<string, RegExp[]> = {
  "bid-writing": [/标书/, /投标/, /商务标/, /技术标/, /评分标/],
  "data-query": [/问数/, /数据分析/, /数据查询/, /\bSQL\b/i],
  "ontology-kb": [/本体/, /知识库/, /\bOWL\b/i, /\bRDF\b/i, /\bSPARQL\b/i],
}

export function collectConversationPresets(configs: Array<Config | undefined>, _home = "") {
  const seen = new Set<string>()
  const result: ConversationPreset[] = []
  for (const config of configs) {
    for (const preset of conversationPresetsWithDefaults(config)) {
      if (seen.has(preset.id)) continue
      seen.add(preset.id)
      result.push(preset)
    }
  }
  return result
}

export function inferConversationMetaFromTitle(
  title: string | undefined,
  presets: ConversationPreset[],
): ConversationSessionMeta | undefined {
  const raw = title?.trim()
  if (!raw || presets.length === 0) return undefined

  for (const preset of presets) {
    if (raw.includes(preset.name) || raw.includes(preset.tagLabel)) {
      return conversationMetaFromPreset(preset)
    }
  }

  for (const preset of presets) {
    const hints = TITLE_HINTS[preset.id]
    if (!hints?.some((pattern) => pattern.test(raw))) continue
    return conversationMetaFromPreset(preset)
  }

  return undefined
}

export function conversationMetaFromDirectory(
  directory: string,
  presets: ConversationPreset[],
  home: string,
): ConversationSessionMeta | undefined {
  const key = pathKey(directory)
  if (!key) return undefined
  const matches = presets.filter((preset) => pathKey(resolvePresetDirectory(preset.directory, home)) === key)
  if (matches.length !== 1) return undefined
  return conversationMetaFromPreset(matches[0]!)
}

export function getSessionConversationMeta(
  session: Session,
  input?: {
    fallback?: ConversationSessionMeta
    presets?: ConversationPreset[]
    home?: string
  },
) {
  const conversation = asSessionConv(session).conversation
  if (conversation?.tagLabel) {
    return {
      presetID: conversation.presetID ?? input?.fallback?.presetID ?? "",
      tagLabel: conversation.tagLabel,
      icon: resolveConversationIcon({
        icon: conversation.icon ?? input?.fallback?.icon,
        iconClass: normalizeIconClass(conversation.iconClass),
      }),
      iconClass: normalizeIconClass(conversation.iconClass),
    }
  }

  const cached = store.bySession[session.id]
  if (cached) return cached

  const presets = input?.presets ?? []
  const home = input?.home ?? ""
  const inferred = inferConversationMetaFromTitle(session.title, presets)
  if (inferred) return inferred

  const byDirectory = conversationMetaFromDirectory(session.directory, presets, home)
  if (byDirectory) return byDirectory

  return input?.fallback
}