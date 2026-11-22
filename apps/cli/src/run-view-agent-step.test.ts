import type { WorkflowDefinition } from "@halonicjs/app";
import { type RunEvent, type RunEventBody, summarize } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { plainText } from "./messages/phrase.ts";
import {
  type AgentDefinition,
  type RunDefinitions,
  stepColumns,
  stepDoing,
  stepLines,
} from "./run-view.ts";

/** Acme's step Draft a reply, which calls Writer's agent step `method`. */
function definitionsCalling(method: string): RunDefinitions {
  const workflow = {
    version: 1,
    id: "support-reply",
    name: "Support reply",
    initial: "draft",
    context: {},
    layout: {},
    states: {
      draft: { type: "task", agent: "writer", method, description: "Draft a reply" },
      done: { type: "final" },
    },
  } as unknown as WorkflowDefinition;
  const writer = {
    id: "writer",
    name: "Writer",
    model: "smart",
    methods: { short: { model: "tiny" }, long: {} },
  } as unknown as AgentDefinition;
  return { workflow, agent: (id) => (id === "writer" ? writer : undefined) };
}

/** A run that entered Draft a reply at 14:00:00, ran Writer and finished a second later, as the engine logs it. */
function finishedRun(): RunEvent[] {
  const bodies: RunEventBody[] = [
    {
      type: "run.started",
      hubId: "acme",
      workflowId: "support-reply",
      input: {},
      kind: "run",
      definitionsVersion: "v1",
    },
    { type: "state.entered", state: "draft" },
    { type: "agent.started", state: "draft", agent: "writer", prompt: "" },
    { type: "state.entered", state: "done" },
    { type: "run.completed", state: "done", context: {} },
  ];
  const times = ["14:00:00", "14:00:00", "14:00:00", "14:00:01", "14:00:01"];
  return bodies.map((body, index) => ({
    ...body,
    runId: "run_mfx3k2a1_a101jd8q",
    seq: index + 1,
    at: `2026-11-10T${times[index]}.000Z`,
  }));
}

/** The step lines of the finished run, with the columns' padding made one space. */
function linesFor(definitions: RunDefinitions): string[] {
  const events = finishedRun();
  const summary = summarize(events);
  if (summary === null) throw new Error("The run log has no run.started.");
  const clock = { now: new Date("2026-11-10T15:00:00Z"), timeZone: "UTC" };
  return stepLines(events, summary, definitions, clock).map((line) =>
    plainText(line).replace(/ {2,}/g, " "),
  );
}

verifies("cli.run-view-agent-step-model", () => {
  it("names the model alias of the agent step the step calls, as the engine uses it (C605)", () => {
    const definitions = definitionsCalling("short");

    expect(linesFor(definitions)).toEqual(["✓ Draft a reply Writer · tiny 1 s"]);
    const live = stepDoing("draft", definitions, stepColumns(definitions));
    expect(plainText(live).replace(/ {2,}/g, " ")).toBe("Draft a reply Writer · tiny");
  });

  it("keeps the agent's alias for an agent step without its own model", () => {
    expect(linesFor(definitionsCalling("long"))).toEqual(["✓ Draft a reply Writer · smart 1 s"]);
  });
});
