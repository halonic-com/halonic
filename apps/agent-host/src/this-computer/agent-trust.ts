import type { Agent } from "@halonicjs/format";
import type { TrustStore } from "@halonicjs/ports";
import { canonicalJson } from "@halonicjs/std";
import { agentsTrustContent } from "@halonicjs/workspace";

/**
 * Whether a person trusted `agent` in this workspace as the host loaded it:
 * the trust record saved for the folder lists the agent's harness, sites,
 * working folder and `asks` exactly as its file names them now. The host
 * reads the record in the user's profile itself, so the page's word that the
 * workspace is trusted counts for nothing, and an agent file saved after the
 * person trusted it doesn't pass. Never rejects: a record it can't read is a
 * no, and so is an agent that runs in Halonic's own loop, which starts no
 * program at all.
 *
 * @param store - the trust records of the user's profile; `undefined` when the host has no profile folder, so nothing is trusted
 * @param workspaceRoot - the workspace folder as a real path, the record's key
 */
export async function isAgentTrusted(
  store: TrustStore | undefined,
  workspaceRoot: string,
  agent: Agent,
): Promise<boolean> {
  const wanted = agentsTrustContent([agent])[0];
  if (wanted === undefined || store === undefined) return false;
  try {
    const record = await store.get(workspaceRoot);
    if (record === null) return false;
    const expected = canonicalJson(wanted);
    return trustedAgents(record.content).some((each) => sameJson(each, expected));
  } catch {
    return false;
  }
}

/** The agents of a record's content; anything that isn't shaped as trust content has none. */
function trustedAgents(content: unknown): unknown[] {
  if (typeof content !== "object" || content === null || Array.isArray(content)) return [];
  const agents = (content as Record<string, unknown>)["agents"];
  return Array.isArray(agents) ? agents : [];
}

/** Whether `value` writes as `expected`; a value that isn't plain JSON data doesn't. */
function sameJson(value: unknown, expected: string): boolean {
  try {
    return canonicalJson(value) === expected;
  } catch {
    return false;
  }
}
