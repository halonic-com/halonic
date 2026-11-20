import type { Provider } from "@halonicjs/format";
import type { TrustStore } from "@halonicjs/ports";
import { canonicalJson } from "@halonicjs/std";
import { providersTrustContent } from "@halonicjs/workspace";

/**
 * Whether the host may call `provider`, as it loaded it from the workspace
 * in `workspaceRoot`, by the rule Studio checks before it asks: the test
 * model reaches nothing, so it needs no trust; any other provider must be in
 * the content of the trust record a person saved for this folder, with the
 * same type, address, secret name and settings. The host reads the record in
 * the user's profile itself, so a provider file saved after Studio's check
 * isn't called. Never rejects: a record it can't read is a no.
 *
 * @param store - the trust records of the user's profile; `undefined` when the host has no profile folder, so only the test model passes
 * @param workspaceRoot - the workspace folder as a real path, the record's key
 */
export async function isProviderTrusted(
  store: TrustStore | undefined,
  workspaceRoot: string,
  provider: Provider,
): Promise<boolean> {
  if (provider.type === "mock") return true;
  const wanted = providersTrustContent([provider]).providers[0];
  // A provider whose address the trust check refuses can't be trusted at all.
  if (wanted === undefined || store === undefined) return false;
  try {
    const record = await store.get(workspaceRoot);
    if (record === null) return false;
    const expected = canonicalJson(wanted);
    return trustedProviders(record.content).some((each) => sameJson(each, expected));
  } catch {
    return false;
  }
}

/** The providers of a record's content; anything that isn't shaped as trust content has none. */
function trustedProviders(content: unknown): unknown[] {
  if (typeof content !== "object" || content === null || Array.isArray(content)) return [];
  const providers = (content as Record<string, unknown>)["providers"];
  return Array.isArray(providers) ? providers : [];
}

/** Whether `value` writes as `expected`; a value that isn't plain JSON data doesn't. */
function sameJson(value: unknown, expected: string): boolean {
  try {
    return canonicalJson(value) === expected;
  } catch {
    return false;
  }
}
