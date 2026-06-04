import type { Config } from "@opencode-ai/sdk/v2/client"
import { resolveConversationIcon } from "@/config/conversation-preset-icons"
import { logQaSidebar } from "@/utils/qa-sidebar-debug"
import { pathKey } from "@/utils/path-key"

type ConversationConfig = {
  presets?: Array<Record<string, unknown>>
  directory?: string
  defaultDirectory?: string
  session_skills?: boolean
}
const readConversation = (config: Config | undefined): ConversationConfig | undefined =>
  (config as unknown as { conversation?: ConversationConfig }).conversation

export type ConversationPresetIconClass = "data" | "bid" | "onto"

export type ConversationPreset = {
  id: string
  name: string
  description: string
  icon: string
  iconClass: ConversationPresetIconClass
  tagLabel: string
  skillTags: string[]
  directory: string
  skills: string[]
  mode: "project" | "qa"
}

const DEFAULT_PRESETS: ConversationPreset[] = [
  {
    id: "data-query",
    name: "智能问数",
    description: "基于自然语言进行数据查询与分析，支持多维度聚合、趋势探查、异常预警。",
    icon: "magnifying-glass-menu",
    iconClass: "data",
    tagLabel: "智能问数",
    skillTags: ["数据分析", "SQL 逻辑", "可视化"],
    directory: "~/opencode-workspaces/data-query",
    skills: [],
    mode: "qa",
  },
  {
    id: "bid-writing",
    name: "标书撰写",
    description: "自动生成商务标、技术标及评分标，支持长文本排版、模板引用与合规检查。",
    icon: "open-file",
    iconClass: "bid",
    tagLabel: "标书撰写",
    skillTags: ["文档解析", "长文本排版", "合规检查"],
    directory: "~/opencode-workspaces/bid-writing",
    skills: [],
    mode: "project",
  },
  {
    id: "ontology-kb",
    name: "本体模型知识库",
    description: "构建与管理 OWL/RDF 本体模型，支持 SPARQL 查询、推理验证与知识图谱可视化。",
    icon: "fork",
    iconClass: "onto",
    tagLabel: "本体模型",
    skillTags: ["Apache Jena", "SPARQL", "OWL 推理"],
    directory: "~/opencode-workspaces/ontology-kb",
    skills: [],
    mode: "qa",
  },
]

export function effectiveConversationConfig(global: Config | undefined, local: Config | undefined) {
  if (hasConversationConfig(local)) return local
  if (hasConversationConfig(global)) return global
  return local ?? global
}

export function normalizeIconClass(value: string | undefined): ConversationPresetIconClass {
  if (value === "bid" || value === "onto") return value
  return "data"
}

function normalizePreset(
  raw: Record<string, unknown>,
): ConversationPreset | undefined {
  if (!raw.id || !raw.name || !raw.description || !raw.directory) return undefined
  const mode = raw.mode === "qa" ? "qa" : "project"
  return {
    id: raw.id as string,
    name: raw.name as string,
    description: raw.description as string,
    icon: resolveConversationIcon({
      icon: raw.icon as string | undefined,
      iconClass: normalizeIconClass(raw.iconClass as string | undefined),
    }),
    iconClass: normalizeIconClass(raw.iconClass as string | undefined),
    tagLabel: (raw.tagLabel as string) ?? (raw.name as string),
    skillTags: (raw.skillTags as string[]) ?? [],
    directory: raw.directory as string,
    skills: (raw.skills as string[]) ?? [],
    mode,
  }
}

export function hasConversationConfig(config: Config | undefined) {
  return (readConversation(config)?.presets?.length ?? 0) > 0
}

export function conversationDirectoriesFromConfig(config: Config | undefined, home: string) {
  if (!hasConversationConfig(config)) return [] as string[]
  const seen = new Set<string>()
  return conversationPresetsFromConfig(config).flatMap((preset) => {
    if (preset.directory.startsWith("~") && !home) return []
    const directory = resolvePresetDirectory(preset.directory, home)
    if (!directory || seen.has(directory)) return []
    seen.add(directory)
    return [directory]
  })
}

export function conversationDirectoriesResolved(config: Config | undefined, home: string) {
  const seen = new Set<string>()
  return conversationPresetsWithDefaults(config).flatMap((preset) => {
    if (preset.directory.startsWith("~") && !home) return []
    const directory = resolvePresetDirectory(preset.directory, home)
    if (!directory || directory.startsWith("~") || seen.has(directory)) return []
    seen.add(directory)
    return [directory]
  })
}

export function hasConversationUi(config: Config | undefined) {
  return conversationPresetsWithDefaults(config).length > 0
}

export function resolvePresetDirectory(directory: string, home: string) {
  const raw = directory.trim()
  if (raw.startsWith("~/")) return home ? `${home}${raw.slice(1)}` : raw
  if (raw === "~") return home || raw
  return raw
}

export function conversationPresetsFromConfig(config: Config | undefined) {
  const presets = readConversation(config)?.presets
  if (!presets?.length) return [] as ConversationPreset[]
  return presets.map(normalizePreset).filter((item): item is ConversationPreset => !!item)
}

export function conversationPresetsWithDefaults(config: Config | undefined) {
  const presets = conversationPresetsFromConfig(config)
  if (presets.length > 0) return presets
  return DEFAULT_PRESETS
}

export function conversationPresetFromConfig(config: Config | undefined, id: string) {
  return conversationPresetsFromConfig(config).find((item) => item.id === id)
}

export function slashSkillVisible(skillName: string, mode: "project" | "qa", config: Config | undefined) {
  const conversation = readConversation(config)
  const presets = conversationPresetsWithDefaults(config)
  const tied = new Set(presets.flatMap((preset) => [preset.id, ...preset.skills]))
  if (conversation?.session_skills && presets.length > 0) {
    const modePresets = presets.filter((preset) => preset.mode === mode)
    if (modePresets.length > 0 && modePresets.some((p) => p.skills.length > 0)) {
      const allowlist = new Set(modePresets.flatMap((p) => p.skills))
      allowlist.add("customize-opencode")
      return allowlist.has(skillName)
    }
  }
  if (!tied.has(skillName)) return true
  return presets.some(
    (preset) =>
      preset.mode === mode && (preset.id === skillName || preset.skills.includes(skillName)),
  )
}

export function qaDefaultDirectory(config: Config | undefined, home: string): string | undefined {
  const conversation = readConversation(config)
  const configured = conversation?.directory ?? conversation?.defaultDirectory
  if (!configured) {
    logQaSidebar("resolve: skip (no directory in config)", {
      hasConversation: !!conversation,
      home,
    })
    return undefined
  }
  const resolved = resolvePresetDirectory(configured, home)
  if (!resolved || resolved.startsWith("~")) {
    logQaSidebar("resolve: skip (path unresolved)", {
      configured,
      resolved: resolved ?? null,
      home,
    })
    return undefined
  }
  logQaSidebar("resolve: ok", { configured, resolved, home })
  return resolved
}

export function qaEffectiveDirectory(
  config: Config | undefined,
  home: string,
  input?: { routeDirectory?: string; lastQaSessionDirectory?: string },
): string | undefined {
  const configured = qaDefaultDirectory(config, home)
  if (configured) return configured

  const route = input?.routeDirectory?.trim()
  if (route) {
    logQaSidebar("resolve: fallback route", { route })
    return route
  }

  const last = input?.lastQaSessionDirectory?.trim()
  if (last) {
    logQaSidebar("resolve: fallback last qa session", { last })
    return last
  }

  const qaPreset = conversationPresetsWithDefaults(config).find((preset) => preset.mode === "qa")
  if (qaPreset) {
    const resolved = resolvePresetDirectory(qaPreset.directory, home)
    if (resolved && !resolved.startsWith("~")) {
      logQaSidebar("resolve: fallback qa preset", { preset: qaPreset.id, resolved })
      return resolved
    }
  }

  return undefined
}

export function qaSidebarDirectories(
  config: Config | undefined,
  home: string,
  input?: { routeDirectory?: string; lastQaSessionDirectory?: string },
): string[] {
  const seen = new Set<string>()
  const dirs: string[] = []
  const add = (directory: string | undefined) => {
    if (!directory?.trim() || directory.startsWith("~")) return
    const key = pathKey(directory)
    if (!key || seen.has(key)) return
    seen.add(key)
    dirs.push(directory)
  }

  add(qaEffectiveDirectory(config, home, input))
  for (const preset of conversationPresetsWithDefaults(config).filter((preset) => preset.mode === "qa")) {
    add(resolvePresetDirectory(preset.directory, home))
  }
  add(input?.routeDirectory)
  add(input?.lastQaSessionDirectory)

  return dirs
}
