// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import { defineFeature } from "../feature.ts";
import type { BarItemContribution } from "../points/frame.ts";
import { createShell } from "../shell.ts";
import { reportedShellError } from "../test-support/console-errors.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { type StatusBarItemProps, StatusBarItems } from "./status-bar.tsx";

beforeEach(() => {
  // React logs every error a boundary catches; in the failure tests that is the point.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

/** An item whose view says its text and which feature's context it got. */
function item(id: string, order: number, text: string): BarItemContribution {
  const Item = ({ context }: StatusBarItemProps) => (
    <span>{`${text} for ${context.services.toString()}`}</span>
  );
  return { id, order, view: "Item", load: async () => ({ Item }) };
}

function contextOf(featureId: string): WorkspaceContext {
  return {
    services: { toString: () => featureId } as unknown as WorkspaceContext["services"],
    announcer: createAnnouncer({ timers: new FakeTimers() }),
  };
}

/** Renders the status bar's items and lets their views import. */
async function renderItems(items: readonly BarItemContribution[]): Promise<HTMLElement> {
  const shell = createShell({
    features: items.map((entry) =>
      defineFeature({
        id: `${entry.id}-feature`,
        title: entry.id,
        register: (studio) => studio.statusBar.add(entry),
      }),
    ),
  });
  const container = render(
    <>
      <main>The rest of the frame</main>
      <footer>
        <StatusBarItems items={shell.contributions.statusBar.list()} contextFor={contextOf} />
      </footer>
    </>,
  );
  // Lets the views import, and a failed import reach its boundary.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return container;
}

verifies("shell.status-bar", () => {
  it("shows each item in its order, with its own feature's context", async () => {
    const container = await renderItems([
      item("spend", 20, "€3.20 of €50.00"),
      item("branch", 10, "main"),
    ]);
    const shown = Array.from(
      container.querySelectorAll("footer > span"),
      (span) => span.textContent,
    );
    expect(shown).toEqual(["main for branch-feature", "€3.20 of €50.00 for spend-feature"]);
  });

  it("is empty with no items, and never a live region", async () => {
    const container = await renderItems([]);
    expect(container.querySelector("footer")?.childElementCount).toBe(0);
    expect(container.querySelector("[aria-live], [role='status']")).toBeNull();
  });

  it("shows nothing for an item whose view isn't exported, reports it, and keeps the others", async () => {
    const misnamed: BarItemContribution = {
      id: "spend",
      order: 20,
      view: "SpendItem",
      load: async () => ({ Spend: () => <span>€3.20 of €50.00</span> }),
    };
    const container = await renderItems([misnamed, item("branch", 10, "main")]);
    const shown = Array.from(
      container.querySelectorAll("footer > *"),
      (element) => element.textContent,
    );
    expect(shown).toEqual(["main for branch-feature"]);
    expect(container.querySelector("main")?.textContent).toBe("The rest of the frame");
    expect(reportedShellError(vi.mocked(console.error).mock.calls)?.message).toContain(
      '"SpendItem"',
    );
  });

  it("shows nothing for an item whose view fails to import, and keeps the others", async () => {
    const broken: BarItemContribution = {
      id: "spend",
      order: 20,
      view: "Item",
      load: async () => {
        throw new Error("chunk missing");
      },
    };
    const container = await renderItems([broken, item("branch", 10, "main")]);
    expect(container.querySelector("footer")?.textContent).toBe("main for branch-feature");
    expect(container.querySelector("main")?.textContent).toBe("The rest of the frame");
  });
});
