// @vitest-environment jsdom

import type { ExpectedContent } from "@halonicjs/ports";
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { SAVE_PAUSE_MS } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen } from "../page/agent-page.tsx";
import type { AgentChangeToReview, AgentReview, AgentReviewHost } from "../review-api.ts";
import { buttonNamed, show, typeInto, unmount, viewPanel } from "../test-support.tsx";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const nameChange: AgentChangeToReview = {
  id: "field:name",
  sentence: "Name: Sorter old → Sorter",
  important: false,
  parts: [["name"]],
};
const modelChange: AgentChangeToReview = {
  id: "field:model",
  sentence: "Model: small → large",
  important: false,
  parts: [["model"]],
  before: { value: "small" },
};
const descriptionChange: AgentChangeToReview = {
  id: "field:description",
  sentence: "Description added",
  important: false,
  parts: [["description"]],
};
const reviewOf = (
  changes: AgentChangeToReview[],
  more: Partial<AgentReview> = {},
): AgentReview => ({
  path: "agents/sorter.agent.yaml",
  whole: false,
  created: false,
  changes,
  seen: "seen" as ExpectedContent,
  ...more,
});

/** The app's review, as a test sets it; `set` tells the page, as the app does after a write. */
function fakeReview(first: AgentReview | null) {
  let current = first;
  const listeners = new Set<() => void>();
  const undo = vi.fn(async () => "done" as const);
  const host = {
    changesIn: async () => current,
    accept: vi.fn(async () => ({ status: "done" as const, undo })),
    reject: vi.fn(async () => ({ status: "done" as const, undo })),
    subscribe: (_ref: unknown, listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } satisfies AgentReviewHost;
  const set = async (next: AgentReview | null) => {
    current = next;
    await act(async () => {
      for (const listener of listeners) listener();
    });
  };
  return { host, undo, set };
}

async function showPage(review: AgentReviewHost | undefined, more: { openFile?: () => void } = {}) {
  const toasts = createToastStore();
  const announce = vi.fn();
  const agents = memoryAgentsHost({
    hubs: [{ id: "acme", name: "acme" }],
    agents: [{ hubId: "acme", id: "sorter", name: "Sorter" }],
  });
  const page = await show(
    <ToastStoreProvider store={toasts}>
      <AgentScreen
        host={agents}
        hubId="acme"
        id="sorter"
        review={review}
        announce={announce}
        {...more}
      />
    </ToastStoreProvider>,
  );
  return { page, toasts, announce };
}

const click = (button: HTMLElement | undefined) => act(async () => button?.click());
const mark = (page: HTMLElement, id: string) => page.querySelector(`[data-change-id="${id}"]`);

verifies("agents.review.changes-to-review", () => {
  it("shows the bar, and Next opens the change's page with the focus on its mark", async () => {
    const { page } = await showPage(fakeReview(reviewOf([nameChange, modelChange])).host);
    expect(page.textContent).toContain("The assistant changed 2 things here");

    await click(buttonNamed(page, "Next"));

    expect(buttonNamed(page, "Model")?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(mark(page, "field:model"));
    expect(mark(page, "field:model")?.textContent).toContain("small");
  });

  it("accepts one change with a toast whose Undo takes it back", async () => {
    const review = fakeReview(reviewOf([descriptionChange, modelChange]));
    const { page, toasts } = await showPage(review.host);
    await click(buttonNamed(page, "Configuration"));

    const accept = mark(page, "field:description")?.querySelector("button");
    await click(accept ?? undefined);

    expect(review.host.accept).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "change", change: descriptionChange }),
    );
    const [toast] = toasts.list();
    expect(toast?.title).toBe("Accepted 1 change in Sorter");
    await act(async () => toast?.action?.onClick());
    expect(review.undo).toHaveBeenCalledOnce();
  });

  it("rejects every change at once with Reject all", async () => {
    const review = fakeReview(reviewOf([nameChange, modelChange]));
    const { page, toasts } = await showPage(review.host);

    await click(buttonNamed(page, "Reject all"));

    expect(review.host.reject).toHaveBeenCalledWith({
      kind: "all",
      path: "agents/sorter.agent.yaml",
    });
    expect(toasts.list()[0]?.title).toBe("Rejected 2 changes in Sorter");
  });

  it("offers Reject and delete file on a file the assistant created", async () => {
    const created = { id: "item", sentence: "New", important: false, parts: [] };
    const { page } = await showPage(
      fakeReview(reviewOf([created], { whole: true, created: true })).host,
    );
    await click(buttonNamed(page, "Configuration"));

    expect(mark(page, "item")).not.toBeNull();
    expect(buttonNamed(page, "Reject and delete file")).toBeDefined();
  });

  it("waits for Compare when the file changed outside Halonic", async () => {
    const review = fakeReview(reviewOf([nameChange, modelChange]));
    review.host.accept.mockResolvedValueOnce({ status: "held" } as never);
    const openFile = vi.fn();
    const { page } = await showPage(review.host, { openFile });

    await click(buttonNamed(page, "Accept all"));

    expect(page.textContent).toContain("Changed outside Halonic");
    await click(buttonNamed(page, "Compare"));
    expect(openFile).toHaveBeenCalledWith("agents/sorter.agent.yaml");
  });

  it("says politely when an edit accepted a change", async () => {
    const review = fakeReview(reviewOf([descriptionChange, modelChange]));
    const { page, announce } = await showPage(review.host);
    await click(buttonNamed(page, "Configuration"));

    await typeInto(viewPanel(page).querySelector("input") as HTMLInputElement, "Sorts mail");
    await act(async () => vi.advanceTimersByTime(SAVE_PAUSE_MS));
    await review.set(reviewOf([modelChange]));

    expect(announce).toHaveBeenCalledWith("Change accepted by your edit", "polite");
  });

  it("shows no bar where the app has no changes to review", async () => {
    const { page } = await showPage(undefined);
    expect(page.textContent).not.toContain("The assistant changed");
  });
});
