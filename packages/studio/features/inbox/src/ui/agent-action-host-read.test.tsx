// @vitest-environment jsdom

import {
  type RequesterPolicy,
  type StepperCatalog,
  type StepperDefinition,
  strictParameters,
} from "@halonicjs/action-steppers";
import type { ActionRoute } from "@halonicjs/ports";
import {
  type AgentConnection,
  type AgentConnections,
  createActionSteps,
} from "@halonicjs/studio-services";
import {
  FakeActionRecords,
  FakeActionSender,
  FakeAgentMessaging,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

// Local times, so the test reads the same in every time zone. Tue 24 Nov 2026.
const asked = new Date(2026, 10, 24, 10, 0);
const later = new Date(2026, 10, 24, 13, 0);

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** An invented Paperclip stepper that guides the user on the request's own host. */
const openSettings: StepperDefinition<Record<string, string | number>> = {
  id: "acme.paperclip-settings",
  version: 1,
  service: "paperclip",
  title: "Open the company settings",
  summary: "Opens the settings page.",
  risk: "admin",
  parameters: strictParameters({ host: { kind: "text", pattern: /^[a-z0-9.-]{1,253}$/ } }),
  steps: [
    {
      kind: "guided",
      address: "https://{host}/settings",
      instructions: ["Check the company name."],
      checkedOn: "2026-11-24",
    },
  ],
  targets: (parameters) => [
    { service: "paperclip", kind: "Paperclip", name: String(parameters["host"]) },
  ],
  preview: () => ["Opens the settings page."],
};

/** The route the shell would compile for its one step. */
const settingsRoute: ActionRoute = {
  kind: "guided",
  definition: openSettings.id,
  version: 1,
  step: 1,
  service: "paperclip",
  risk: "admin",
  placeholders: { host: "^[a-z0-9.-]{1,253}$" },
  address: "https://{host}/settings",
};

const catalog: StepperCatalog = {
  definition: (id, version) =>
    id === openSettings.id && version === openSettings.version ? openSettings : undefined,
  stepType: () => undefined,
  browserOrigins: [],
  route: () => undefined,
};

/** The `acme` Paperclip as Settings lists it, with its key on this computer. */
const acme: AgentConnection = {
  id: "paperclip:acme",
  provider: "paperclip",
  label: "Paperclip · Acme",
  address: "https://paperclip.acme.example",
  state: { kind: "online", asOf: later.toISOString() },
};

/** Connections whose first read waits until the test settles it. */
function connectionsOnHold() {
  const read = Promise.withResolvers<AgentConnection[]>();
  const connections: AgentConnections = {
    list: () => read.promise,
    subscribe: () => () => {},
    signIn: () => Promise.reject(new Error("not in this test")),
    disconnect: () => Promise.reject(new Error("not in this test")),
  };
  return { connections, read };
}

/** The Inbox in the desktop app, signed in to Paperclip, with one request on `acme`, opened. */
async function openRequest(connections: AgentConnections): Promise<HTMLElement> {
  const messaging = new FakeAgentMessaging({ now: () => asked });
  const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  messaging.addInboxItem(source.id, {
    question: "Check the company name.",
    from: { kind: "agent", agent: chief.id, name: "Chief" },
    action: {
      definition: openSettings.id,
      version: 1,
      parameters: { host: "paperclip.acme.example" },
      expires: "2026-11-25T12:00:00.000Z",
    },
  });
  const policy: RequesterPolicy = { allowed: [{ source: { kind: "paperclip", id: source.id } }] };
  const fake = new FakeActionSender({ routes: [settingsRoute], signInAs: { paperclip: "Board" } });
  await fake.signIn("paperclip");
  const sender = Object.assign(fake, { cancelSignIn: () => Promise.resolve() });
  const steps = createActionSteps({ sender, records: new FakeActionRecords(), now: () => later });
  const root = render(
    <InboxView
      inbox={new Inbox(fakeRuns([]).runs)}
      now={() => later}
      agentMessaging={messaging}
      actionCatalog={catalog}
      requesterPolicy={policy}
      actionSteps={steps}
      agentConnections={connections}
    />,
  );
  await settled();
  const cell = root.querySelector<HTMLElement>('[role="grid"] tr [role="gridcell"]');
  await act(async () => cell?.click());
  await settled();
  return root;
}

/** The stepper's heading, the request's title. */
function stepperHeading(root: HTMLElement): HTMLHeadingElement | undefined {
  return [...root.querySelectorAll("h2")].find(
    (heading) => heading.textContent === "Open the company settings",
  );
}

function buttons(root: HTMLElement): string[] {
  return [...root.querySelectorAll("button")].map((button) => button.textContent ?? "");
}

verifies("action-steppers.paperclip-host", () => {
  describe("a Paperclip request opened while the connections are read", () => {
    it("gives no reason until they are read, then is ready to run in the same card", async () => {
      const { connections, read } = connectionsOnHold();
      const root = await openRequest(connections);
      const heading = stepperHeading(root);
      expect(heading).toBeDefined();
      expect(root.textContent).not.toContain("Halonic can't run this card's stepper:");
      expect(root.textContent).not.toContain("isn't a Paperclip you connected");
      expect(buttons(root)).not.toContain("Mark done by hand");
      read.resolve([acme]);
      await settled();
      expect(buttons(root)).toContain("Mark done by hand");
      // The card checked the request again in place, so its heading is the one drawn first.
      expect(stepperHeading(root)).toBe(heading);
    });

    it("gives the reason, with only Decline, when the connections can't be read", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { connections, read } = connectionsOnHold();
      const root = await openRequest(connections);
      read.reject(new Error("the shell didn't answer"));
      await settled();
      expect(root.textContent).toContain("Halonic can't run this card's stepper:");
      expect(root.querySelector("ul.list-disc li")?.textContent).toBe(
        "Halonic couldn't read your connections in Settings › Connections",
      );
      expect(buttons(root).filter((name) => name === "Decline" || name.startsWith("Run"))).toEqual([
        "Decline",
      ]);
    });
  });
});
