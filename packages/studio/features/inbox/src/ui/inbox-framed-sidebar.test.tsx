// @vitest-environment jsdom

import { NarrowProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { waitingRun } from "../test-runs.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

afterEach(unmountAll);

const now = () => new Date(2026, 10, 8, 10, 43);
const review = waitingRun("r1", {
  lastWaitingAt: new Date(2026, 10, 8, 9, 0).toISOString(),
  waitingFor: { title: "Approve this reply?", body: "" },
});

async function openInbox(framed: boolean, narrow = false) {
  const root = render(
    <NarrowProvider narrow={narrow}>
      <InboxView inbox={new Inbox(fakeRuns([review]).runs, now)} now={now} framed={framed} />
    </NarrowProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return root;
}

async function openFirstRow(root: HTMLElement) {
  await act(async () => {
    root.querySelector<HTMLElement>('[role="grid"] tr [role="gridcell"]')?.click();
  });
}

function classesOf(element: Element | null): string[] {
  return (element?.className ?? "").split(" ");
}

function panes(root: HTMLElement) {
  return {
    list: root.querySelector('[data-pane="list"]'),
    item: root.querySelector('[data-pane="item"]'),
  };
}

verifies("inbox.framed-sidebar", () => {
  it("puts the list on the window's frame and the item on a framed panel 8px beside it", async () => {
    const root = await openInbox(true);
    await openFirstRow(root);
    const { list, item } = panes(root);

    expect(list?.parentElement?.tagName).toBe("MAIN");
    expect(classesOf(list?.parentElement ?? null)).toContain("gap-2");
    expect(classesOf(list)).not.toContain("border-e");
    // The rows end 8px from the panel: the frame's gap, with no padding of the list's own.
    expect(
      classesOf(
        root.querySelector('[data-pane="list"] [role="grid"]')?.closest(".overflow-y-auto") ?? null,
      ),
    ).toEqual(expect.arrayContaining(["ps-2"]));
    expect(classesOf(item)).toEqual(
      expect.arrayContaining(["rounded-lg", "border", "border-border", "bg-app-panel"]),
    );
  });

  it("keeps the list and the item on Studio's panel, with a line between them, in Studio's window", async () => {
    const root = await openInbox(false);
    const { list, item } = panes(root);

    expect(root.querySelector("main")).toBeNull();
    expect(classesOf(list)).toEqual(expect.arrayContaining(["border-e", "border-border"]));
    expect(classesOf(item)).not.toContain("rounded-lg");
  });

  it("shows the list on the frame, then the open item on the framed panel, one pane at a time", async () => {
    const root = await openInbox(true, true);
    expect(classesOf(panes(root).item)).toContain("hidden");

    await openFirstRow(root);
    const { list, item } = panes(root);
    expect(classesOf(list)).toContain("hidden");
    expect(classesOf(item)).toEqual(expect.arrayContaining(["flex", "rounded-lg"]));
  });
});
