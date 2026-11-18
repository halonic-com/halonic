// The Google API that is switched off, read from a failed run's typed cause (requirement
// `runs.run-view.api-off`). Only `cause` is read: a reason that merely mentions an API never
// counts, so an old run or a free-text failure gets the ordinary banner and no chip.

import type { RunSummary } from "@halonicjs/events";
import type { SourcedRun } from "../api.ts";

/** The cause code the Google integrations give a switched-off API (`google.api-disabled`). */
export const apiDisabledCode = "google.api-disabled";

/** The Google APIs the banner and the chip know by name, by the service name Google gives. */
const knownApis = {
  "gmail.googleapis.com": "gmail",
  "drive.googleapis.com": "drive",
} as const;

/** One of the Google APIs Halonic has an integration for. */
export type GoogleApi = (typeof knownApis)[keyof typeof knownApis];

/** What a failed run says about a switched-off API. */
export interface ApiOff {
  readonly api: GoogleApi;
  /** The Google Cloud project as the cause names it; `undefined` when it names none. */
  readonly project: string | undefined;
  /** Where the API is switched on, only when the cause gave a Google console address (see {@link googleConsoleAddress}). */
  readonly enableUrl: string | undefined;
}

/**
 * What the run's cause says about a switched-off Google API, or `undefined` for a run without a
 * `google.api-disabled` cause or one that names an API Halonic doesn't know.
 *
 * @example
 * apiOffOf(failedRun); // { api: "gmail", project: "123456789012", enableUrl: "https://console.cloud.google.com/apis/library/gmail.googleapis.com" }
 */
export function apiOffOf(summary: RunSummary): ApiOff | undefined {
  const { cause } = summary;
  if (summary.status !== "failed" || cause?.code !== apiDisabledCode) {
    return undefined;
  }
  const service = cause.detail?.["api"];
  const api = service === undefined ? undefined : knownApis[service as keyof typeof knownApis];
  if (api === undefined) {
    return undefined;
  }
  const project = cause.detail?.["project"]?.trim();
  return {
    api,
    project: project === undefined || project === "" ? undefined : project,
    enableUrl: googleConsoleAddress(cause.detail?.["enableUrl"]),
  };
}

/** The hosts of Google's console, where an API is switched on. The only hosts the banner opens. */
const googleConsoleHosts: ReadonlySet<string> = new Set([
  "console.cloud.google.com",
  "console.developers.google.com",
]);

/**
 * The address when it is `https` on exactly one of Google's console hosts, else `undefined`. The
 * engine hands the page an address; the page opens it only after this check, so a look-alike
 * host (`console.cloud.google.com.evil.example`), a plain `http:` address, an address with a
 * login in it or one with a port is never opened.
 */
export function googleConsoleAddress(address: string | undefined): string | undefined {
  if (address === undefined) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return undefined;
  }
  const plain =
    url.protocol === "https:" &&
    googleConsoleHosts.has(url.hostname) &&
    url.port === "" &&
    url.username === "" &&
    url.password === "";
  return plain ? url.href : undefined;
}

/** A switched-off API that is still off as far as the runs can tell: the newest run that found it so. */
export interface CurrentApiOff extends ApiOff {
  readonly run: RunSummary;
}

/**
 * The Google APIs the runs say are still switched off, one for each API, as the header chip shows
 * them (requirement `google-setup.connector-badges`). Each comes from the newest real run that failed
 * with that API's typed cause. It stays until a later real run of the same workflow ends without
 * that cause: nothing else clears it, not time and not a click on **Switch it on**, because
 * Studio can't see Google's side. A run doesn't name its Google account, so the workflow is the
 * closest "same run" there is.
 *
 * @example
 * currentApiOffs(runs).map((off) => off.api); // ["gmail"]
 */
export function currentApiOffs(runs: readonly SourcedRun[]): CurrentApiOff[] {
  const newestFirst = runs
    .map((run) => run.summary)
    .filter((summary) => summary.kind === "run")
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const found = new Map<GoogleApi, CurrentApiOff>();
  for (const summary of newestFirst) {
    const off = apiOffOf(summary);
    if (off === undefined || found.has(off.api)) {
      continue;
    }
    const later = newestFirst.filter(
      (other) =>
        Date.parse(other.startedAt) > Date.parse(summary.startedAt) &&
        other.hubId === summary.hubId &&
        other.workflowId === summary.workflowId,
    );
    const cleared = later.some(
      (other) => other.endedAt !== null && apiOffOf(other)?.api !== off.api,
    );
    if (!cleared) {
      found.set(off.api, { ...off, run: summary });
    }
  }
  return [...found.values()];
}
