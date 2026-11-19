import {
  type DeniedPathGroupCode,
  deniedPathGroupCodes,
  type SandboxOpenedView,
  type SandboxSignIn,
  type SandboxStrength,
  type SubscriptionProvider,
} from "./sandbox-opened.ts";

const strengths: readonly unknown[] = ["os", "vm", "remote"] satisfies SandboxStrength[];
const subscriptionProviders: readonly unknown[] = [
  "anthropic",
  "openai",
] satisfies SubscriptionProvider[];
const groupCodes: readonly unknown[] = deniedPathGroupCodes;

/** A list of strings, or `null` when the value is anything else. */
function stringsOf(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((item) => typeof item === "string")) return null;
  return [...value];
}

/** A list of group codes, or `null` when the value holds anything else. */
function groupCodesOf(value: unknown): DeniedPathGroupCode[] | null {
  const codes = stringsOf(value);
  if (codes === null) return null;
  if (!codes.every((code) => groupCodes.includes(code))) return null;
  return codes as DeniedPathGroupCode[];
}

/**
 * A stored sign-in with only its kind and provider; `undefined` when there is
 * none, and `null` when it is damaged.
 */
function signInOf(value: unknown): SandboxSignIn | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null) return null;
  const { kind, provider }: { kind?: unknown; provider?: unknown } = value;
  if (kind === "key" && typeof provider === "string" && provider !== "") {
    return { kind, provider };
  }
  if (kind === "subscription" && subscriptionProviders.includes(provider)) {
    return { kind, provider: provider as SubscriptionProvider };
  }
  return null;
}

/**
 * Reads the `sandbox` of a stored `sandbox.opened` event (requirement
 * `events.sandbox-opened`). It never throws: a value that is damaged, from
 * another version or missing a field gives `null`, and so does a damaged
 * sign-in, though an event without one reads fine, so a screen says it
 * couldn't read what the step could do instead of showing part of it. It
 * copies only the view's fields, so an extra field in a damaged log never
 * reaches a screen either.
 *
 * @param value - the event's `sandbox`, as parsed from the log
 * @returns the view, or `null` when it can't be read
 *
 * @example
 * readSandboxOpened({ strength: "os", workingFolder: "~/work", ... }); // => { strength: "os", ... }
 * readSandboxOpened("damaged"); // => null
 */
export function readSandboxOpened(value: unknown): SandboxOpenedView | null {
  if (typeof value !== "object" || value === null) return null;
  const fields: Partial<Record<keyof SandboxOpenedView, unknown>> = value;
  const { strength, workingFolder, timeLimitMs } = fields;
  const readOnlyPaths = stringsOf(fields.readOnlyPaths);
  const deniedGroups = groupCodesOf(fields.deniedGroups);
  const deniedPaths = stringsOf(fields.deniedPaths);
  const allowedSites = stringsOf(fields.allowedSites);
  const signIn = signInOf(fields.signIn);
  if (!strengths.includes(strength) || typeof workingFolder !== "string") return null;
  if (typeof timeLimitMs !== "number" || !Number.isFinite(timeLimitMs) || timeLimitMs < 0) {
    return null;
  }
  if (readOnlyPaths === null || deniedGroups === null) return null;
  if (deniedPaths === null || allowedSites === null || signIn === null) return null;
  return {
    strength: strength as SandboxStrength,
    workingFolder,
    readOnlyPaths,
    deniedGroups,
    deniedPaths,
    allowedSites,
    timeLimitMs,
    ...(signIn === undefined ? {} : { signIn }),
  };
}
