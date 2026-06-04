import { Config } from "@/config/config"
import type { Info as ConversationInfo } from "@/config/conversation"
import { Session } from "@/session/session"
import { SessionSkills } from "@/session/session-skills"
import { InstanceState } from "@/effect/instance-state"
import { Global } from "@opencode-ai/core/global"
import { Effect } from "effect"
import type { Info as SkillInfo } from "@/skill"
import type { SessionID } from "@/session/schema"

const promptModeBySession = new Map<SessionID, "project" | "qa">()
const promptPresetIDBySession = new Map<SessionID, string>()

const sessionPresetID = (session: {
  directory: string
  conversation?: { presetID?: string; mode?: string }
}) => session.conversation?.presetID

export function setPromptMode(sessionID: SessionID, mode: "project" | "qa") {
  promptModeBySession.set(sessionID, mode)
}

export function clearPromptMode(sessionID: SessionID) {
  promptModeBySession.delete(sessionID)
}

export function setPromptPresetID(sessionID: SessionID, presetID: string) {
  promptPresetIDBySession.set(sessionID, presetID)
}

export function clearPromptPresetID(sessionID: SessionID) {
  promptPresetIDBySession.delete(sessionID)
}

function resolvePresetID(sessionID: SessionID, session: { directory: string; conversation?: { presetID?: string; mode?: string } }, conversation: ConversationInfo, mode?: "project" | "qa") {
  const fromPrompt = promptPresetIDBySession.get(sessionID)
  if (fromPrompt) return fromPrompt
  const fromSession = sessionPresetID(session)
  if (fromSession) return fromSession
  const fromDirectory = SessionSkills.presetIDForDirectory(conversation, session.directory, Global.Path.home)
  if (fromDirectory) return fromDirectory
  if (mode && conversation.presets?.length) {
    const match = conversation.presets.find((preset) => (preset.mode ?? "project") === mode)
    if (match) return match.id
  }
  return undefined
}

function resolveMode(
  sessionID: SessionID,
  session: { directory: string; conversation?: { presetID?: string; mode?: string } },
  conversation: ConversationInfo,
) {
  const fromPrompt = promptModeBySession.get(sessionID)
  if (fromPrompt) return fromPrompt
  const fromSession = session.conversation?.mode
  if (fromSession === "qa" || fromSession === "project") return fromSession
  return SessionSkills.inferConversationMode(conversation, {
    directory: session.directory,
    presetID: sessionPresetID(session),
  }, Global.Path.home)
}

export const filterForSession = Effect.fn("SessionSkillsContext.filterForSession")(function* (
  sessionID: SessionID,
  skills: SkillInfo[],
) {
  const config = yield* Config.Service
  const cfg = yield* config.get()
  const conversation = cfg.conversation
  if (!conversation?.presets?.length) return skills

  const sessions = yield* Session.Service
  const session = yield* sessions.get(sessionID).pipe(Effect.catch(() => Effect.succeed(undefined)))
  if (!session) return skills

  const mode = resolveMode(sessionID, session, conversation)
  let filtered = mode ? SessionSkills.filterSkillsByMode(skills, conversation, mode) : skills

  if (!conversation.session_skills) return filtered

  const ctx = yield* InstanceState.context
  const presetID = resolvePresetID(sessionID, session, conversation, mode)
  const allowed = SessionSkills.allowedForPreset(conversation, presetID)
  return SessionSkills.filterSkills({ skills: filtered, allowed, worktree: ctx.worktree })
})

export const denyCall = Effect.fn("SessionSkillsContext.denyCall")(function* (input: {
  sessionID: SessionID
  name: string
  skill: SkillInfo | undefined
}) {
  const config = yield* Config.Service
  const cfg = yield* config.get()
  const conversation = cfg.conversation
  if (!conversation?.presets?.length && !conversation?.session_skills) return false

  const sessions = yield* Session.Service
  const session = yield* sessions.get(input.sessionID).pipe(Effect.catch(() => Effect.succeed(undefined)))
  if (!session) return false

  const mode = resolveMode(input.sessionID, session, conversation)
  if (mode && conversation?.presets?.length) {
    const visible = SessionSkills.filterSkillsByMode(
      input.skill ? [input.skill] : [],
      conversation,
      mode,
    )
    if (input.skill && visible.length === 0) return true
  }

  if (!conversation?.session_skills) return false

  const ctx = yield* InstanceState.context
  const presetID = resolvePresetID(input.sessionID, session, conversation, mode)
  const allowed = SessionSkills.allowedForPreset(conversation, presetID)
  const unlisted = conversation.unlisted ?? "deny"
  return SessionSkills.denySkill({
    name: input.name,
    skill: input.skill,
    allowed,
    worktree: ctx.worktree,
    unlisted,
  })
})

export * as SessionSkillsContext from "./session-skills-context"
