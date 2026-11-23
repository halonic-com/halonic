// @vitest-environment jsdom
import type { ItemRef, OpenItemOptions } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { type HeldAgent, onHoldSetup } from "../sandbox/on-hold-setup-source.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const writer: HeldAgent = {
  hubId: "acme",
  id: "writer",
  name: "Writer",
  since: "2026-11-20T09:00:00.000Z",
};

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Wait until `done` holds, a tick at a time, instead of guessing how many ticks the page needs. */
async function until(done: () => unknown): Promise<void> {
  for (let tries = 0; tries < 100 && !done(); tries++) await settled();
}

type Opened = { readonly item: ItemRef; readonly options: OpenItemOptions | undefined };

/** The page with Writer's on-hold card open, over held agents a test sets. */
async function openCard(
  options: {
    openPage?: (item: ItemRef, options?: OpenItemOptions) => void;
    reviewStep?: string;
  } = {},
) {
  let held: readonly HeldAgent[] = [writer];
  const listeners = new Set<() => void>();
  const { source } = onHoldSetup({
    list: async () => ({ held, unread: [] }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ...(options.reviewStep === undefined ? {} : { reviewStep: options.reviewStep }),
  });
  const inbox = new Inbox(fakeRuns([]).runs);
  inbox.addSetupSource(source);
  await settled();
  inbox.openSetup("sandbox-on-hold", "acme/writer");
  const root = render(
    <InboxView inbox={inbox} {...(options.openPage && { openPage: options.openPage })} />,
  );
  await until(() => root.querySelector("section h2"));
  return {
    root,
    release: async () => {
      held = [];
      for (const listener of [...listeners]) listener();
      await settled();
    },
  };
}

const button = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll("section button")].find((b) => b.textContent === name) as
    | HTMLButtonElement
    | undefined;

verifies("inbox.on-hold-row", () => {
  it("shows the title and the line, and Review and confirm opens the agent's Where it runs", async () => {
    const opened: Opened[] = [];
    const { root } = await openCard({
      openPage: (item, options) => opened.push({ item, options }),
      reviewStep: "where-it-runs",
    });
    const card = root.querySelector("section") as HTMLElement;
    expect(card.querySelector("h2")?.textContent).toBe(
      "Confirm again: Writer runs in the sandbox for now",
    );
    expect(card.textContent).toContain("Writer's file changed since you chose On this computer.");
    act(() => button(root, "Review and confirm")?.click());
    expect(opened).toEqual([
      { item: { kind: "agent", hub: "acme", id: "writer" }, options: { step: "where-it-runs" } },
    ]);
  });

  it("opens the agent's page at the top without a step, and has no button where nothing opens", async () => {
    const opened: Opened[] = [];
    const t = await openCard({ openPage: (item, options) => opened.push({ item, options }) });
    act(() => button(t.root, "Review and confirm")?.click());
    expect(opened).toEqual([{ item: { kind: "agent", hub: "acme", id: "writer" }, options: {} }]);
    unmountAll();

    const none = await openCard();
    expect(button(none.root, "Review and confirm")).toBeUndefined();
    expect(button(none.root, "Not now")).toBeDefined();
  });

  it("says Fixed and drops Review and confirm once the agent isn't on hold", async () => {
    const t = await openCard({ openPage: () => {}, reviewStep: "where-it-runs" });
    await t.release();
    await until(() => t.root.textContent?.includes("Fixed"));
    expect(t.root.querySelector("section")?.textContent).toContain("Fixed");
    expect(button(t.root, "Review and confirm")).toBeUndefined();
  });
});
