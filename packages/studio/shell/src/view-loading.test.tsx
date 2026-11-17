// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PageErrorBoundary } from "./page/page-error-boundary.tsx";
import { render, unmountAll } from "./test-support/render.tsx";
import type { ViewRef } from "./view.ts";
import { LoadedView } from "./view-loading.tsx";

beforeEach(() => {
  vi.useFakeTimers();
  // React logs every error a boundary catches; here the failures are the point.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function AgentsPage({ count }: { readonly count: number }) {
  return <h1>{`Agents (${count})`}</h1>;
}

/** A view whose imports answer when the test says so, each import a new request. */
function pendingView(): {
  readonly view: ViewRef;
  readonly imports: () => number;
  readonly arrive: () => Promise<void>;
  readonly fail: () => Promise<void>;
} {
  const waiting: { resolve: (module: object) => void; reject: (error: unknown) => void }[] = [];
  const view: ViewRef = {
    view: "AgentsPage",
    load: () => new Promise((resolve, reject) => waiting.push({ resolve, reject })),
  };
  return {
    view,
    imports: () => waiting.length,
    arrive: () => act(async () => (waiting.at(-1) as (typeof waiting)[0]).resolve({ AgentsPage })),
    fail: () =>
      act(async () =>
        (waiting.at(-1) as (typeof waiting)[0]).reject(new TypeError("Failed to fetch")),
      ),
  };
}

function renderAgents(view: ViewRef): HTMLElement {
  return render(
    <PageErrorBoundary pageKey="agents" pageName="Agents">
      <LoadedView view={view} name="Agents" props={{ count: 2 }} />
    </PageErrorBoundary>,
  );
}

async function wait(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function status(container: HTMLElement): string {
  return container.querySelector('[role="status"]')?.textContent ?? "";
}

function skeletonRows(container: HTMLElement): number {
  return container.querySelector('[aria-busy="true"] > [aria-hidden="true"]')?.children.length ?? 0;
}

function button(container: HTMLElement, name: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find((b) => b.textContent === name);
}

verifies("shell.view-loading-state", () => {
  it("shows nothing for 300ms, then skeleton rows read as Loading Agents, then the page", async () => {
    const agents = pendingView();
    const container = renderAgents(agents.view);
    await wait(299);
    expect(skeletonRows(container)).toBe(0);
    expect(status(container)).toBe("");

    await wait(1);
    expect(skeletonRows(container)).toBe(3);
    expect(status(container)).toBe("Loading Agents");

    await agents.arrive();
    expect(container.querySelector("h1")?.textContent).toBe("Agents (2)");
    expect(status(container)).toBe("");
  });

  it("says Still loading after 10 seconds, and Try again imports again and waits 10 seconds more", async () => {
    const agents = pendingView();
    const container = renderAgents(agents.view);
    await wait(9_999);
    expect(button(container, "Try again")).toBeUndefined();
    await wait(1);
    expect(status(container)).toBe("Still loading");
    expect(container.textContent).toContain("Still loading");
    expect(skeletonRows(container)).toBe(3);

    await act(async () => (button(container, "Try again") as HTMLButtonElement).click());
    expect(agents.imports()).toBe(2);
    expect(skeletonRows(container)).toBe(3);
    expect(status(container)).toBe("Loading Agents");
    expect(document.activeElement?.contains(container.querySelector('[role="status"]'))).toBe(true);
    await wait(9_999);
    expect(button(container, "Try again")).toBeUndefined();
    await wait(1);
    expect(button(container, "Try again")).toBeDefined();

    await agents.arrive();
    expect(container.querySelector("h1")?.textContent).toBe("Agents (2)");
  });

  it("imports the view again on Reload page after its first import failed", async () => {
    const agents = pendingView();
    const container = renderAgents(agents.view);
    await agents.fail();
    expect(container.querySelector("h2")?.textContent).toBe("This page stopped working");

    await act(async () => (button(container, "Reload page") as HTMLButtonElement).click());
    expect(agents.imports()).toBe(2);
    await agents.arrive();
    expect(container.querySelector("h1")?.textContent).toBe("Agents (2)");
  });
});
