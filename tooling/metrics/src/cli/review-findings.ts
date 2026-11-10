import { parseArgs } from "node:util";
import { findingsTable } from "../findings.ts";
import { createReader, reviewFindings } from "../github.ts";

/**
 * node tooling/metrics/src/cli/review-findings.ts --since <date> --until <date> [--repo owner/name] [--json]
 *
 * Counts the tagged review findings (`[blocker]`, `[major]`, `[minor]`,
 * `[nit]`) of every pull request merged in the window, through the GitHub
 * API. Read-only. Set GH_TOKEN (for example `GH_TOKEN=$(gh auth token)`);
 * without it, GitHub allows only 60 requests an hour.
 */

const usage =
  "Usage: review-findings --since 2026-10-13 --until 2026-11-10 [--repo halonic-com/halonic] [--json]";

const { values } = parseArgs({
  options: {
    since: { type: "string" },
    until: { type: "string" },
    repo: { type: "string", default: "halonic-com/halonic" },
    json: { type: "boolean", default: false },
  },
});

const { since, until, repo, json } = values;
if (
  since === undefined ||
  until === undefined ||
  Number.isNaN(Date.parse(since)) ||
  Number.isNaN(Date.parse(until)) ||
  !/^[\w.-]+\/[\w.-]+$/.test(repo)
) {
  console.error(usage);
  process.exitCode = 2;
} else {
  const token = process.env["GH_TOKEN"] ?? process.env["GITHUB_TOKEN"];
  const reader = createReader({ fetch, token });
  const rows = await reviewFindings(reader, repo, { since, until });
  console.log(json ? JSON.stringify(rows, null, 2) : findingsTable(rows));
}
