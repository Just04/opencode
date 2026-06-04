import { logSessionSidebar, sessionSidebarDebugEnabled } from "./session-sidebar-debug"

export const qaSidebarDebugEnabled = sessionSidebarDebugEnabled

export function logQaSidebar(step: string, detail?: Record<string, unknown>) {
  logSessionSidebar("qa", step, detail)
}

/** @deprecated Use logQaSidebar */
export const qaSidebarLog = logQaSidebar
