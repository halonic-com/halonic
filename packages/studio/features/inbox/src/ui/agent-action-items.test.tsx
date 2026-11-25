// @vitest-environment jsdom

import type { RequesterPolicy } from "@halonicjs/action-steppers";
import type { InboxActionRequest } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
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
const threeHoursLater = new Date(2026, 10, 24, 13, 0);

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** A fake with the source "Paperclip · Acme" and one action item from Chief asking for `action`. */
function acme(action: InboxActionRequest = approveAcmeApp) {
  const messaging = new FakeAgentMessaging({ now: () => asked });
  const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  const item = messaging.addInboxItem(source.id, {
    question: "The release of acme/app is ready.",
    from: { kind: "agent", agent: chief.id, name: "Chief" },
    action,
  });
  // The user's profile allows this source to ask for admin changes.
  const allowsAcme: RequesterPolicy = {
    allowed: [{ source: { kind: "paperclip", id: source.id } }],
  };
  return { messaging, item, allowsAcme };
}

/** The Inbox with only the agents' items, opened on the first row. */
async function openAction(messaging: FakeAgentMessaging, policy?: RequesterPolicy) {
  const root = render(
    <InboxView
      inbox={new Inbox(fakeRuns([]).runs)}
      now={() => threeHoursLater}
      agentMessaging={messaging}
      actionCatalog={acmeActionCatalog}
      requesterPolicy={policy}
    />,
  );
  await settled();
  const cell = root.querySelector<HTMLElement>('[role="grid"] tr [role="gridcell"]');
  if (cell === null) throw new Error("no row");
  await act(async () => cell.click());
  await settled();
  return root;
}

/** The open card: the section its heading names. */
function card(root: HTMLElement, title: string): HTMLElement {
  const heading = [...root.querySelectorAll("h2")].find((h) => h.textContent === title);
  const found = heading?.closest("section");
  if (found === null || found === undefined) throw new Error(`no card "${title}"`);
  return found;
}

function buttons(root: HTMLElement): string[] {
  return [...root.querySelectorAll("button")].map((button) => button.textContent ?? "");
}

function touches(root: HTMLElement): string[] {
  const heading = [...root.querySelectorAll("h3")].find(
    (h) => h.textContent === "This stepper touches",
  );
  const list = heading?.closest("section")?.querySelectorAll("li") ?? [];
  return [...list].map((li) => li.textContent ?? "");
}

verifies("inbox.agent-action-items", () => {
  describe("an agent's action request", () => {
    it("opens the stepper in review mode with what an acme/app request touches", async () => {
      const { messaging, allowsAcme } = acme();
      const stepper = card(await openAction(messaging, allowsAcme), "Approve a deployment");
      expect(touches(stepper)).toEqual(["GitHub: repository acme/app"]);
      expect(stepper.textContent).toContain("Open it in the desktop app to run it.");
      expect(stepper.textContent).toContain("Chief on Paperclip · Acme");
      expect(buttons(stepper).some((name) => name.startsWith("Run"))).toBe(false);
    });

    it("shows a request outside the catalog as a normal card with the reason and no run button", async () => {
      const { messaging, allowsAcme } = acme({
        ...approveAcmeApp,
        definition: "github.delete-repo",
      });
      const root = await openAction(messaging, allowsAcme);
      const normal = card(root, "The release of acme/app is ready.");
      expect(normal.textContent).toContain("This card has a stepper Halonic can't read:");
      // The quoted name is set in code type, not shown with its backticks.
      expect(normal.textContent).toContain("github.delete-repo@1 isn't in this Halonic's catalog");
      expect(normal.textContent).not.toContain("`");
      expect(normal.querySelector("li code")?.textContent).toBe("github.delete-repo@1");
      expect(buttons(normal)).toEqual(["Decline"]);
    });

    it("says Blocked by your settings when the policy doesn't allow the source for admin", async () => {
      const { messaging } = acme();
      const stepper = card(await openAction(messaging), "Approve a deployment");
      expect(stepper.textContent).toContain("Blocked by your settings");
      expect(buttons(stepper).filter((name) => name !== "Show the request")).toEqual(["Decline"]);
    });

    it("answers Decline with a declined result", async () => {
      const { messaging, item, allowsAcme } = acme();
      const root = await openAction(messaging, allowsAcme);
      const decline = [...root.querySelectorAll("button")].find((b) => b.textContent === "Decline");
      await act(async () => decline?.click());
      await settled();
      const [answered] = await messaging.listInboxItems();
      expect(answered?.id).toBe(item.id);
      expect(answered?.state).toMatchObject({
        kind: "answered",
        answer: { kind: "action-result", outcome: "declined", steps: [] },
      });
      expect(root.textContent).toContain("You declined this request. Nothing more will run.");
    });

    it("keeps focus on the bundle's first card when the action request is its second", async () => {
      let now = new Date(2026, 10, 24, 9, 0);
      const messaging = new FakeAgentMessaging({ now: () => now });
      const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
      const chief = messaging.addAgent(source.id, { name: "Chief" });
      const from = { kind: "agent", agent: chief.id, name: "Chief" } as const;
      messaging.addInboxItem(source.id, { question: "Ship the release?", from });
      now = asked;
      messaging.addInboxItem(source.id, {
        question: "The release of acme/app is ready.",
        from,
        action: approveAcmeApp,
      });
      const root = await openAction(messaging);
      const titles = [...root.querySelectorAll("section h2")].map((h) => h.textContent);
      expect(titles).toEqual(["Ship the release?", "Approve a deployment"]);
      expect(document.activeElement).toBe(card(root, "Ship the release?").querySelector("h2"));
    });
  });
});
