// @vitest-environment jsdom

import type { AgentMessaging } from "@halonicjs/ports";
import { OpenExternalProvider } from "@halonicjs/studio-kit";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
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

const asked = new Date(2026, 10, 24, 10, 0);

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** A fake with the source "Paperclip · Acme" and one open yes/no question from Chief. */
function acme() {
  const messaging = new FakeAgentMessaging({ now: () => asked });
  const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  const item = messaging.addInboxItem(source.id, {
    question: "Paint the acme shed?",
    from: { kind: "agent", agent: chief.id, name: "Chief" },
  });
  return { messaging, item };
}

async function openFirstItem(messaging: AgentMessaging): Promise<HTMLElement> {
  const inbox = new Inbox(fakeRuns([]).runs);
  const root = render(
    <OpenExternalProvider openExternal={vi.fn(async () => {})}>
      <InboxView inbox={inbox} now={() => asked} agentMessaging={messaging} />
    </OpenExternalProvider>,
  );
  await settled();
  const cell = root.querySelector<HTMLElement>('[role="grid"] tr [role="gridcell"]');
  if (cell === null) throw new Error("no row");
  await click(cell);
  return root;
}

function button(root: HTMLElement, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((b) => b.textContent?.startsWith(name));
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

async function click(target: HTMLElement) {
  await act(async () => {
    target.click();
  });
  await settled();
}

verifies("inbox.answer-refused", () => {
  describe("an answer the source refuses", () => {
    it("shows the failure line for bad-answer, and Try again sends the same answer", async () => {
      const { messaging, item } = acme();
      const answer = vi
        .spyOn(messaging, "answer")
        .mockResolvedValueOnce({ outcome: "refused", reason: "bad-answer" });
      const root = await openFirstItem(messaging);

      await click(button(root, "Yes"));

      expect(root.querySelector('[role="alert"]')?.textContent).toContain(
        "Couldn't record your decision.",
      );
      await click(button(root, "Try again"));
      expect(answer).toHaveBeenCalledTimes(2);
      expect(answer).toHaveBeenLastCalledWith(item.id, { kind: "option", option: "yes" });
    });
  });
});
