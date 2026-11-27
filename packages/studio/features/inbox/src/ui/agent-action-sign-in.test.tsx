// @vitest-environment jsdom

import type { RequesterPolicy, StepperCatalog } from "@halonicjs/action-steppers";
import type { ServiceSignIn } from "@halonicjs/ports";
import { createActionSteps, FakeAgentConnections } from "@halonicjs/studio-services";
import {
  FakeActionRecords,
  FakeActionSender,
  FakeAgentMessaging,
  FakeServiceSignIn,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { acmeSignInCatalog, testAcmeSignIn } from "../agent/acme-actions.test-helper.ts";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

afterEach(unmountAll);

// Local times, so the test reads the same in every time zone. Tue 24 Nov 2026.
const asked = new Date(2026, 10, 24, 10, 0);
const later = new Date(2026, 10, 24, 13, 0);

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Opens the Inbox's one agent item, a test sign-in to `acme`, with `serviceSignIn` or none. */
async function openSignInItem(catalog: StepperCatalog, serviceSignIn?: ServiceSignIn) {
  const messaging = new FakeAgentMessaging({ now: () => asked });
  const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  messaging.addInboxItem(source.id, {
    question: "Please test the sign-in to acme.",
    from: { kind: "agent", agent: chief.id, name: "Chief" },
    action: testAcmeSignIn,
  });
  const policy: RequesterPolicy = { allowed: [{ source: { kind: "paperclip", id: source.id } }] };
  const sender = Object.assign(new FakeActionSender({ routes: [], signInAs: {} }), {
    cancelSignIn: () => Promise.resolve(),
  });
  const steps = createActionSteps({ sender, records: new FakeActionRecords(), now: () => later });
  // The `acme` connection file exists, with no key on this computer yet.
  const agentConnections = new FakeAgentConnections({
    connections: [
      {
        id: source.id,
        provider: "paperclip",
        label: "Paperclip · Acme",
        address: "https://paperclip.acme.example",
        state: { kind: "no-key" },
      },
    ],
  });
  const root = render(
    <InboxView
      inbox={new Inbox(fakeRuns([]).runs)}
      now={() => later}
      agentMessaging={messaging}
      actionCatalog={catalog}
      requesterPolicy={policy}
      actionSteps={steps}
      agentConnections={agentConnections}
      serviceSignIn={serviceSignIn}
    />,
  );
  await settled();
  const cell = root.querySelector<HTMLElement>('[role="grid"] tr [role="gridcell"]');
  await act(async () => cell?.click());
  await settled();
  return root;
}

const runStepOne = (root: HTMLElement) =>
  [...root.querySelectorAll("button")].find((button) =>
    button.textContent?.startsWith("Run step 1 of 4"),
  );

verifies("inbox.agent-action-run", () => {
  describe("an agent's Paperclip sign-in request in the desktop app", () => {
    it("is ready to run its sign-in once the app gives the Inbox its ServiceSignIn", async () => {
      const signIn = new FakeServiceSignIn({
        connections: {
          acme: { address: "https://paperclip.acme.example", company: "acme-company" },
        },
        approver: "Acme Board",
        now: () => later,
      });
      const root = await openSignInItem(acmeSignInCatalog, signIn);
      expect(root.textContent).not.toContain("isn't available in this version of Halonic");
      expect(runStepOne(root)).toBeDefined();
    });

    it("says the request isn't available here without one, as in a browser", async () => {
      const root = await openSignInItem(acmeSignInCatalog);
      expect(root.textContent).toContain("isn't available in this version of Halonic");
      expect(runStepOne(root)).toBeUndefined();
    });
  });
});
