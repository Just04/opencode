import { Config } from "@/config/config"
import { Session } from "@/session/session"
import { SessionSkills } from "@/session/session-skills"
import { InstanceState } from "@/effect/instance-state"
import { Global } from "@opencode-ai/core/global"
import { Effect } from "effect"
import type { Info as SkillInfo } from "@/skill"
import type { SessionID } from "@/session/schema"

const sessionPresetID = (session: { directory: string; conversation?: { presetID?: string } }) =>
  session.conversation?.presetID

export const filterForSession = Effect.fn("SessionSkillsContext.filterForSession")(function* (
  sessionID: SessionID,
  skills: SkillInfo[],
) {
  const config = yield* Config.Service
  const cfg = yield* config.get()
  const conversation = cfg.conversation
  if (!conversation?.session_skills) return skills

  const sessions = yield* Session.Service
  const session = yield* sessions.get(sessionID).pipe(Effect.catch(() => Effect.succeed(undefined)))
  if (!session) return skills

  const ctx = yield* InstanceState.context
  const presetID =
    sessionPresetID(session) ??
    SessionSkills.presetIDForDirectory(conversation, session.directory, Global.Path.home)
  const allowed = SessionSkills.allowedForPreset(conversation, presetID)
  return SessionSkills.filterSkills({ skills, allowed, worktree: ctx.worktree })
})

export const denyCall = Effect.fn("SessionSkillsContext.denyCall")(function* (input: {
  sessionID: SessionID
  name: string
  skill: SkillInfo | undefined
}) {
  const config = yield* Config.Service
  const cfg = yield* config.get()
  const conversation = cfg.conversation
  if (!conversation?.session_skills) return false

  const sessions = yield* Session.Service
  const session = yield* sessions.get(input.sessionID).pipe(Effect.catch(() => Effect.succeed(undefined)))
  if (!session) return false

  const ctx = yield* InstanceState.context
  const presetID =
    sessionPresetID(session) ??
    SessionSkills.presetIDForDirectory(conversation, session.directory, Global.Path.home)
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
