import type { PluginStateClient } from "@paperclipai/plugin-sdk";

/**
 * The slot where the queue session writes why it took a pull request out of
 * the merge queue (HAL-17604): one plugin state entry per company, namespace
 * `github`, key `dequeue-reasons`, shaped `{ version: 1, reasons: [...] }`.
 * Readers take what is valid and skip the rest; a reason is a short sentence,
 * never log or step text, and is cut to `reasonCap` when it is read.
 */

/** One dequeue the queue session recorded. */
export interface DequeueReason {
  /** `owner/name`. */
  readonly repo: string;
  readonly number: number;
  /** When it was taken out, ISO. */
  readonly at: string;
  readonly reason: string;
}

function key(companyId: string) {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "github",
    stateKey: "dequeue-reasons",
  } as const;
}

function valid(entry: unknown): entry is DequeueReason {
  const value = entry as Partial<Record<keyof DequeueReason, unknown>> | null;
  return (
    typeof value?.repo === "string" &&
    Number.isInteger(value.number) &&
    typeof value.at === "string" &&
    typeof value.reason === "string"
  );
}

/** The recorded dequeue reasons, an empty list before the queue session writes any. */
export async function loadDequeueReasons(
  ctx: { readonly state: Pick<PluginStateClient, "get"> },
  companyId: string,
): Promise<DequeueReason[]> {
  const stored = (await ctx.state.get(key(companyId))) as {
    version?: unknown;
    reasons?: unknown;
  } | null;
  if (stored?.version !== 1 || !Array.isArray(stored.reasons)) {
    return [];
  }
  return stored.reasons.filter(valid);
}
