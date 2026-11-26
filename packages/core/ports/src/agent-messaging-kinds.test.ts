import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type InboxItem, type InboxStepperRequest, inboxItemFits, inboxItemKind } from "./index.ts";

const asking: InboxItem = {
  id: "acme:item:9",
  source: "acme",
  from: { kind: "agent", agent: "acme:ada", name: "Ada" },
  question: "Ship the release today?",
  options: [
    { id: "yes", label: "Yes" },
    { id: "no", label: "No" },
  ],
  attachments: [],
  createdAt: "2026-11-26T10:00:00Z",
  state: { kind: "open" },
};

/** A request to set one variable on an invented `acme` repository. */
const stepper: InboxStepperRequest = {
  format: "halonic.stepper-request/1",
  document: JSON.stringify({
    format: "halonic.stepper-request/1",
    title: "Set the deploy region",
    reason: "The release job needs it.",
    blocks: [{ kind: "step", ref: "github.set-variable@1", parameters: { name: "REGION" } }],
  }),
  revision: "7e719a98-b9ad-49c1-9fc5-32d8618697df",
  touches: [],
  changed: false,
};

const stepperItem: InboxItem = { ...asking, options: [], stepper };
const elsewhere: InboxItem = {
  ...asking,
  options: [],
  answerElsewhere: { link: "https://acme.example/ACME/issues/ACME-9" },
};

verifies("ports.agent-messaging-item-kind", () => {
  it("gives the kind the source set, whatever the item's fields", () => {
    expect(inboxItemKind({ ...asking, kind: "approval" })).toBe("approval");
    expect(inboxItemKind({ ...elsewhere, kind: "task" })).toBe("task");
    expect(inboxItemKind({ ...asking, kind: "comment" })).toBe("comment");
  });

  it("works the kind out for an item without one", () => {
    expect(inboxItemKind(stepperItem)).toBe("action");
    expect(inboxItemKind(elsewhere)).toBe("elsewhere");
    expect(inboxItemKind(asking)).toBe("question");
  });

  it("holds an item together only when kind action and an action item go together", () => {
    expect(inboxItemFits({ ...stepperItem, kind: "action" })).toBe(true);
    expect(inboxItemFits({ ...asking, kind: "approval" })).toBe(true);
    expect(inboxItemFits({ ...elsewhere, kind: "elsewhere" })).toBe(true);
    expect(inboxItemFits({ ...asking, kind: "action" })).toBe(false);
    expect(inboxItemFits({ ...stepperItem, kind: "question" })).toBe(false);
  });
});
