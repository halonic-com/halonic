import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { describe, expect, it } from "vitest";
import { consoleStepProblems, numberedLines } from "./guided-checks.ts";

function withSteps(
  steps: StepperDefinition["steps"],
): StepperDefinition<Record<string, string | number>> {
  return {
    id: "google.acme-step",
    version: 1,
    service: "google",
    title: "Acme",
    summary: "Acme.",
    risk: "routine",
    parameters: strictParameters({}),
    steps,
    targets: () => [],
    preview: () => [],
  };
}

describe("consoleStepProblems", () => {
  it("names a wrong host, an unchecked date, a secret result and a step that isn't guided", () => {
    const problems = consoleStepProblems(
      withSteps([
        {
          kind: "guided",
          address: "https://example.com/x",
          instructions: [],
          checkedOn: "2026-11-25",
          result: { label: "the client secret", pattern: "^[a-z]{3}$" },
        },
        { kind: "input", name: "key", label: "a key", secret: true },
      ]),
      "play.google.com",
    );
    expect(problems).toEqual([
      "address https://example.com/x",
      "checkedOn 2026-11-25",
      "result label the client secret",
      "a input step: only guided steps belong here",
    ]);
  });

  it("flags a result that carries a secret marker", () => {
    const result = { label: "a value", pattern: "^[a-z]{3}$", secret: true };
    const problems = consoleStepProblems(
      withSteps([
        {
          kind: "guided",
          address: "https://play.google.com/x",
          instructions: [],
          checkedOn: "from docs",
          result,
        },
      ]),
      "play.google.com",
    );
    expect(problems).toEqual(["a secret result"]);
  });
});

describe("numberedLines", () => {
  it("keeps only the numbered lines", () => {
    expect(numberedLines("title\n\n1. Open x\n2. Do y\nnote")).toEqual(["1. Open x", "2. Do y"]);
  });
});
