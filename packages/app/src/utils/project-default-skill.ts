import type { ServerConnection } from "@/context/server"
import { authTokenFromCredentials } from "@/utils/server"

export type ProjectSkill = {
  name: string
  description?: string
  content?: string
}

const SKILL_LABELS_ZH: Record<string, string> = {
  effect: "Effect 开发",
  "improve-codebase-architecture": "改进代码库架构",
  "customize-opencode": "自定义 OpenCode",
}

export function skillLabel(skill: ProjectSkill, locale: string) {
  if (locale === "zh" || locale === "zht") {
    return SKILL_LABELS_ZH[skill.name] ?? skill.description ?? skill.name
  }
  return skill.description ?? skill.name
}

export function agentsMdForSkills(skills: ProjectSkill[], locale: string) {
  if (skills.length === 0) return ""
  if (skills.length === 1) return agentsMdForSkill(skills[0]!, locale)

  const labels = skills.map((skill) => skillLabel(skill, locale))
  const names = skills.map((skill) => skill.name)
  const bodies = skills
    .map((skill) => {
      const body = skill.content?.trim()
      if (!body) return ""
      return `### ${skillLabel(skill, locale)} (\`${skill.name}\`)\n\n${body}`
    })
    .filter(Boolean)

  if (locale === "zh" || locale === "zht") {
    const list = names.map((name, i) => `- **${labels[i]}**（\`${name}\`）`).join("\n")
    const toolLines = names.map((name) => `skill({ name: "${name}" })`).join("\n")
    if (bodies.length > 0) {
      return `# 项目代理说明\n\n## 默认技能（已生效）\n\n本对话的默认技能为：\n\n${list}\n\n以下内容已写入本文件并会在打开项目时自动进入上下文，**视为默认技能已启用**。\n\n当用户询问「当前技能」时，请列出上述技能并依据下方指导行事。仅在其他任务需要不同技能时，才用 skill 工具加载其他技能。\n\n---\n\n${bodies.join("\n\n---\n\n")}\n`
    }
    return `# 项目代理说明\n\n## 默认技能\n\n本对话的默认技能为：\n\n${list}\n\n请在处理用户请求前，用 skill 工具依次加载：\n\n\`\`\`\n${toolLines}\n\`\`\`\n`
  }

  const list = names.map((name, i) => `- **${labels[i]}** (\`${name}\`)`).join("\n")
  const toolLines = names.map((name) => `skill({ name: "${name}" })`).join("\n")
  if (bodies.length > 0) {
    return `# Project agents\n\n## Default skills (active)\n\nThis conversation's default skills are:\n\n${list}\n\nThe content below is loaded from AGENTS.md when the project opens and **counts as the active default skills**.\n\nIf the user asks for the current skill, list the skills above and follow the guidance below. Use the skill tool only when a different skill is needed.\n\n---\n\n${bodies.join("\n\n---\n\n")}\n`
  }
  return `# Project agents\n\n## Default skills\n\nThis conversation's default skills are:\n\n${list}\n\nLoad them with the skill tool before handling requests:\n\n\`\`\`\n${toolLines}\n\`\`\`\n`
}

export function agentsMdForSkill(skill: ProjectSkill, locale: string) {
  const label = skillLabel(skill, locale)
  const body = skill.content?.trim()

  if (locale === "zh" || locale === "zht") {
    if (body) {
      return `# 项目代理说明\n\n## 默认技能（已生效）\n\n本项目的默认技能是 **${label}**（\`${skill.name}\`）。以下内容已写入本文件并会在打开项目时自动进入上下文，**视为默认技能已启用**。\n\n当用户询问「当前技能」时，请回答默认技能为 \`${skill.name}\`（${label}），并依据下方指导行事。仅在其他任务需要不同技能时，才用 skill 工具加载其他技能。\n\n---\n\n${body}\n`
    }
    return `# 项目代理说明\n\n## 默认技能\n\n本项目的默认技能是 **${label}**（\`${skill.name}\`）。请在处理用户请求前，用 skill 工具加载该技能：\n\n\`\`\`\nskill({ name: "${skill.name}" })\n\`\`\`\n`
  }

  if (body) {
    return `# Project agents\n\n## Default skill (active)\n\nThis project's default skill is **${label}** (\`${skill.name}\`). The content below is loaded from AGENTS.md when the project opens and **counts as the active default skill**.\n\nIf the user asks for the current skill, answer \`${skill.name}\` (${label}) and follow the guidance below. Use the skill tool only when a different skill is needed.\n\n---\n\n${body}\n`
  }
  return `# Project agents\n\n## Default skill\n\nThis project's default skill is **${label}** (\`${skill.name}\`). Load it with the skill tool before handling requests:\n\n\`\`\`\nskill({ name: "${skill.name}" })\n\`\`\`\n`
}

export async function writeProjectAgentsMd(input: {
  server: ServerConnection.HttpBase
  directory: string
  content: string
}) {
  const url = new URL("/file/content", input.server.url)
  url.searchParams.set("directory", input.directory)

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (input.server.password) {
    headers.Authorization = `Basic ${authTokenFromCredentials({
      username: input.server.username,
      password: input.server.password,
    })}`
  }

  const response = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify({ path: "AGENTS.md", content: input.content }),
  })

  if (!response.ok) {
    throw new Error(`Failed to write AGENTS.md (${response.status})`)
  }
}