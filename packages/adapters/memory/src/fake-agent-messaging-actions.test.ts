// The fake lives in @halonicjs/testing-contracts, whose code is measured in
// this package's run (its "measuredIn"), so its tests run here.
import type { ActionResultAnswer, InboxActionRequest } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";

/** A request to approve a run, with invented `acme` data. */
const action: InboxActionRequest = {
  definition: "github.approve-run",
  version: 1,
  parameters: { owner: "acme", repo: "app", runId: 123456 },
  expires: "2026-11-25T13:00:00.000Z",
};

const result: ActionResultAnswer = {
  kind: "action-result",
  outcome: "succeeded",
  steps: [{ step: 1, outcome: "succeeded", status: 201, kept: { state: "approved" } }],
};

function makeFake() {
  const messaging = new FakeAgentMessaging();
  const acme = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
  return { messaging, acme };
}

verifies("contracts.fake-agent-messaging-actions", () => {
  it("answers an action item once with action-result, and reports already-answered after", async () => {
    const { messaging, acme } = makeFake();
    const item = messaging.addInboxItem(acme.id, { question: "The run waits.", action });

    const first = await messaging.answer(item.id, result);
    const second = await messaging.answer(item.id, { ...result, outcome: "declined", steps: [] });
    const [listed] = await messaging.listInboxItems();

    expect(item.options).toEqual([]);
    expect(first.outcome).toBe("answered");
    expect(second).toMatchObject({ outcome: "already-answered", by: { kind: "me" } });
    expect(listed?.action).toEqual(action);
    expect(listed?.state).toMatchObject({ kind: "answered", answer: result });
  });

  it("refuses a reply, or an action-result naming an account, to an action item and keeps it open", async () => {
    const { messaging, acme } = makeFake();
    const item = messaging.addInboxItem(acme.id, { question: "The run waits.", action });
    const withAccount = { ...result, account: "acme-admin" } as ActionResultAnswer;

    const reply = await messaging.answer(item.id, { kind: "reply", text: "Done" });
    const leaky = await messaging.answer(item.id, withAccount);
    const [listed] = await messaging.listInboxItems();

    expect(reply).toEqual({ outcome: "refused", reason: "bad-answer" });
    expect(leaky).toEqual({ outcome: "refused", reason: "bad-answer" });
    expect(listed?.state).toEqual({ kind: "open" });
  });

  it("refuses an action-result to a question", async () => {
    const { messaging, acme } = makeFake();
    const item = messaging.addInboxItem(acme.id, { question: "Ship it?" });

    expect(item.options).toHaveLength(2);
    expect(await messaging.answer(item.id, result)).toEqual({
      outcome: "refused",
      reason: "bad-answer",
    });
  });
});
