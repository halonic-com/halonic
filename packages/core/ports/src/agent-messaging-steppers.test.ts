import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { InboxItem } from "./agent-messaging.ts";
import { answerFitsItem, checkActionResultAnswer } from "./agent-messaging-actions.ts";
import { checkInboxStepperRequest, type InboxStepperRequest } from "./agent-messaging-steppers.ts";

/** A request to set one variable on an invented `acme` repository. */
const request: InboxStepperRequest = {
  format: "halonic.stepper-request/1",
  document: JSON.stringify({
    format: "halonic.stepper-request/1",
    title: "Set the deploy region",
    reason: "The release job needs it.",
    blocks: [{ kind: "step", ref: "github.set-variable@1", parameters: { name: "REGION" } }],
  }),
  revision: "7e719a98-b9ad-49c1-9fc5-32d8618697df",
  touches: [
    {
      block: 1,
      risk: "routine",
      targets: [{ service: "github", kind: "repository", name: "acme/app" }],
    },
  ],
  changed: false,
};

const stepperItem: InboxItem = {
  id: "item-1",
  source: "source-1",
  from: { kind: "agent", agent: "agent-1", name: "Release bot" },
  question: "The release job needs the deploy region.",
  options: [],
  stepper: request,
  attachments: [],
  createdAt: "2026-11-24T13:00:00.000Z",
  state: { kind: "open" },
};

const problemsOf = (value: unknown): readonly string[] => {
  const result = checkInboxStepperRequest(value);
  return result.ok ? [] : result.problems;
};

verifies("ports.agent-messaging-steppers", () => {
  it("takes a request whose fields are all on the list", () => {
    expect(checkInboxStepperRequest(request)).toEqual({ ok: true, request });
    expect(problemsOf({ ...request, touches: [], changed: true })).toEqual([]);
  });

  it("refuses a field not on the list at the top, in a touch or in a target, without its value", () => {
    const [touch] = request.touches;
    const atTop = problemsOf({ ...request, script: "curl acme.example" });
    const inTouch = problemsOf({ ...request, touches: [{ ...touch, address: "acme.example" }] });
    const inTarget = problemsOf({
      ...request,
      touches: [
        { ...touch, targets: [{ service: "github", kind: "repo", name: "a", token: "x" }] },
      ],
    });

    expect(atTop).toEqual(["script: not allowed"]);
    expect(inTouch).toEqual(["touches.0.address: not allowed"]);
    expect(inTarget).toEqual(["touches.0.targets.0: a field not allowed"]);
    expect([...atTop, ...inTouch].join(" ")).not.toContain("acme.example");
  });

  it("refuses a document over 16 KB in UTF-8, another format, or no document", () => {
    // 6,000 three-byte characters are 18,000 bytes, though only 6,000 characters long.
    expect(problemsOf({ ...request, document: "€".repeat(6000) })).toEqual([
      "document: over 16 KB",
    ]);
    expect(problemsOf({ ...request, document: "x".repeat(16 * 1024) })).toEqual([]);
    expect(problemsOf({ ...request, format: "halonic.stepper-request/2" })).toEqual([
      "format: not allowed",
    ]);
    expect(problemsOf({ ...request, document: "" })).toEqual(["document: not a text"]);
  });

  it("refuses too many touches, a block numbered 0, an unknown risk and text that isn't plain", () => {
    const [touch] = request.touches;
    const many = Array.from({ length: 21 }, (_, index) => ({ ...touch, block: (index % 20) + 1 }));

    expect(problemsOf({ ...request, touches: many })).toEqual(["touches: more than 20"]);
    expect(problemsOf({ ...request, touches: [{ ...touch, block: 0, risk: "low" }] })).toEqual([
      "touches.0.block: not a block number",
      "touches.0.risk: not allowed",
    ]);
    expect(
      problemsOf({
        ...request,
        revision: "a\nb",
        touches: [{ ...touch, targets: [{ service: "github", kind: "repository", name: "" }] }],
      }),
    ).toEqual(["revision: not a text", "touches.0.targets.0: not plain text"]);
    expect(problemsOf({ ...request, changed: "no", touches: "all" })).toEqual([
      "changed: not true or false",
      "touches: not a list",
    ]);
    expect(problemsOf([request])).toEqual(["a stepper request is a JSON object"]);
  });

  it("fits a stepper item only with an action-result that passes its check", () => {
    const declined = { kind: "action-result", outcome: "declined", steps: [] } as const;

    expect(answerFitsItem(stepperItem, declined)).toBe(true);
    expect(answerFitsItem(stepperItem, { kind: "reply", text: "Done" })).toBe(false);
    expect(answerFitsItem(stepperItem, { kind: "option", option: "accept" })).toBe(false);
  });

  it("takes a succeeded step done by hand and refuses the mark on any other", () => {
    const byHand = { step: 1, outcome: "succeeded", byHand: true };
    const failedByHand = { step: 1, outcome: "failed", failure: "refused", byHand: true };

    expect(
      checkActionResultAnswer({ kind: "action-result", outcome: "succeeded", steps: [byHand] }).ok,
    ).toBe(true);
    expect(
      checkActionResultAnswer({ kind: "action-result", outcome: "failed", steps: [failedByHand] }),
    ).toEqual({ ok: false, problems: ["steps.0.byHand: only for succeeded"] });
    expect(
      checkActionResultAnswer({
        kind: "action-result",
        outcome: "succeeded",
        steps: [{ ...byHand, byHand: "yes" }],
      }),
    ).toEqual({ ok: false, problems: ["steps.0.byHand: not true"] });
  });
});
