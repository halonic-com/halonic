// @vitest-environment jsdom

import { stepperRequestFormat } from "@halonicjs/action-steppers";
import { HostSettings } from "@halonicjs/app";
import {
  type HostSettingValues,
  type InboxStepperRequest,
  inboxStepperFormat,
} from "@halonicjs/ports";
import type {
  RequesterPolicy,
  ServerSessionAnswer,
  ServerSessionRequest,
  ServerSessionShell,
} from "@halonicjs/studio-feature-action-steppers/api";
import { type AgentConnection, FakeAgentConnections } from "@halonicjs/studio-services";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acmeActionCatalog } from "../agent/acme-actions.test-helper.ts";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";
import { serverSessionStarted } from "./stepper-item-card.tsx";

afterEach(unmountAll);

const asked = new Date(2026, 10, 25, 9, 0);

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** An invented request: restart the acme web service on the user's server, for task HAL-1234. */
const restartDocument = JSON.stringify({
  format: stepperRequestFormat,
  title: "Restart acme-web",
  reason: "The site hangs since this morning.",
  blocks: [
    {
      kind: "server-session",
      task: "HAL-1234",
      steps: ["Restart the acme-web service", "Check its log for errors"],
      doneWhen: "https://acme.example/health answers 200",
    },
  ],
});

/** The pinned request: revision `rev-2` of the restart request. */
const pinned: InboxStepperRequest = {
  format: inboxStepperFormat,
  document: restartDocument,
  revision: "rev-2",
  touches: [],
  changed: false,
};

/**
 * A fake with the source "Paperclip · Acme", its work HAL-1234, and one item from Chief on it
 * pinning the restart request, or with `labelOnly` only naming it in its text.
 */
function acme({ labelOnly = false }: { readonly labelOnly?: boolean } = {}) {
  const messaging = new FakeAgentMessaging({ now: () => asked });
  const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  const work = messaging.addWork(source.id, { label: "HAL-1234", title: "acme-web hangs" });
  const from = { kind: "agent", agent: chief.id, name: "Chief" } as const;
  messaging.addInboxItem(
    source.id,
    labelOnly
      ? { question: "Run with Claude: server-session HAL-1234", from, work: work.id }
      : {
          question: "Please restart acme-web on our server.",
          from,
          options: [],
          work: work.id,
          stepper: pinned,
        },
  );
  // The user's profile allows this source to ask for irreversible requests.
  const policy: RequesterPolicy = { allowed: [{ source: { kind: "paperclip", id: source.id } }] };
  const connection: AgentConnection = {
    id: source.id,
    provider: "paperclip",
    label: "Paperclip · Acme",
    address: "https://paperclip.acme.example/",
    state: { kind: "online", asOf: "2026-11-25T08:00:00.000Z" },
  };
  return { messaging, policy, connection };
}

/** Host settings in memory, loaded, holding `values`. */
async function hostSettings(values: HostSettingValues): Promise<HostSettings> {
  const settings = new HostSettings({
    read: async () => values,
    set: async () => undefined,
    remove: async () => undefined,
    watch: () => () => undefined,
  });
  await settings.load();
  return settings;
}

/** A shell that records what it was given and answers `open`. */
function fakeShell(open: () => Promise<ServerSessionAnswer>) {
  const requests: ServerSessionRequest[] = [];
  const shell: ServerSessionShell = {
    open: (request) => {
      requests.push(request);
      return open();
    },
  };
  return { shell, requests };
}

interface Opening {
  readonly messaging: FakeAgentMessaging;
  readonly policy: RequesterPolicy;
  readonly connections: readonly AgentConnection[];
  readonly shell?: ServerSessionShell;
  readonly server?: HostSettingValues;
}

/** The Inbox with only the agents' items, opened on the first row. */
async function openItem({ messaging, policy, connections, shell, server }: Opening) {
  const opened: (string | undefined)[] = [];
  const settings = await hostSettings(
    server ?? { "server-session.host": "build.acme.example", "server-session.user": "ops" },
  );
  const root = render(
    <InboxView
      inbox={new Inbox(fakeRuns([]).runs)}
      now={() => asked}
      agentMessaging={messaging}
      actionCatalog={acmeActionCatalog}
      requesterPolicy={policy}
      agentConnections={new FakeAgentConnections({ connections })}
      serverSession={{ shell, settings, openSettings: (section) => opened.push(section) }}
    />,
  );
  await settled();
  const cell = root.querySelector<HTMLElement>('[role="grid"] tr [role="gridcell"]');
  if (cell === null) throw new Error("no row");
  await act(async () => cell.click());
  await settled();
  return { root, opened };
}

function buttonNames(root: HTMLElement): string[] {
  return [...root.querySelectorAll("button")].map((button) => button.textContent ?? "");
}

async function press(root: HTMLElement, name: string) {
  const found = [...root.querySelectorAll("button")].find((each) => each.textContent === name);
  if (found === undefined) throw new Error(`no button "${name}"`);
  await act(async () => found.click());
  await settled();
}

/** Opens the confirm screen and presses its **Run with Claude**. */
async function start(root: HTMLElement) {
  await press(root, "Run with Claude");
  await press(root, "Run with Claude");
}

async function stateOfItem(messaging: FakeAgentMessaging) {
  const [item] = await messaging.listInboxItems();
  return item?.state;
}

verifies("inbox.run-with-claude", () => {
  describe("Run with Claude in the Inbox", () => {
    it("draws Run with Claude under a pinned server-session item from an allowed source", async () => {
      const { messaging, policy, connection } = acme();
      const { root } = await openItem({ messaging, policy, connections: [connection] });
      expect(root.textContent).toContain("Please restart acme-web on our server.");
      expect(buttonNames(root)).toContain("Run with Claude");
      await press(root, "Run with Claude");
      // The brief names the task on the requester's Paperclip, from the connection record.
      expect(root.querySelector("figure pre")?.textContent).toContain(
        "https://paperclip.acme.example/",
      );
    });

    it("draws none for a card with only a label", async () => {
      const { messaging, policy, connection } = acme({ labelOnly: true });
      const { root } = await openItem({ messaging, policy, connections: [connection] });
      expect(buttonNames(root)).not.toContain("Run with Claude");
    });

    it("draws none when no connection is the item's source, or its address won't parse", async () => {
      const { messaging, policy, connection } = acme();
      const others = [
        [],
        [{ ...connection, id: "paperclip:other" }],
        [{ ...connection, address: "not an address" }],
      ];
      for (const connections of others) {
        const { root } = await openItem({ messaging, policy, connections });
        expect(root.textContent).toContain("Please restart acme-web on our server.");
        expect(buttonNames(root)).not.toContain("Run with Claude");
        unmountAll();
      }
    });

    it("answers the item with a succeeded block 1 once the terminal opened", async () => {
      const { messaging, policy, connection } = acme();
      const { shell, requests } = fakeShell(async () => ({ kind: "terminal-opened" }));
      const { root } = await openItem({ messaging, policy, connections: [connection], shell });
      await start(root);
      expect(requests).toEqual([
        { task: "HAL-1234", brief: expect.any(String), requestHash: "rev-2" },
      ]);
      expect(await stateOfItem(messaging)).toMatchObject({
        kind: "answered",
        answer: {
          kind: "action-result",
          outcome: "succeeded",
          steps: [{ step: 1, outcome: "succeeded" }],
        },
      });
      expect(serverSessionStarted).toEqual({
        kind: "action-result",
        outcome: "succeeded",
        steps: [{ step: 1, outcome: "succeeded" }],
      });
      // The confirm screen stays and says it started.
      expect(root.textContent).toContain("Claude Code is starting in a terminal.");
    });

    it("sends no answer and leaves the item open when the shell refuses, is cancelled or throws", async () => {
      const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const answers: (() => Promise<ServerSessionAnswer>)[] = [
        async () => ({ kind: "refused", reason: "the server isn't set up" }),
        async () => ({ kind: "cancelled" }),
        async () => {
          throw new Error("bridge down");
        },
      ];
      for (const answer of answers) {
        const { messaging, policy, connection } = acme();
        const { shell } = fakeShell(answer);
        const { root } = await openItem({ messaging, policy, connections: [connection], shell });
        await start(root);
        expect(await stateOfItem(messaging)).toEqual({ kind: "open" });
        unmountAll();
      }
      reported.mockRestore();
    });

    it("opens Settings at Your server when no server is set up", async () => {
      const { messaging, policy, connection } = acme();
      const { root, opened } = await openItem({
        messaging,
        policy,
        connections: [connection],
        server: {},
      });
      await press(root, "Set up your server in Settings first");
      expect(opened).toEqual(["server-session"]);
    });
  });
});
