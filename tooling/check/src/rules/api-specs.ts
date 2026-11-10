import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";
import { breakingChanges } from "../lib/spec-breaking.ts";
import { isCurrentSpecFile, releasedSpecPath, releasedVersions } from "../lib/spec-snapshot.ts";

/** The `N` in a spec's `$id` (`…/v<N>.schema.json`), or undefined when it has none. */
function apiVersion(spec: Readonly<Record<string, unknown>>): string | undefined {
  return /\/v(\d+)\.schema\.json$/.exec(String(spec["$id"]))?.[1];
}

function parse(context: CheckContext, file: string): Readonly<Record<string, unknown>> {
  return JSON.parse(context.read(file)) as Readonly<Record<string, unknown>>;
}

/**
 * Fails when a public API's spec file (`<package>/spec/<name>.schema.json`)
 * has a breaking change since its newest released copy but still names the
 * same API version in its `$id`. It compares with the copy in
 * `spec/released/`, not with git, so it answers the same locally and in CI.
 * That released copies never change is the requirement guard's job: it
 * needs the merge base.
 */
export function checkApiSpecs(context: CheckContext): Report {
  const report = new Report("api-specs");
  for (const file of context.files.filter(isCurrentSpecFile)) {
    const newest = releasedVersions(file, context.files)[0];
    if (newest === undefined) {
      continue;
    }
    const releasedFile = releasedSpecPath(file, newest);
    const released = parse(context, releasedFile);
    const current = parse(context, file);
    const changes = breakingChanges(released, current);
    if (changes.length > 0 && apiVersion(released) === apiVersion(current)) {
      report.error(
        file,
        `It breaks ${releasedFile} but its $id still says v${apiVersion(current) ?? "?"}: ${changes.join(" ")} Bump the API version, or keep the change additive (see the ADR 2026-11-07-port-list-and-versions).`,
      );
    }
  }
  return report;
}
