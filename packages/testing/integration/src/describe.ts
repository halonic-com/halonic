import { describe, expect, it } from "vitest";
import {
  checkAbort,
  checkCase,
  checkConnectIsQuiet,
  checkDeclaration,
  checkHostWait,
  checkPolicy,
  checkProviderErrors,
  checkSources,
} from "./checks.ts";
import type { ConformanceSubject } from "./run.ts";

/**
 * Registers the conformance suite for one integration with Vitest. Every
 * integration package calls it once from a test file.
 *
 * @example
 * describeIntegrationConformance({
 *   integration: weather,
 *   policy: { name: "weather", hosts: ["api.example.com"], secrets: { "weather-key": { hosts: ["api.example.com"], placement: { as: "header", header: "x-api-key" } } }, tokens: [] },
 *   declaredTools: [{ name: "forecast", risk: "read", untrusted: true }],
 *   recordings: [forecastGhent],
 *   cases: [{ tool: "forecast", scenario: "forecast-ghent", args: { city: "Ghent" } }],
 *   sources: { "src/index.ts": readFileSync("src/index.ts", "utf8") },
 * });
 */
export function describeIntegrationConformance(subject: ConformanceSubject): void {
  describe(`integration conformance: ${subject.integration.name}`, () => {
    it("is what its sheet declares: name, version, tools and their risk", () =>
      passes(() => checkDeclaration(subject)));
    it("declares exact https hosts and ties every secret to them", () =>
      passes(() => checkPolicy(subject)));
    it("sends nothing when it connects, and closes twice safely", () =>
      passes(() => checkConnectIsQuiet(subject)));
    it("waits through a host that caps the pause and stops on abort", () =>
      passes(() => checkHostWait(subject)));
    if (subject.sources !== undefined) {
      it("uses nothing that reaches past its host", () => passes(() => checkSources(subject)));
    }
    for (const [index, toolCase] of subject.cases.entries()) {
      const name = `${toolCase.tool} (case ${index + 1})`;
      it(`${name} answers from its recording without leaking a secret`, () =>
        passes(() => checkCase(subject, toolCase)));
      it(`${name} stops when its signal is aborted`, () =>
        passes(() => checkAbort(subject, toolCase)));
      it(`${name} doesn't pass a provider's error body through`, () =>
        passes(() => checkProviderErrors(subject, toolCase)));
    }
  });
}

/**
 * Runs one check as an assertion, so the test counts it (a test without an
 * assertion fails) and a failed check still shows its own message.
 */
export async function passes(check: () => unknown): Promise<void> {
  await expect(
    (async () => {
      await check();
    })(),
  ).resolves.toBeUndefined();
}
