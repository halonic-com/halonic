// @vitest-environment jsdom

import type { RequesterPolicy, StepperCatalog } from "@halonicjs/action-steppers";
import type { ActionRoute } from "@halonicjs/ports";
import { createActionSteps } from "@halonicjs/studio-services";
import {
  FakeActionRecords,
  FakeActionSender,
  FakeAgentMessaging,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { acmeActionCatalog, approveAcmeApp } from "../agent/acme-actions.test-helper.ts";
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

/** The route the shell would compile for the invented definition's one step. */
const approveRoute: ActionRoute = {
  kind: "call",
  definition: "github.approve-deployment",
  version: 1,
  step: 1,
  service: "github",
  risk: "admin",
  method: "POST",
  path: "/repos/{owner}/{repo}/deployments/approve",
  placeholders: { owner: "^[A-Za-z0-9-]{1,39}$", repo: "^[A-Za-z0-9._-]{1,100}$" },
  body: [{ name: "environment", kind: "string", pattern: "^(release|staging)$" }],
  keep: [],
};

const catalog: StepperCatalog = {
  ...acmeActionCatalog,
  route: (id, version, step) =>
    id === approveRoute.definition && version === 1 && step === 1 ? approveRoute : undefined,
};

verifies("inbox.agent-action-run", () => {
  describe("an agent's action request in the desktop app", () => {
    it("runs its step with the user's sign-in and answers the item when the stepper ends", async () => {
      const messaging = new FakeAgentMessaging({ now: () => asked });
      const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
      const chief = messaging.addAgent(source.id, { name: "Chief" });
      messaging.addInboxItem(source.id, {
        question: "The release of acme/app is ready.",
        from: { kind: "agent", agent: chief.id, name: "Chief" },
        action: approveAcmeApp,
      });
      const policy: RequesterPolicy = {
        allowed: [{ source: { kind: "paperclip", id: source.id } }],
      };
      const fake = new FakeActionSender({
        routes: [approveRoute],
        signInAs: { github: "acme-dev" },
      });
      await fake.signIn("github");
      const sender = Object.assign(fake, { cancelSignIn: () => Promise.resolve() });
      const steps = createActionSteps({
        sender,
        records: new FakeActionRecords(),
        now: () => later,
      });
      const root = render(
        <InboxView
          inbox={new Inbox(fakeRuns([]).runs)}
          now={() => later}
          agentMessaging={messaging}
          actionCatalog={catalog}
          requesterPolicy={policy}
          actionSteps={steps}
        />,
      );
      await settled();
      const cell = root.querySelector<HTMLElement>('[role="grid"] tr [role="gridcell"]');
      await act(async () => cell?.click());
      await settled();
      const run = [...root.querySelectorAll("button")].find((button) =>
        button.textContent?.startsWith("Run step 1 of 1"),
      );
      expect(run).toBeDefined();
      await act(async () => run?.click());
      await settled();
      expect(fake.sent).toEqual([
        {
          service: "github",
          method: "POST",
          path: "/repos/acme/app/deployments/approve",
          body: { environment: "release" },
        },
      ]);
      const [answered] = await messaging.listInboxItems();
      expect(answered?.state).toMatchObject({
        kind: "answered",
        answer: {
          kind: "action-result",
          outcome: "succeeded",
          steps: [{ step: 1, outcome: "succeeded", status: 200 }],
        },
      });
    });
  });
});
