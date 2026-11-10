import { basename } from "node:path";
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
import {
  checkPluginManifest,
  type PluginConformanceSubject,
  pluginBackendSubject,
} from "./plugin.ts";
import type { ConformanceSubject, ToolCase } from "./run.ts";

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
    integrationChecks(() => subject, subject.cases, subject.sources !== undefined);
  });
}

/**
 * Registers the conformance suite for one plugin folder with Vitest: its
 * manifest, then every integration check on its backend, if it has one.
 * Every plugin calls it once from a test file.
 *
 * @example
 * describePluginConformance({
 *   folder: fileURLToPath(new URL("..", import.meta.url)),
 *   backend: weather, // what backend/index.js exports
 *   recordings: [forecastGhent],
 *   cases: [{ tool: "forecast", scenario: "forecast-ghent", args: { place: "Ghent" } }],
 * });
 */
export function describePluginConformance(subject: PluginConformanceSubject): void {
  describe(`plugin conformance: ${basename(subject.folder)}`, () => {
    it("has one valid manifest for this SDK, and its files and backend code match it", () =>
      passes(() => checkPluginManifest(subject)));
    if (subject.backend !== undefined) {
      describe("backend", () => {
        integrationChecks(() => pluginBackendSubject(subject), subject.cases ?? [], true);
      });
    }
  });
}

/**
 * The integration checks, for an integration or a plugin's backend. The
 * subject is read when each test runs, so a broken plugin folder fails its
 * tests instead of the whole file.
 */
function integrationChecks(
  subjectOf: () => ConformanceSubject,
  cases: readonly ToolCase[],
  withSources: boolean,
): void {
  it("is what its sheet declares: name, version, tools and their risk", () =>
    passes(() => checkDeclaration(subjectOf())));
  it("declares exact https hosts and ties every secret to them", () =>
    passes(() => checkPolicy(subjectOf())));
  it("sends nothing when it connects, and closes twice safely", () =>
    passes(() => checkConnectIsQuiet(subjectOf())));
  it("waits through a host that caps the pause and stops on abort", () =>
    passes(() => checkHostWait(subjectOf())));
  if (withSources) {
    it("uses nothing that reaches past its host", () => passes(() => checkSources(subjectOf())));
  }
  for (const [index, toolCase] of cases.entries()) {
    const name = `${toolCase.tool} (case ${index + 1})`;
    it(`${name} answers from its recording without leaking a secret`, () =>
      passes(() => checkCase(subjectOf(), toolCase)));
    it(`${name} stops when its signal is aborted`, () =>
      passes(() => checkAbort(subjectOf(), toolCase)));
    it(`${name} doesn't pass a provider's error body through`, () =>
      passes(() => checkProviderErrors(subjectOf(), toolCase)));
  }
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
