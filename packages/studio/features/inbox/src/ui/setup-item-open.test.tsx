// @vitest-environment jsdom
import type { ItemRef } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { fakeSetups, setupEntry } from "../fake-setups.test-helper.ts";
import { Inbox, type SetupViewProps } from "../inbox.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const supportReply: ItemRef = { kind: "workflow", hub: "support", id: "support-reply" };

/** A source's view with one button that opens Support reply, when it can. */
function ContinueView({ openItem }: SetupViewProps) {
  return (
    <section>
      <p>{openItem === undefined ? "can't open" : "can open"}</p>
      <button type="button" onClick={() => openItem?.(supportReply)}>
        Continue
      </button>
    </section>
  );
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function openItemWith(openPage?: (item: ItemRef) => void) {
  const inbox = new Inbox(fakeRuns([]).runs);
  const source = fakeSetups("first-run", [setupEntry("demo", "2026-11-21T09:00:00.000Z")], {
    view: { view: "ContinueView", load: async () => ({ ContinueView }) },
  });
  inbox.addSetupSource(source.source);
  await settled();
  const root = render(<InboxView inbox={inbox} {...(openPage && { openPage })} />);
  act(() => root.querySelector<HTMLElement>('[role="grid"] [role="gridcell"]')?.click());
  await settled();
  return root;
}

verifies("inbox.setup-item-open", () => {
  it("lets a setup item's view open an item's page", async () => {
    const opened: ItemRef[] = [];
    const root = await openItemWith((item) => opened.push(item));
    expect(root.querySelector("section p")?.textContent).toBe("can open");
    act(() => root.querySelector<HTMLButtonElement>("section button")?.click());
    expect(opened).toEqual([supportReply]);
  });

  it("gives the view no way to open one where the window has none", async () => {
    const root = await openItemWith();
    expect(root.querySelector("section p")?.textContent).toBe("can't open");
  });
});
