import type { ModelProblem, ProviderReport, TestOutcome } from "@halonicjs/app";
import { lastTestOf, type ModelKey, type ModelsFact, type ModelTest } from "../check-facts.ts";
import { addressInReport, providerInReport, timeInReport } from "./report-names.ts";

/** What a failed test found, as the report says it after the provider's name. */
const failedTests: Readonly<Record<Exclude<TestOutcome, "ok">, string>> = {
  "key-refused": "key refused",
  "no-credit": "key accepted, account has no credit",
  offline: "can't reach it",
  "provider-error": "answered with an error",
  "local-not-answering": "didn't answer the test",
  "local-not-usable": "answered, but the model can't be used",
};

/** The fix under a failed test, for the outcomes that have one. */
function testFix(outcome: TestOutcome, provider: string): string | undefined {
  const site = provider === "another provider" ? "the provider's site" : `${provider}'s site`;
  switch (outcome) {
    case "no-credit":
      return `Fix: add credit on ${site}, then test again.`;
    case "key-refused":
      return "Fix: add a working key on the Models page, then test again.";
    case "offline":
      return "Fix: check this computer's internet connection, then test again.";
    default:
      return undefined;
  }
}

/** "last test answered, 10:42" for a server, "last test accepted, 10:42" for a key. */
function passedTest(test: ModelTest, local: boolean): string {
  return `last test ${local ? "answered" : "accepted"}, ${timeInReport(test.at)}`;
}

/** The rows of a server on this computer that answered: how many models, and the last test. */
function readyRows(ready: ProviderReport, tests: readonly ModelTest[]): string[] {
  const name = providerInReport(ready.name);
  if (!("answering" in ready)) return [`${name}: key set`];
  const count = ready.models.length;
  const first = `${name} answering at ${addressInReport(ready.address)} · ${count} model${count === 1 ? "" : "s"} loaded`;
  const test = lastTestOf(tests, ready.name);
  if (test === undefined) return [`${first} · not tested yet`];
  if (test.outcome === "ok") return [`${first} · ${passedTest(test, true)}`];
  return [`${first} · ${failedTests[test.outcome]}, ${timeInReport(test.at)}`];
}

/** The rows of a problem the host found with a model server or an alias. */
function problemRows(problem: ModelProblem): string[] {
  if (problem.problem === "no-alias") return ["a model alias isn't defined"];
  const name = providerInReport(problem.name);
  if (problem.problem === "no-key") return [`${name}: no key`];
  if (problem.problem === "key-unreadable") return [`${name}: key can't be read`];
  const address = addressInReport(problem.address);
  const fix =
    name !== "another provider" && address !== "an address on your network"
      ? `Fix: start ${name} on this computer, then check again.`
      : "Fix: start it, then check again.";
  return [`${name} isn't answering at ${address}`, fix];
}

/** The rows of a cloud provider's key: stored or not, and its last test with the fix. */
function keyRows(key: ModelKey, tests: readonly ModelTest[]): string[] {
  const name = providerInReport(key.provider);
  if (key.keyStored === "unreadable") return [`${name}: key can't be read`];
  if (!key.keyStored) return [`${name}: no key`, "Fix: add its key on the Models page."];
  const test = lastTestOf(tests, key.provider);
  if (test === undefined) return [`${name}: key set · not tested yet`];
  if (test.outcome === "ok") return [`${name}: key set · ${passedTest(test, false)}`];
  const fix = testFix(test.outcome, name);
  return [
    `${name}: ${failedTests[test.outcome]}, ${timeInReport(test.at)}`,
    ...(fix === undefined ? [] : [fix]),
  ];
}

/**
 * The Models line's facts in the report: each server on this computer, each problem the host
 * found, each cloud provider's key with its last test, and Sample answers. Providers are named
 * only when Halonic knows the product, addresses only on this computer, and models only counted.
 *
 * @example
 * modelsReport({ check: "models", servers: undefined, sampleAnswers: false,
 *   keys: [{ provider: "Anthropic", keyStored: true }], tests: [] });
 * // ["Anthropic: key set · not tested yet"]
 */
export function modelsReport(fact: ModelsFact): string[] {
  const { servers, keys, sampleAnswers, tests } = fact;
  const rows: string[] = [];
  if (servers !== undefined && "timedOut" in servers) {
    rows.push("model servers didn't answer in 5 seconds");
  } else if (servers !== undefined) {
    rows.push(...servers.ready.flatMap((ready) => readyRows(ready, tests)));
    rows.push(...servers.problems.flatMap(problemRows));
  }
  rows.push(...keys.flatMap((key) => keyRows(key, tests)));
  if (sampleAnswers) rows.push("built-in test model · no key or network needed");
  return rows;
}
