import type { RunEvent } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { startInput, waitParts } from "./wait-parts.ts";

const note = "Approving finishes the run. Nothing is sent.";
const description = `Approve this reply?\n{{context.reply}}\n\n${note}`;

verifies("inbox.wait-context", () => {
  it("splits the step's closing words off the filled-in draft", () => {
    expect(waitParts(`Sorry, Sam.\n\nAcme support\n\n${note}`, description)).toEqual({
      draft: "Sorry, Sam.\n\nAcme support",
      note,
    });
  });

  it("keeps the body whole without a description, a fixed tail or a matching end", () => {
    const body = `Sorry, Sam.\n\n${note}`;
    expect(waitParts(body, undefined)).toEqual({ draft: body, note: null });
    expect(waitParts(body, "Approve this reply?\n{{context.reply}}")).toEqual({
      draft: body,
      note: null,
    });
    expect(waitParts(body, `Approve this reply?\n${note}`)).toEqual({ draft: body, note: null });
    expect(waitParts("Sorry, Sam.", description)).toEqual({ draft: "Sorry, Sam.", note: null });
  });

  it("reads the start field's text, and nothing for a missing or empty one", () => {
    const started: RunEvent = {
      type: "run.started",
      hubId: "acme",
      workflowId: "support-reply",
      input: { mail: "Hi, can I get a refund?", empty: " ", count: 3 },
      kind: "run",
      definitionsVersion: "v1",
      runId: "r1",
      seq: 1,
      at: "2026-11-10T10:00:00.000Z",
    };
    expect(startInput([started], "mail")).toBe("Hi, can I get a refund?");
    expect(startInput([started], "empty")).toBeUndefined();
    expect(startInput([started], "count")).toBeUndefined();
    expect(startInput([], "mail")).toBeUndefined();
  });
});
