import type { ModelProblem, ProviderReport, TestOutcome } from "@halonicjs/app";
import { printable } from "@halonicjs/words";
import { lastTestOf, type ModelKey, type ModelsFact, type ModelTest } from "../check-facts.ts";
import { timeInReport } from "../report/report-names.ts";
import { fix, found, type LineSentence } from "./check-line.ts";

/**
 * What a failed test found: Sofia's screen-3 sentences (first-run-flow 3.3), so the dialog says
 * what the model screen said, about the key that is saved rather than one just pasted.
 */
function failedTest(outcome: Exclude<TestOutcome, "ok">, name: string): LineSentence[] {
  switch (outcome) {
    case "key-refused":
      return [
        found(`${name} didn't accept the saved key.`),
        fix("Fix: add the key again on the Models page, then test again."),
      ];
    case "no-credit":
      return [
        found(`${name} accepted the key, but the account has no credit or is over its limit.`),
        fix(`Fix: add credit on ${name}'s site, then test again.`),
      ];
    case "offline":
      return [found(`Studio can't reach ${name}. Check your connection.`)];
    case "provider-error":
      return [found(`${name} isn't answering right now. Try again in a minute.`)];
    case "local-not-answering":
      return [
        found(
          `The model on this computer didn't answer. Check that ${name} is running, then test again.`,
        ),
      ];
    case "local-not-usable":
      return [
        found(
          "This model answered, but not in a form the workflow can use. It may be too small. Try a larger one, or use Sample answers.",
        ),
      ];
  }
}

/** "last test answered, 10:42", "last test accepted, 10:42" or "not tested yet", after the facts. */
function testFact(test: ModelTest | undefined, local: boolean): string {
  if (test === undefined) return "not tested yet";
  return `last test ${local ? "answered" : "accepted"}, ${timeInReport(test.at)}`;
}

/**
 * A key Halonic couldn't read, such as from a locked keychain, in the Models page's own word for
 * where keys are kept ("system keychain"), with the step that fixes it.
 */
function keyUnreadable(name: string): LineSentence[] {
  return [
    found(`${name}: Halonic couldn't read its key from your system keychain.`),
    fix("Fix: check that your system keychain is unlocked, then check again."),
  ];
}

/** A server on this computer that answered (4.2): its address, its models, its last test. */
function serverSentences(ready: ProviderReport, tests: readonly ModelTest[]): LineSentence[] {
  const name = printable(ready.name);
  if (!("answering" in ready)) return [found(`${name}: key set`)];
  const test = lastTestOf(tests, ready.name);
  if (test !== undefined && test.outcome !== "ok") return failedTest(test.outcome, name);
  const models = ready.models.map((model) => printable(model.name)).join(", ");
  return [
    found(
      `${name} is answering at `,
      { code: printable(ready.address) },
      ...(models === "" ? [] : [` · ${models} loaded`]),
      ` · ${testFact(test, true)}`,
    ),
  ];
}

/** A problem with a model server or an alias, in the doctor's facts and the 4.2 table's words. */
function problemSentences(problem: ModelProblem): LineSentence[] {
  if (problem.problem === "no-alias") {
    return [
      found(
        "The model alias ",
        { code: printable(problem.alias) },
        " isn't in the workspace's files.",
      ),
    ];
  }
  const name = printable(problem.name);
  switch (problem.problem) {
    case "unreachable":
      return [
        found(`${name} isn't answering at `, { code: printable(problem.address) }, "."),
        fix(`Fix: start ${name} on this computer, then check again.`),
      ];
    case "no-key":
      return [found(`${name}: no key yet.`), fix("Fix: add its key on the Models page.")];
    case "key-unreadable":
      return keyUnreadable(name);
  }
}

/** A cloud provider's key (4.2): "Key set · last test accepted, 10:42", or what its last test found. */
function keySentences(key: ModelKey, tests: readonly ModelTest[]): LineSentence[] {
  const name = printable(key.provider);
  if (key.keyStored === "unreadable") {
    return keyUnreadable(name);
  }
  if (!key.keyStored) {
    return [found(`${name}: no key yet.`), fix("Fix: add its key on the Models page.")];
  }
  const test = lastTestOf(tests, key.provider);
  if (test !== undefined && test.outcome !== "ok") return failedTest(test.outcome, name);
  return [found(`${name}: key set · ${testFact(test, false)}`)];
}

/**
 * The Models line's sentences on screen (requirement `check-computer.lines`): each server on this
 * computer, each problem the host found, each cloud provider's key, and Sample answers. Unlike the
 * report, the screen names the providers and models: it stays on this computer.
 *
 * @example
 * modelsSentences({ check: "models", servers: undefined, sampleAnswers: true, keys: [], tests: [] });
 * // [{ kind: "found", parts: ["Built-in test model · no key or network needed"] }]
 */
export function modelsSentences(fact: ModelsFact): LineSentence[] {
  const { servers, keys, sampleAnswers, tests } = fact;
  const sentences: LineSentence[] = [];
  if (servers !== undefined && "timedOut" in servers) {
    sentences.push(found("The model servers didn't answer in 5 seconds."));
  } else if (servers !== undefined) {
    sentences.push(...servers.problems.flatMap(problemSentences));
    sentences.push(...servers.ready.flatMap((ready) => serverSentences(ready, tests)));
  }
  sentences.push(...keys.flatMap((key) => keySentences(key, tests)));
  if (sampleAnswers) sentences.push(found("Built-in test model · no key or network needed"));
  return sentences;
}
