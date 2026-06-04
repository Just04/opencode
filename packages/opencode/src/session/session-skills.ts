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
    const dir = preset.directory.startsWith("~/")
      ? home
        ? path.normalize(path.join(home, preset.directory.slice(2)))
        : undefined
      : path.normalize(preset.directory)
    return dir === key
  })
  return match?.id
}

export * as SessionSkills from "./session-skills"
