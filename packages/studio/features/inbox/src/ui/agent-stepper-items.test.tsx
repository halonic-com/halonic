// @vitest-environment jsdom

import { stepperRequestFormat } from "@halonicjs/action-steppers";
import { inboxStepperFormat } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { acmeActionCatalog } from "../agent/acme-actions.test-helper.ts";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

afterEach(unmountAll);

// Local times, so the test reads the same in every time zone. Tue 24 Nov 2026.
const asked = new Date(2026, 10, 24, 10, 0);
const anHourLater = new Date(2026, 10, 24, 11, 0);

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const approve = {
  kind: "use",
  ref: "github.approve-deployment@1",
  parameters: { owner: "acme", repo: "app", environment: "release" },
};

/** A fake with "Paperclip · Acme" and Chief's card pinning a stored request of `blocks`. */
function acme(blocks: readonly unknown[]) {
  const messaging = new FakeAgentMessaging({ now: () => asked });
  const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  const document = JSON.stringify({
    format: stepperRequestFormat,
    title: "Release acme/app",
    reason: "The release is ready.",
    blocks,
  });
  const item = messaging.addInboxItem(source.id, {
    question: "The release of acme/app is ready.",
    from: { kind: "agent", agent: chief.id, name: "Chief" },
    options: [],
    kind: "action",
    stepper: {
      format: inboxStepperFormat,
      document,
      revision: "rev-1",
      touches: [],
      changed: false,
    },
  });
  return { messaging, item };
}

/** The Inbox with only the agents' items, opened on the first row. */
async function openFirst(messaging: FakeAgentMessaging) {
  const root = render(
    <InboxView
      inbox={new Inbox(fakeRuns([]).runs)}
      now={() => anHourLater}
      agentMessaging={messaging}
      actionCatalog={acmeActionCatalog}
    />,
  );
  await settled();
  const cell = root.querySelector<HTMLElement>('[role="grid"] tr [role="gridcell"]');
  if (cell === null) throw new Error("no row");
  await act(async () => cell.click());
  await settled();
  return root;
}

const buttonNames = (root: HTMLElement) =>
  [...root.querySelectorAll("section button")].map((button) => button.textContent);

verifies("action-steppers.stepper-items", () => {
  it("opens a stored request of one `use` block as its stepper, under the default policy", async () => {
    const root = await openFirst(acme([approve]).messaging);

    const titles = [...root.querySelectorAll("section h2")].map((h) => h.textContent);
    expect(titles).toContain("Approve a deployment");
    // An admin request, and the default policy lets agents ask only for routine ones.
    expect(root.textContent).toContain("Blocked by your settings");
    expect(buttonNames(root)).toContain("Decline");
  });

  it("says why it can't open a stored request of two blocks, offers only Decline, and declines", async () => {
    const { messaging, item } = acme([approve, approve]);
    const root = await openFirst(messaging);

    expect(root.textContent).toContain("Halonic can't run this card's stepper:");
    expect(root.textContent).toContain(
      "this version of Halonic opens only a request for one whole stepper",
    );
    expect(buttonNames(root)).toEqual(["Decline"]);
    const decline = [...root.querySelectorAll("button")].find((b) => b.textContent === "Decline");
    await act(async () => decline?.click());
    await settled();
    const [answered] = await messaging.listInboxItems();
    expect(answered?.id).toBe(item.id);
    expect(answered?.state).toMatchObject({
      kind: "answered",
      answer: { kind: "action-result", outcome: "declined", steps: [] },
    });
  });
});
