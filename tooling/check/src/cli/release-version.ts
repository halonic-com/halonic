import { existsSync, readFileSync } from "node:fs";
import { refusedReleaseReason } from "../lib/release-version.ts";

/**
 * Used by the release workflow's first step, before anything is installed:
 * fails with a GitHub error when the tag (TAG), the branch or tag the run
 * started from (REF_NAME) or apps/studio/package.json names Halonic 1.0.0.
 * Run it from the repo root.
 */
const { TAG = "", REF_NAME = "" } = process.env;
const packageJson = "apps/studio/package.json";
const appVersion: unknown = existsSync(packageJson)
  ? (JSON.parse(readFileSync(packageJson, "utf8")) as { version?: unknown }).version
  : undefined;
const reason = refusedReleaseReason({
  tag: TAG,
  ref: REF_NAME,
  ...(typeof appVersion === "string" ? { appVersion } : {}),
});
if (reason !== undefined) {
  console.log(`::error::${reason}`);
  process.exit(1);
}
console.log(`Release version check passed for tag '${TAG}' from '${REF_NAME}'.`);
