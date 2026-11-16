// @vitest-environment jsdom

import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import type { InboxRequests } from "../request/inbox-requests.ts";
import { waitingRun } from "../test-runs.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const support = { key: "support/support-reply", label: "Answer a customer's email" };

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The Inbox with a request form; the run `r9` the request starts waits only once `arrive()` is called. */
async function setup() {
  const runs = fakeRuns([]);
  const requests: InboxRequests = {
    offered: async () => [support],
    subscribe: () => () => {},
    start: async () => ({ runId: "r9", hubId: "acme" }),
  };
  const announce = vi.fn();
  const root = render(
    <ToastStoreProvider store={createToastStore()}>
      <InboxView inbox={new Inbox(runs.runs)} requests={requests} announce={announce} />
    </ToastStoreProvider>,
  );
  await settled();
  const arrive = async (id = "r9") => {
    runs.change([waitingRun(id, { state: "review", accepts: ["approve", "reject"] })]);
    await settled();
  };
  return { root, announce, arrive };
}

async function sendRequest(root: HTMLElement) {
  const textarea = root.querySelector("textarea");
  if (textarea === null) throw new Error("no Message field");
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    set?.call(textarea, "Hi, my order arrived damaged.");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const send = [...root.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Send"));
  await act(async () => {
    send?.focus();
    send?.click();
  });
  await settled();
}

verifies("inbox.request-card", () => {
  describe("the card of a request you sent", () => {
    it("opens by itself while focus is still in the form", async () => {
      const { root, announce, arrive } = await setup();
      await sendRequest(root);
      await arrive();
      expect(root.querySelector('[data-pane="item"] form[data-request-form]')).toBeNull();
      expect(root.querySelector('[data-pane="item"]')?.textContent).toContain("Approve");
      expect(announce).not.toHaveBeenCalled();
    });

    it("only adds its row and is announced when focus has moved on", async () => {
      const { root, announce, arrive } = await setup();
      await sendRequest(root);
      await act(async () => {
        const outside = document.createElement("button");
        root.append(outside);
        outside.focus();
      });
      await arrive();
      expect(root.querySelector("form[data-request-form]")).not.toBeNull();
      expect(root.querySelectorAll('[role="grid"] tr').length).toBeGreaterThan(0);
      expect(announce).toHaveBeenCalledOnce();
      expect(announce.mock.calls[0]?.[0]).toMatch(/^New in Needs you: /);
    });
  });

  it("opens no card for a run that wasn't sent as a request", async () => {
    const { root, announce, arrive } = await setup();
    await sendRequest(root);
    await arrive("r1");
    expect(root.querySelector("form[data-request-form]")).not.toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });
});
