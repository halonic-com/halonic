// @vitest-environment jsdom

import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HomeCardContribution } from "../points/home.ts";
import type { Registered } from "../points/point-store.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";
import { HomePage } from "./home-page.tsx";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

/** Recent runs, whose rows never arrive, so it keeps showing its skeleton. */
function loadingRecentRuns(): Registered<HomeCardContribution> {
  const Card = () => {
    throw new Promise(() => undefined);
  };
  return { id: "recent-runs", view: "Card", load: async () => ({ Card }), featureId: "runs" };
}

function renderPhoneHome(cards: readonly Registered<HomeCardContribution>[]): HTMLElement {
  return render(
    <PresentationProvider presentation="phone">
      <HomePage cards={cards} contextFor={() => ({}) as WorkspaceContext} />
    </PresentationProvider>,
  );
}

async function wait(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

verifies("shell.phone-home", () => {
  it("keeps the h1 Home for screen readers, as the top bar shows the word", () => {
    const container = renderPhoneHome([]);
    const heading = container.querySelector("h1") as HTMLElement;
    expect(heading.textContent).toBe("Home");
    expect(heading.className).toBe("sr-only");
    expect(heading.tabIndex).toBe(-1);
  });

  it("runs the sections edge to edge, 8px apart", () => {
    const container = renderPhoneHome([]);
    const page = container.firstElementChild as HTMLElement;
    expect(page.className).toContain("gap-2");
    expect(page.className).not.toContain("px-6");
    expect(page.className).not.toContain("max-w-page");
  });

  it("shows two flush skeleton rows while a section loads", async () => {
    const container = renderPhoneHome([loadingRecentRuns()]);
    await wait(300);
    const skeleton = container.querySelector('section div[aria-hidden="true"]') as HTMLElement;
    expect(skeleton.children).toHaveLength(2);
    expect(skeleton.className).not.toContain("border");
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Loading Home");
  });
});
