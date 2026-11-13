import { type RunEventBody, summarize } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { RunWorkflow } from "../api.ts";
import { mondayMorning } from "../summary.test-helper.ts";
import { everyStep } from "./every-step-model.ts";
import { entered, logOf } from "./run-log.test-helper.ts";

const workflow: RunWorkflow = { name: "Support reply", stepDescription: () => undefined };

type Timed = readonly [number, RunEventBody];

function stepsOf(timed: readonly Timed[]) {
  const events = logOf("run_a_01jd8q", timed);
  const summary = summarize(events);
  if (summary === null) throw new Error("The test log has no run.started.");
  return everyStep(events, summary, workflow, mondayMorning);
}

const begin: RunEventBody = { type: "agent.started", state: "fan", agent: "writer", prompt: "Go" };
const ended = (error?: string): RunEventBody => ({
  type: "agent.finished",
  state: "fan",
  agent: "writer",
  output: null,
  ...(error === undefined ? {} : { error }),
});
const finish: Timed = [1, { type: "run.completed", state: "end", context: {} }];

/** The body as an event of one branch or one for-each item, `minutes` after 10:40. */
const of = (minutes: number, body: RunEventBody, where: { branch: string } | { item: number }) =>
  [minutes, { ...body, ...where } as RunEventBody] as const;

verifies("runs.run-view.step-groups", () => {
  it("lists a finished step's branches by name, in the order they started", () => {
    const steps = stepsOf([
      [0, entered("fan")],
      of(0, begin, { branch: "summarise" }),
      of(0, begin, { branch: "translate" }),
      of(1, ended(), { branch: "summarise" }),
      of(1, ended("Model refused"), { branch: "translate" }),
      [1, entered("end")],
      finish,
    ]);
    expect(steps[0]?.groups.map((g) => [g.name, g.mark, g.line])).toEqual([
      ["summarise", "done", "Took 1 min"],
      ["translate", "failed", "Failed after 1 min"],
    ]);
    expect(steps[0]?.groups[1]?.label).toBe(
      "Branch translate, in the step Fan, failed, 10:40, Failed after 1 min",
    );
  });

  it("names for-each items by place, with the total once the step has finished", () => {
    const items = [
      [0, entered("fan")],
      of(0, begin, { item: 0 }),
      of(0, begin, { item: 1 }),
      of(1, ended(), { item: 0 }),
    ] as const;
    const going = stepsOf(items);
    expect(going[0]?.groups.map((g) => [g.name, g.mark])).toEqual([
      ["Item 1", "done"],
      ["Item 2", "running"],
    ]);
    const finished = stepsOf([...items, of(1, ended(), { item: 1 }), [1, entered("end")], finish]);
    expect(finished[0]?.groups.map((g) => g.name)).toEqual(["Item 1 of 2", "Item 2 of 2"]);
    expect(finished[0]?.groups[0]?.label).toMatch(/^Item 1 of 2, in the step Fan, /);
  });

  it("says a part with no end didn't finish once its step failed", () => {
    const steps = stepsOf([
      [0, entered("fan")],
      of(0, begin, { branch: "a" }),
      [1, { type: "run.failed", state: "fan", error: "Boom" }],
    ]);
    expect(steps[0]?.groups.map((g) => [g.mark, g.line])).toEqual([["stopped", "Didn't finish"]]);
  });

  it("doesn't end a branch or item when only its subagent finished", () => {
    const sub = (where: { branch: string } | { item: number }) =>
      of(1, { ...ended(), parent: "writer" } as RunEventBody, where);
    const steps = stepsOf([
      [0, entered("fan")],
      of(0, begin, { branch: "a" }),
      of(0, begin, { item: 0 }),
      sub({ branch: "a" }),
      sub({ item: 0 }),
      [1, { type: "run.failed", state: "fan", error: "Boom" }],
    ]);
    expect(steps[0]?.groups.map((g) => g.mark)).toEqual(["stopped", "stopped"]);
  });

  it("has no groups for a step that ran none", () => {
    expect(stepsOf([[0, entered("read")]])[0]?.groups).toEqual([]);
  });
});
