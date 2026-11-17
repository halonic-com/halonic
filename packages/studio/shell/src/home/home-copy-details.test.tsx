// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { ClipboardProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HomeCardContribution, HomeSection } from "../points/home.ts";
import type { Registered } from "../points/point-store.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { HomePage } from "./home-page.tsx";

beforeEach(() => {
  // React logs every error a boundary catches; here the failures are the point.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

/** A card whose view can't be imported, failing with `error`. */
function failing(id: HomeSection, error: Error): Registered<HomeCardContribution> {
  return {
    id,
    view: "Card",
    load: async () => {
      throw error;
    },
    featureId: `${id}-feature`,
  };
}

async function show(
  card: Registered<HomeCardContribution>,
  writeClipboard: (text: string) => Promise<boolean> = async () => true,
): Promise<HTMLElement> {
  const container = render(
    <ClipboardProvider writeClipboard={writeClipboard}>
      <HomePage cards={[card]} contextFor={() => ({}) as WorkspaceContext} />
    </ClipboardProvider>,
  );
  for (let turn = 0; turn < 3; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return container;
}

function buttons(container: HTMLElement): (string | null)[] {
  return [...container.querySelectorAll("button")].map((button) => button.textContent);
}

verifies("shell.home-copy-details", () => {
  it("offers Copy details for an error Halonic can't explain, and copies its message", async () => {
    const writeClipboard = vi.fn(async (_text: string) => true);
    const container = await show(
      failing("recent-runs", new KindedError("internal", "socket closed")),
      writeClipboard,
    );

    expect(buttons(container)).toEqual(["Try again", "Copy details"]);
    expect(container.textContent).not.toContain("socket closed");

    const copy = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Copy details",
    );
    await act(async () => copy?.click());
    const copied = writeClipboard.mock.calls[0]?.[0] ?? "";
    expect(copied).toContain("Couldn't load recent runs");
    expect(copied).toContain("socket closed");
  });

  it("offers no Copy details for a reason Halonic can explain", async () => {
    const container = await show(
      failing(
        "recent-runs",
        new KindedError("unavailable", "Halonic on your computer isn't answering."),
      ),
    );

    expect(container.textContent).toContain("Halonic on your computer isn't answering.");
    expect(buttons(container)).toEqual(["Try again"]);
  });
});
