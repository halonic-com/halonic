import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { fakeGitHub } from "../pr-watcher/fakes.test-helper.ts";
import {
  builtOnGreen,
  builtOnRun,
  greenRequired,
  guardGreen,
  requiredAnswers,
} from "./required-workflows.test-helper.ts";
import { requiredWorkflowsOf } from "./required-workflows.ts";

const repo = "halonic-com/halonic";
const head = "6247aaaabbbbccccddddeeeeffff000011112222";
const noteJob = "Decision note and the guard's own paths";

async function problems(recorded: Parameters<typeof requiredAnswers>[3]) {
  const github = fakeGitHub(requiredAnswers(repo, 6247, head, recorded));
  const found = await requiredWorkflowsOf(github.get, repo, 6247, head);
  expect(github.calls.every((call) => call.method === "GET")).toBe(true);
  return found;
}

verifies("paperclip.pr-tools-required-workflows", () => {
  test("lists nothing when Guard notes and Built-on label passed on the head", async () => {
    expect(await problems(greenRequired)).toEqual([]);
  });

  test("names a failed Guard notes with its job, as the gate says it (#6247)", async () => {
    const failed = {
      ...greenRequired,
      checkRuns: [{ name: noteJob, conclusion: "failure", suite: 1 }, builtOnGreen],
    };
    expect(await problems(failed)).toEqual([`Guard notes failure (${noteJob})`]);
  });

  test("counts only the newest Built-on label run: a pass after the label was added clears it (#5953)", async () => {
    const fixed = {
      checkRuns: [
        guardGreen,
        { name: "built-on-label", conclusion: "failure", suite: 2 },
        { name: "built-on-label", conclusion: "success", suite: 3 },
      ],
      workflowRuns: [
        ...greenRequired.workflowRuns,
        { name: "Built-on label", suite: 3, createdAt: "2026-11-21T20:05:00Z" },
      ],
    };
    expect(await problems(fixed)).toEqual([]);
    const stillRed = { ...fixed, checkRuns: fixed.checkRuns.slice(0, 2) };
    expect(await problems(stillRed)).toEqual(["Built-on label failure (built-on-label)"]);
  });

  test("says neither has run when the base changed after their runs (#6183)", async () => {
    const retargeted = { ...greenRequired, baseChangedAt: ["2026-11-21T20:25:00Z"] };
    expect(await problems(retargeted)).toEqual([
      "Guard notes has not run",
      "Built-on label has not run",
    ]);
  });

  test("asks cloud only for Built-on label: it has no Guard notes (HAL-19392, cloud#185)", async () => {
    const cloud = "halonic-com/cloud";
    const onlyBuiltOn = { checkRuns: [builtOnGreen], workflowRuns: [builtOnRun] };
    const github = fakeGitHub(requiredAnswers(cloud, 185, head, onlyBuiltOn));
    expect(await requiredWorkflowsOf(github.get, cloud, 185, head)).toEqual([]);
    expect(await problems(onlyBuiltOn)).toEqual(["Guard notes has not run"]);
  });

  test("knows the organisation's Guard notes by its job when its workflow run isn't listed", async () => {
    const unlisted = {
      checkRuns: [{ name: noteJob, conclusion: "failure", suite: 9 }, builtOnGreen],
      workflowRuns: [builtOnRun],
    };
    expect(await problems(unlisted)).toEqual([`Guard notes failure (${noteJob})`]);
  });
});
