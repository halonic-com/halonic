import { checkExpiry } from "../lib/advisories.ts";
import type { CheckContext } from "../lib/context.ts";
import { readDeny } from "../lib/deny.ts";
import { Report } from "../lib/problems.ts";

const guide = "See docs/guides/checks.md.";
export const denyPath = "apps/studio/src-tauri/deny.toml";
const licencesPath = "tooling/check/licences.json";
const isoDate = /\b\d{4}-\d{2}-\d{2}\b/g;

/**
 * Keeps the Studio shell's `deny.toml` (cargo-deny) in line with the rest of
 * the guard: `[licenses] allow` is the `shipped` list of `licences.json`, and
 * each `[advisories] ignore` entry names an expiry date in its reason, which
 * is neither past nor more than 90 days out, as in `advisories-ignored.json`.
 * Without a `deny.toml` there is nothing to check.
 */
export function checkDeny(context: CheckContext, today = new Date()): Report {
  const report = new Report("deny-toml");
  if (!context.files.includes(denyPath)) {
    return report;
  }
  const { allow, ignore } = readDeny(context.read(denyPath));
  if (allow === undefined) {
    report.error(denyPath, `[licenses] needs an "allow" list. ${guide}`);
  } else if (!context.files.includes(licencesPath)) {
    report.error(licencesPath, `The file is missing, so ${denyPath} can't be compared. ${guide}`);
  } else {
    const shipped =
      (JSON.parse(context.read(licencesPath)) as { shipped?: string[] }).shipped ?? [];
    const missing = shipped.filter((licence) => !allow.includes(licence));
    const extra = allow.filter((licence) => !shipped.includes(licence));
    if (missing.length > 0 || extra.length > 0) {
      const parts = [
        missing.length > 0 ? `missing: ${missing.join(", ")}` : "",
        extra.length > 0 ? `not in "shipped": ${extra.join(", ")}` : "",
      ].filter(Boolean);
      report.error(
        denyPath,
        `[licenses] allow must be the "shipped" list of ${licencesPath} (${parts.join("; ")}). A licence change needs Julian's review, in both files. ${guide}`,
      );
    }
  }
  if (ignore === undefined) {
    report.error(
      denyPath,
      `[advisories] needs an "ignore" list, empty when nothing is ignored. ${guide}`,
    );
    return report;
  }
  const seen = new Set<string>();
  for (const entry of ignore) {
    const at = `[advisories] ignore ${entry.id || "(entry without an id)"}`;
    const problems: string[] = [];
    if (entry.id === "") {
      problems.push(`${at} needs an id`);
    } else if (seen.has(entry.id)) {
      problems.push(`${at} is repeated`);
    }
    seen.add(entry.id);
    const dates = entry.reason.match(isoDate) ?? [];
    if (entry.reason.trim() === "") {
      problems.push(`${at} needs a reason`);
    } else if (dates.length !== 1) {
      problems.push(
        `${at} must name exactly one expiry date (YYYY-MM-DD) in its reason, for example "Expires 2027-02-05"`,
      );
    } else {
      checkExpiry(at, entry.id, dates[0] as string, today, problems);
    }
    for (const problem of problems) {
      report.error(denyPath, `${problem}. ${guide}`);
    }
  }
  return report;
}
