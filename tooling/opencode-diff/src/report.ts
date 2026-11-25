/** What one OpenCode version has, as the diff compares it. */
export interface VersionFacts {
  version: string;
  /** The program package's integrity, as npm writes it (`sha512-…`): CI pins it. */
  integrity: string;
  envNames: readonly string[];
  schemaKeys: readonly string[];
}

/** The entries only one of two lists has. */
export interface ListChange {
  added: string[];
  removed: string[];
}

/** What `after` has that `before` hasn't, and the other way round, each sorted. */
export function changeBetween(before: readonly string[], after: readonly string[]): ListChange {
  const old = new Set(before);
  const now = new Set(after);
  return {
    added: after.filter((entry) => !old.has(entry)).sort(),
    removed: before.filter((entry) => !now.has(entry)).sort(),
  };
}

/**
 * The diff as Markdown, for the body of a version-bump pull request
 * (docs/adr/2026-11-24-opencode-harness-program.md): the `OPENCODE_*` names
 * and the config schema keys each version has that the other hasn't.
 *
 * @example
 * formatReport(old, next); // "## OpenCode 2.3.0 → 2.4.0\n\n### `OPENCODE_*` environment names\n…"
 */
export function formatReport(before: VersionFacts, after: VersionFacts): string {
  return [
    `## OpenCode ${before.version} → ${after.version}`,
    "",
    `Program package integrity: \`${before.integrity}\` → \`${after.integrity}\``,
    "",
    ...section(
      "`OPENCODE_*` environment names",
      changeBetween(before.envNames, after.envNames),
      after.envNames.length,
    ),
    ...section(
      "Config schema keys",
      changeBetween(before.schemaKeys, after.schemaKeys),
      after.schemaKeys.length,
    ),
  ].join("\n");
}

function section(title: string, change: ListChange, total: number): string[] {
  const lines = [`### ${title}`, ""];
  if (change.added.length === 0 && change.removed.length === 0) {
    lines.push(`No change (${total} in the new version).`, "");
    return lines;
  }
  lines.push(...listed("Added", change.added), ...listed("Removed", change.removed));
  return lines;
}

function listed(label: string, entries: readonly string[]): string[] {
  if (entries.length === 0) return [];
  return [`${label}:`, "", ...entries.map((entry) => `- \`${entry}\``), ""];
}
