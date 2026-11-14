import { parse, s } from "@halonicjs/schema-kit";
import type { ServedWorkspace } from "@halonicjs/studio-feature-workspace";

/** `GET /api/workspace`'s answer (`studio.served-workspace`): exactly these three fields. */
const servedWorkspaceSchema = s
  .object({ name: s.string(), sample: s.boolean(), folder: s.string() })
  .strict();

/**
 * Asks the computer running Halonic which workspace it serves. Rejects when it doesn't answer,
 * refuses (no session) or answers anything but the three fields, so a caller never shows a
 * half-known workspace.
 *
 * @example
 * const workspace = await loadServedWorkspace(window.fetch.bind(window));
 */
export async function loadServedWorkspace(
  fetchPage: (path: string) => Promise<Response>,
): Promise<ServedWorkspace> {
  const response = await fetchPage("/api/workspace");
  if (!response.ok) {
    throw new Error(`The computer answered ${response.status} to /api/workspace.`);
  }
  const answer = parse(servedWorkspaceSchema, await response.json());
  if (!answer.ok) {
    throw new Error("The computer's /api/workspace answer isn't a workspace.");
  }
  return answer.value;
}
