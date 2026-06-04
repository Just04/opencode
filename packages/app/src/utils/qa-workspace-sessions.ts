import type { Session } from "@opencode-ai/sdk/v2/client"
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
import { pathKey } from "@/utils/path-key"

/** Root sessions for a workspace directory (pathKey match, not archived). */
export function filterWorkspaceRootSessions(directory: string, sessions: Session[]) {
  const key = pathKey(directory)
  return sessions.filter(
    (session) =>
      pathKey(session.directory) === key && !session.parentID && !session.time?.archived,
  )
}

export async function fetchWorkspaceRootSessions(input: {
  client: OpencodeClient
  directory: string
  limit: number
}) {
  const listed = await input.client.session
    .list({ directory: input.directory, scope: "project", roots: true, limit: input.limit })
    .then((x) => x.data ?? [])
    .catch(() => [] as Session[])
  return filterWorkspaceRootSessions(input.directory, listed)
}

/** @deprecated Use filterWorkspaceRootSessions */
export const filterQaWorkspaceSessions = filterWorkspaceRootSessions

/** @deprecated Use fetchWorkspaceRootSessions */
export const fetchQaWorkspaceSessions = fetchWorkspaceRootSessions
