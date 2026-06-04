export function sessionSidebarDebugEnabled() {
  if (import.meta.env.DEV) return true
  if (typeof localStorage === "undefined") return false
  return (
    localStorage.getItem("opencode.debug.sessionSidebar") === "1" ||
    localStorage.getItem("opencode.debug.qaSidebar") === "1"
  )
}

export function logSessionSidebar(
  scope: "project" | "qa" | "load",
  step: string,
  detail?: Record<string, unknown>,
) {
  if (!sessionSidebarDebugEnabled()) return
  if (detail) console.info(`[session-sidebar:${scope}]`, step, detail)
  else console.info(`[session-sidebar:${scope}]`, step)
}
