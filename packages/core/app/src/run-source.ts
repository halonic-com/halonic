// Which files a run reads (save model 2.2–2.3, HAL-3246): Run, routines,
// triggers and calls from other agents or workflows read the live version,
// so a saved change isn't used until it is made live; Try it and Test read
// the saved files, to try a change before making it live.

import type { RunVersion } from "@halonicjs/events";
import type { DefinitionSource, Vcs } from "@halonicjs/ports";
import { VersionSource } from "@halonicjs/workspace";
import type { LiveVersion } from "./live-version.ts";

/**
 * What starts a run: `run` (the Run button, `halonic run`), a `routine`, a
 * `trigger`, a `call` from another agent or workflow, `try-it` or `test`.
 */
export type RunStartedBy = "run" | "routine" | "trigger" | "call" | "try-it" | "test";

/**
 * The files a run reads:
 * - `live-version`: the workspace at the live version's commit, made on
 *   `versionDate` (the commit's ISO date);
 * - `saved-files`: the files as saved, for Try it and Test, and for every
 *   run while history is off;
 * - `nothing-live`: the workspace has history but no version yet, so a
 *   run that reads the live version has nothing to start ("Make live and
 *   run").
 */
export type RunSource =
  | {
      readonly reads: "live-version";
      readonly source: DefinitionSource;
      readonly commit: string;
      readonly versionDate: string;
    }
  | { readonly reads: "saved-files"; readonly source: DefinitionSource }
  | { readonly reads: "nothing-live" };

/** What {@link runSourceFor} picks from. */
export interface RunSourceInput {
  /** The live version, as `liveVersionOf` found it, read once for the run. */
  readonly live: LiveVersion;
  /** Reads the live version's files. */
  readonly vcs: Pick<Vcs, "readAt" | "listAt">;
  /** The saved files. */
  readonly saved: DefinitionSource;
}

/** The ways of starting a run that try the saved files rather than the live version. */
const triesSavedFiles: ReadonlySet<RunStartedBy> = new Set(["try-it", "test"]);

/**
 * The files a run started by `startedBy` reads (requirement
 * `app.runs-read-latest-version`). Load the run's workspace from the
 * source once and start the run from it: the run keeps those definitions
 * until it ends, and records the source's version, the commit for the
 * live version (`app.run-keeps-its-version`). Pass {@link runVersionOf}
 * the result to record on the run which version it read.
 *
 * @example
 * const live = await liveVersionOf(vcs);
 * const picked = runSourceFor("routine", { live, vcs, saved: store });
 * if (picked.reads !== "nothing-live") {
 *   start(await loadWorkspace(picked.source), { version: runVersionOf(picked) });
 * }
 */
export function runSourceFor(startedBy: RunStartedBy, input: RunSourceInput): RunSource {
  const { live, saved } = input;
  if (triesSavedFiles.has(startedBy) || live.kind === "history-off") {
    return { reads: "saved-files", source: saved };
  }
  if (live.kind === "none-yet") {
    return { reads: "nothing-live" };
  }
  const commit = live.commit.hash;
  return {
    reads: "live-version",
    source: new VersionSource(input.vcs, commit, saved.location),
    commit,
    versionDate: live.commit.date,
  };
}

/**
 * The version a run started from `picked` records on its `run.started`
 * (requirement `app.run-records-its-version`): the live version's commit
 * and date, or the saved files.
 *
 * @example
 * runVersionOf(runSourceFor("try-it", { live, vcs, saved: store })); // { reads: "saved-files" }
 */
export function runVersionOf(picked: Exclude<RunSource, { reads: "nothing-live" }>): RunVersion {
  if (picked.reads === "saved-files") {
    return { reads: "saved-files" };
  }
  return { reads: "live-version", commit: picked.commit, versionDate: picked.versionDate };
}
