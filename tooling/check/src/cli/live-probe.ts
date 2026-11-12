import { cloudflareGet, type ProbeResult, probeAccount } from "../lib/live-probe.ts";

/**
 * The account probe (ADR 5.9, HAL-6804): checks that the CI token reaches the
 * live test account before the live suites run. The live-cloud workflow runs
 * it with the `cloudflare-live` environment's secrets.
 *
 *   CLOUDFLARE_LIVE_API_TOKEN=… CLOUDFLARE_LIVE_ACCOUNT_ID=… node tooling/check/src/cli/live-probe.ts
 *
 * Fails when a check fails; a skipped check (a token kind CI doesn't have, or
 * a check that needs a bare free account) only gets a notice.
 */

/** The lines to print for the probe's results, and whether it fails. */
export function probeSummary(results: readonly ProbeResult[]): {
  lines: string[];
  failed: boolean;
} {
  const lines = results.map(
    ({ check, outcome, detail }) => `live-probe: ${outcome} ${check}: ${detail}`,
  );
  return { lines, failed: results.some(({ outcome }) => outcome === "fail") };
}

if (import.meta.main) {
  const token = process.env["CLOUDFLARE_LIVE_API_TOKEN"] ?? "";
  const accountId = process.env["CLOUDFLARE_LIVE_ACCOUNT_ID"] ?? "";
  if (token === "" || accountId === "") {
    console.error(
      "live-probe: set CLOUDFLARE_LIVE_API_TOKEN and CLOUDFLARE_LIVE_ACCOUNT_ID (the cloudflare-live environment's secrets).",
    );
    process.exitCode = 2;
  } else {
    const summary = probeSummary(await probeAccount(cloudflareGet(token), accountId, token));
    for (const line of summary.lines) {
      (line.startsWith("live-probe: fail") ? console.error : console.log)(line);
    }
    if (summary.failed) {
      process.exitCode = 1;
    }
  }
}
