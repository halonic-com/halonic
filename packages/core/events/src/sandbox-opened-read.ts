import {
  type DeniedPathGroupCode,
  deniedPathGroupCodes,
  type SandboxOpenedView,
  type SandboxStrength,
} from "./sandbox-opened.ts";

const strengths: readonly unknown[] = ["os", "vm", "remote"] satisfies SandboxStrength[];
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
 * Reads the `sandbox` of a stored `sandbox.opened` event (requirement
 * `events.sandbox-opened`). It never throws: a value that is damaged, from
 * another version or missing a field gives `null`, so a screen says it
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
  if (!strengths.includes(strength) || typeof workingFolder !== "string") return null;
  if (typeof timeLimitMs !== "number" || !Number.isFinite(timeLimitMs) || timeLimitMs < 0) {
    return null;
  }
  if (readOnlyPaths === null || deniedGroups === null) return null;
  if (deniedPaths === null || allowedSites === null) return null;
  return {
    strength: strength as SandboxStrength,
    workingFolder,
    readOnlyPaths,
    deniedGroups,
    deniedPaths,
    allowedSites,
    timeLimitMs,
  };
}
