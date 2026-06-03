import type { Config } from "@opencode-ai/sdk/v2/client"
import { resolveConversationIcon } from "@/config/conversation-preset-icons"

type ConversationConfig = { presets?: Array<Record<string, unknown>> }
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
  },
]

export function normalizeIconClass(value: string | undefined): ConversationPresetIconClass {
  if (value === "bid" || value === "onto") return value
  return "data"
}

function normalizePreset(
  raw: Record<string, unknown>,
): ConversationPreset | undefined {
  if (!raw.id || !raw.name || !raw.description || !raw.directory) return undefined
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