import type { ScopeRow } from "@halonicjs/google-setup";

/** What the admin note is built from. Nothing here is secret: Google shows the client ID on its sign-in page anyway. */
export interface AdminNoteInput {
  readonly projectId: string | null;
  readonly clientId: string | null;
  /** Every scope the sign-in asks for, each with the reasons the sheets give. */
  readonly scopes: readonly ScopeRow[];
  /** A service's name from its id. Studio never knows the services itself. */
  readonly serviceName: (id: string) => string;
}

/**
 * The note a Workspace user can send to their admin (design 2.3): plain text that holds what an
 * admin needs to allow the app, and never the client secret.
 *
 * @example
 * adminNote({ projectId: "halonic-x", clientId: null, scopes: [], serviceName: String });
 */
export function adminNote(input: AdminNoteInput): string {
  const { projectId, clientId, scopes, serviceName } = input;
  const project =
    projectId === null ? "" : ` in our organisation's Google Cloud project ${projectId}`;
  const client = clientId === null ? "" : ` (client ID ${clientId})`;
  return [
    "I'd like to use Halonic with my Google account.",
    `It uses an app I registered${project}${client}.`,
    `It asks for: ${permissionsIn(scopes, serviceName)}.`,
    "If our settings block it, please allow it in the Admin console under Security → Access and data control → API controls → Manage app access, using that client ID. On that same page you can also mark the app as Trusted, which is usually the simplest fix.",
  ].join(" ");
}

/** "Gmail: Reads your mail; Drive: Reads your files": each service once, with its reasons in the sheets' words. */
function permissionsIn(scopes: readonly ScopeRow[], serviceName: (id: string) => string): string {
  const reasons = new Map<string, string[]>();
  for (const row of scopes) {
    for (const need of row.neededBy) {
      reasons.set(need.service, [...(reasons.get(need.service) ?? []), need.reason]);
    }
  }
  return [...reasons]
    .map(([service, list]) => `${serviceName(service)} (${list.join("; ")})`)
    .join(", ");
}
