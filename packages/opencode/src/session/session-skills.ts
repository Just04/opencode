import path from "path"
import { Global } from "@opencode-ai/core/global"
import type { Info as ConversationInfo } from "@/config/conversation"
import type { Info as SkillInfo } from "@/skill"

const BUILTIN_SKILL = "customize-opencode"
const GLOBAL_SKILLS_DIR = () => path.join(Global.Path.config, "skills")

function isGlobalConfigSkill(skill: SkillInfo) {
  const root = path.normalize(GLOBAL_SKILLS_DIR())
  const loc = path.normalize(skill.location)
  return loc === root || loc.startsWith(`${root}${path.sep}`)
}

function isProjectOpencodeSkill(skill: SkillInfo, worktree: string) {
  const marker = `${path.sep}.opencode${path.sep}skills${path.sep}`
  return path.normalize(skill.location).includes(marker) && path.normalize(skill.location).includes(path.normalize(worktree))
}

export function allowedForPreset(
  conversation: ConversationInfo | undefined,
  presetID: string | undefined,
): string[] | undefined {
  if (!conversation?.session_skills) return undefined
  if (!presetID) return undefined
  const preset = (conversation.presets ?? []).find((item) => item.id === presetID)
  if (!preset?.skills?.length) return undefined
  return [...preset.skills]
}

export function filterSkills(input: {
  skills: SkillInfo[]
  allowed: string[] | undefined
  worktree: string
}) {
  if (!input.allowed) return input.skills
  const allow = new Set(input.allowed)
  return input.skills.filter((skill) => {
    if (skill.name === BUILTIN_SKILL) return true
    if (isProjectOpencodeSkill(skill, input.worktree)) return true
    if (!isGlobalConfigSkill(skill)) return true
    return allow.has(skill.name)
  })
}

export function denySkill(input: {
  name: string
  skill: SkillInfo | undefined
  allowed: string[] | undefined
  worktree: string
  unlisted: "deny" | "hide"
}) {
  if (!input.allowed || input.unlisted === "hide") return false
  if (input.name === BUILTIN_SKILL) return false
  if (!input.skill || !isGlobalConfigSkill(input.skill)) return false
  if (isProjectOpencodeSkill(input.skill, input.worktree)) return false
  return !input.allowed.includes(input.name)
}

export function presetIDForDirectory(
  conversation: ConversationInfo | undefined,
  directory: string,
  home: string,
) {
  if (!conversation?.presets?.length) return undefined
  const key = path.normalize(directory)
  const match = conversation.presets.find((preset) => {
    const dir = presetDirectory(preset.directory, home)
    return dir === key
  })
  return match?.id
}

function presetDirectory(directory: string, home: string) {
  if (directory.startsWith("~/")) {
    if (!home) return undefined
    return path.normalize(path.join(home, directory.slice(2)))
  }
  return path.normalize(directory)
}

export function filterSkillsByMode(
  skills: SkillInfo[],
  conversation: ConversationInfo | undefined,
  mode: "project" | "qa",
) {
  if (!conversation?.presets?.length) return skills
  const presets = conversation.presets
  const tied = new Set(presets.flatMap((preset) => [preset.id, ...(preset.skills ?? [])]))
  return skills.filter((skill) => {
    if (!tied.has(skill.name)) return true
    return presets.some(
      (preset) =>
        (preset.mode ?? "project") === mode &&
        (preset.id === skill.name || (preset.skills ?? []).includes(skill.name)),
    )
  })
}

export function inferConversationMode(
  conversation: ConversationInfo | undefined,
  input: { directory: string; presetID?: string },
  home: string,
): "project" | "qa" | undefined {
  if (!conversation?.presets?.length) return undefined
  if (input.presetID) {
    const preset = conversation.presets.find((item) => item.id === input.presetID)
    if (preset) return preset.mode ?? "project"
  }
  const key = path.normalize(input.directory)
  const matches = conversation.presets.filter((preset) => presetDirectory(preset.directory, home) === key)
  if (matches.length === 1) return matches[0]!.mode ?? "project"
  const configured = conversation.defaultDirectory ?? conversation.directory
  if (configured) {
    const resolved = presetDirectory(
      configured.startsWith("~/") ? configured : path.normalize(configured),
      home,
    )
    if (resolved === key) return "qa"
  }
  return undefined
}

export * as SessionSkills from "./session-skills"
