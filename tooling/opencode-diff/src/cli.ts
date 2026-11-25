import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchVersion } from "./fetch.ts";
import { formatReport } from "./report.ts";

/**
 * `pnpm --filter @halonicjs/tooling-opencode-diff diff <old> <new>`: prints
 * the diff between two published OpenCode versions as Markdown, for the body
 * of the version-bump pull request.
 */
const usage =
  "Usage: pnpm --filter @halonicjs/tooling-opencode-diff diff <old version> <new version>";
const version = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

const [before, after] = process.argv.slice(2);
if (before === undefined || after === undefined || !version.test(before) || !version.test(after)) {
  process.stderr.write(`${usage}\n`);
  process.exit(2);
}
const folder = await mkdtemp(join(tmpdir(), "opencode-diff-"));
try {
  const old = await fetchVersion(before, join(folder, before));
  const next = await fetchVersion(after, join(folder, after));
  process.stdout.write(formatReport(old, next));
} finally {
  await rm(folder, { recursive: true, force: true });
}
