import path from "path"
import { Global } from "@opencode-ai/core/global"
import type { Info as ConversationInfo } from "@/config/conversation"
import type { Info as SkillInfo } from "@/skill"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "session-skills" })

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
  if (!conversation?.session_skills) {
    log.info("allowedForPreset: session_skills disabled or conversation missing")
    return undefined
  }
  if (!presetID) {
    log.info("allowedForPreset: no presetID")
    return undefined
  }
  const preset = (conversation.presets ?? []).find((item) => item.id === presetID)
  if (!preset?.skills?.length) {
    log.info("allowedForPreset: preset found but no skills list", { presetID })
    return undefined
  }
  log.info("allowedForPreset: returning allowlist", { presetID, allowed: preset.skills })
  return [...preset.skills]
}

export function filterSkills(input: {
  skills: SkillInfo[]
  allowed: string[] | undefined
  worktree: string
}) {
  if (!input.allowed) {
    log.info("filterSkills: no allowlist, returning all")
    return input.skills
  }
  const allowedList = input.allowed
  const allow = new Set(allowedList)
  const decisions: Array<{ skill: string; decision: string; reason: string }> = []
  const result = input.skills.filter((skill) => {
    if (skill.name === BUILTIN_SKILL) {
      decisions.push({ skill: skill.name, decision: "include", reason: "built-in skill" })
      return true
    }
    if (isProjectOpencodeSkill(skill, input.worktree)) {
      decisions.push({ skill: skill.name, decision: "include", reason: "project-local skill" })
      return true
    }
    if (!isGlobalConfigSkill(skill)) {
      decisions.push({ skill: skill.name, decision: "include", reason: "not a global config skill" })
      return true
    }
    if (allow.has(skill.name)) {
      decisions.push({ skill: skill.name, decision: "include", reason: `in allowlist [${allowedList.join(",")}]` })
      return true
    }
    decisions.push({ skill: skill.name, decision: "exclude", reason: `global skill not in allowlist [${allowedList.join(",")}]` })
    return false
  })
  log.info("filterSkills result", {
    input: input.skills.map((s) => s.name),
    allowed: input.allowed,
    decisions,
    output: result.map((s) => s.name),
  })
  return result
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
  if (!conversation?.presets?.length) {
    log.info("filterSkillsByMode: no presets, returning all")
    return skills
  }
  const presets = conversation.presets
  const tied = new Set(presets.flatMap((preset) => [preset.id, ...(preset.skills ?? [])]))
  const decisions: Array<{ skill: string; decision: string; reason: string }> = []
  const result = skills.filter((skill) => {
    if (!tied.has(skill.name)) {
      decisions.push({ skill: skill.name, decision: "include", reason: "not tied to any preset" })
      return true
    }
    const matched = presets.some(
      (preset) =>
        (preset.mode ?? "project") === mode &&
        (preset.id === skill.name || (preset.skills ?? []).includes(skill.name)),
    )
    if (matched) {
      decisions.push({ skill: skill.name, decision: "include", reason: `tied and matches mode=${mode}` })
    } else {
      decisions.push({ skill: skill.name, decision: "exclude", reason: `tied but no preset with mode=${mode} includes it` })
    }
    return matched
  })
  log.info("filterSkillsByMode result", {
    mode,
    tied: [...tied],
    decisions,
    input: skills.map((s) => s.name),
    output: result.map((s) => s.name),
  })
  return result
}

export function inferConversationMode(
  conversation: ConversationInfo | undefined,
  input: { directory: string; presetID?: string },
  home: string,
): "project" | "qa" | undefined {
  if (!conversation?.presets?.length) {
    log.info("inferConversationMode: no presets, returning undefined")
    return undefined
  }
  if (input.presetID) {
    const preset = conversation.presets.find((item) => item.id === input.presetID)
    if (preset) {
      log.info("inferConversationMode: from presetID", { presetID: input.presetID, mode: preset.mode ?? "project" })
      return preset.mode ?? "project"
    }
  }
  const key = path.normalize(input.directory)
  const matches = conversation.presets.filter((preset) => presetDirectory(preset.directory, home) === key)
  if (matches.length === 1) {
    log.info("inferConversationMode: from single directory match", { directory: input.directory, mode: matches[0]!.mode ?? "project" })
    return matches[0]!.mode ?? "project"
  }
  if (matches.length > 1) {
    log.info("inferConversationMode: multiple directory matches", { count: matches.length, directory: input.directory })
  }
  const configured = conversation.defaultDirectory ?? conversation.directory
  if (configured) {
    const resolved = presetDirectory(
      configured.startsWith("~/") ? configured : path.normalize(configured),
      home,
    )
    if (resolved === key) {
      log.info("inferConversationMode: from defaultDirectory match, returning qa", { directory: input.directory })
      return "qa"
    }
    log.info("inferConversationMode: defaultDirectory mismatch", { configured: resolved, actual: key })
  }
  log.info("inferConversationMode: no match found, returning undefined")
  return undefined
}

export * as SessionSkills from "./session-skills"
