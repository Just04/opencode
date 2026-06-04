import { Config } from "@/config/config"
import type { Info as ConversationInfo } from "@/config/conversation"
import { Session } from "@/session/session"
import { SessionSkills, BUILTIN_SKILL } from "@/session/session-skills"
import { InstanceState } from "@/effect/instance-state"
import { Global } from "@opencode-ai/core/global"
import { Effect } from "effect"
import { create as createEffectLogger } from "@opencode-ai/core/effect/logger"
import * as Log from "@opencode-ai/core/util/log"
import type { Info as SkillInfo } from "@/skill"
import type { SessionID } from "@/session/schema"

const elog = createEffectLogger({ service: "session-skills-context" })
const slog = Log.create({ service: "session-skills-context" })

const promptModeBySession = new Map<SessionID, "project" | "qa">()
const promptPresetIDBySession = new Map<SessionID, string>()

const sessionPresetID = (session: {
  directory: string
  conversationPresetID?: string
}) => session.conversationPresetID

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

function resolvePresetID(sessionID: SessionID, session: { directory: string; conversationPresetID?: string }, conversation: ConversationInfo, mode?: "project" | "qa") {
  const fromPrompt = promptPresetIDBySession.get(sessionID)
  slog.info("resolvePresetID: step1 promptModeBySession", { sessionID, fromPrompt })
  if (fromPrompt) return fromPrompt

  const fromSession = sessionPresetID(session)
  slog.info("resolvePresetID: step2 session.conversationPresetID", { sessionPresetID: fromSession, sessionDir: session.directory })
  if (fromSession) return fromSession

  const fromDirectory = SessionSkills.presetIDForDirectory(conversation, session.directory, Global.Path.home)
  slog.info("resolvePresetID: step3 directory match", { sessionDir: session.directory, home: Global.Path.home, presetDirections: conversation.presets?.map((p) => ({ id: p.id, dir: p.directory })), matchedPresetID: fromDirectory })
  if (fromDirectory) return fromDirectory

  // step 4: mode 回退 — 有多个同 mode preset 时无法确定用哪个，不猜
  slog.info("resolvePresetID: step4 mode fallback skip", { mode, allPresetModes: conversation.presets?.map((p) => ({ id: p.id, mode: p.mode })) })

  slog.info("resolvePresetID: all steps failed, returning undefined")
  return undefined
}

function resolveMode(
  sessionID: SessionID,
  session: { directory: string; conversationPresetID?: string },
  conversation: ConversationInfo,
) {
  const fromPrompt = promptModeBySession.get(sessionID)
  slog.info("resolveMode: step1 promptModeBySession", { sessionID, fromPrompt })
  if (fromPrompt) return fromPrompt

  // session 本身没有 mode 字段，从 presetID 推断
  const sessionPreset = sessionPresetID(session)
  const inferred = SessionSkills.inferConversationMode(conversation, {
    directory: session.directory,
    presetID: sessionPreset,
  }, Global.Path.home)
  slog.info("resolveMode: step3 inferConversationMode", { directory: session.directory, presetID: sessionPreset, home: Global.Path.home, inferred })
  return inferred
}

export const filterForSession = Effect.fn("SessionSkillsContext.filterForSession")(function* (
  sessionID: SessionID,
  skills: SkillInfo[],
) {
  yield* elog.info("filterForSession start", {
    sessionID,
    skillCount: skills.length,
    skillNames: skills.map((s) => s.name),
  })

  // 1. 读取 conversation 配置（session_skills, presets, directory 等）
  const config = yield* Config.Service
  const cfg = yield* config.get()
  const conversation = cfg.conversation
  yield* elog.info("filterForSession: config loaded", {
    hasConversation: !!conversation,
    session_skills: conversation?.session_skills,
    presetsCount: conversation?.presets?.length,
    presetIds: conversation?.presets?.map((p) => p.id),
    defaultDirectory: conversation?.defaultDirectory,
    directory: conversation?.directory,
  })
  // 没有 presets → 不过滤，返回全部技能
  if (!conversation?.presets?.length) {
    yield* elog.info("filterForSession: no presets, returning all")
    return skills
  }

  // 2. 获取当前 session 信息
  const sessions = yield* Session.Service
  const session = yield* sessions.get(sessionID).pipe(Effect.catch(() => Effect.succeed(undefined)))
  if (!session) {
    yield* elog.info("filterForSession: no session found, returning all")
    return skills
  }
  yield* elog.info("filterForSession: session found", {
    sessionID: session.id,
    directory: session.directory,
    workspaceID: session.workspaceID,
  })

  // 3. 解析 mode（project/qa）—— 多层次回退（prompt → session → inferred）
  const mode = resolveMode(sessionID, session, conversation)
  yield* elog.info("filterForSession: mode resolved", { mode, sessionDir: session.directory })

  // 4. 按 mode 过滤：只保留绑定了当前 mode 的 preset 的技能
  //    未绑定任何 preset 的技能（如 skill-creator）会通过
  let filtered = mode ? SessionSkills.filterSkillsByMode(skills, conversation, mode) : skills

  // 5. session_skills 开关检查
  //    false = 只做 mode 过滤就返回
  //    true  = 继续执行 preset 级别的 allowlist 过滤
  yield* elog.info("filterForSession: session_skills check", {
    session_skills: conversation.session_skills,
    modeFiltered: filtered.map((s) => s.name),
  })
  if (!conversation.session_skills) {
    yield* elog.info("filterForSession: session_skills disabled, returning mode-filtered", {
      outputSkills: filtered.map((s) => s.name),
    })
    return filtered
  }

  // 6. 解析当前激活的是哪个 preset
  //    多层次回退（prompt → session.conversationPresetID → 目录匹配 → mode 回退）
  const ctx = yield* InstanceState.context
  yield* elog.info("filterForSession: about to resolve presetID", { mode, sessionID, worktree: ctx.worktree })

  const presetID = resolvePresetID(sessionID, session, conversation, mode)
  yield* elog.info("filterForSession: presetID resolved", { presetID })

  // 7. 用 presetID 找到对应的 preset，取其 skills 做 allowlist
  //    解析不到 presetID 时 allowed=undefined, filterSkills 会放行全部技能
  const allowed = SessionSkills.allowedForPreset(conversation, presetID)
  yield* elog.info("filterForSession: allowed computed", { allowed, hasSessionSkills: !!conversation?.session_skills })

  // 8. 最终用白名单过滤：保留白名单内的全局技能 + 内置技能 + 项目本地技能
  const result = SessionSkills.filterSkills({ skills: filtered, allowed, worktree: ctx.worktree })
  yield* elog.info("filterForSession final result", {
    outputSkills: result.map((s) => s.name),
  })
  return result
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
