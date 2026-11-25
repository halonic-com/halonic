// @vitest-environment jsdom

import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import type { ItemChangeToReview, ItemReview } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { WorkflowsHost } from "../api.ts";
import { reply } from "../page/page-fixtures.ts";
import { WorkflowScreen } from "../page/workflow-page.tsx";
import type { WorkflowReviewHost } from "../review-api.ts";
import { buttonNamed, memoryHost, memoryRuns, show, typeInto, unmount } from "../test-support.tsx";

afterEach(unmount);

const nameChange: ItemChangeToReview = {
  id: "field:name",
  sentence: "Name: Reply → Support reply",
  important: false,
  parts: [["name"]],
  before: { value: "Reply" },
};
const writeChange: ItemChangeToReview = {
  id: "step:write",
  sentence: "Step changed: Write (agent)",
  important: false,
  parts: [["states", "write"]],
  before: { value: { type: "task", agent: "drafter" } },
};
/** No value before it, so the step on the canvas reads as added. */
const writeAdded: ItemChangeToReview = {
  id: "step:write",
  sentence: "Step added: Write",
  important: false,
  parts: [["states", "write"]],
};
const checkAdded: ItemChangeToReview = {
  id: "step:check",
  sentence: "Step added: Check",
  important: false,
  parts: [["states", "check"]],
};
const startToCheck: ItemChangeToReview = {
  id: "step:start",
  sentence: "Step changed: Start (next steps)",
  important: false,
  parts: [["states", "start"]],
  needs: ["step:check"],
};
const path = "hubs/acme/workflows/reply.workflow.yaml";
const reviewOf = (changes: ItemChangeToReview[], more: Partial<ItemReview> = {}): ItemReview => ({
  path,
  whole: false,
  created: false,
  changes,
  seen: "seen" as ItemReview["seen"],
  ...more,
});

/** The app's review, as a test sets it; `set` tells the page, as the app does after a write. */
function fakeReview(first: ItemReview) {
  let current: ItemReview | null = first;
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
  } satisfies WorkflowReviewHost;
  const set = async (next: ItemReview | null) => {
    current = next;
    await act(async () => {
      for (const listener of listeners) listener();
    });
  };
  return { host, undo, set };
}

async function showPage(
  review: WorkflowReviewHost | undefined,
  more: { openFileAt?: (path: string, line: number) => void; host?: Partial<WorkflowsHost> } = {},
) {
  const { host } = memoryHost([], [], [reply], [], more.host);
  const toasts = createToastStore();
  const announce = vi.fn();
  const page = await show(
    <ToastStoreProvider store={toasts}>
      <WorkflowScreen
        host={host}
        runs={memoryRuns().source}
        hubId="acme"
        id="reply"
        review={review}
        announce={announce}
        {...(more.openFileAt && { openFileAt: more.openFileAt })}
      />
    </ToastStoreProvider>,
  );
  return { page, toasts, announce };
}

const click = (button: HTMLElement | null | undefined) => act(async () => button?.click());
const mark = (page: HTMLElement, id: string) =>
  page.querySelector<HTMLElement>(`[data-change-id="${id}"]`);
const card = (page: HTMLElement, step: string) => page.querySelector(`[data-step="${step}"]`);
const accept = (page: HTMLElement, id: string) => mark(page, id)?.querySelector("button");

verifies("workflows.review.changes-to-review", () => {
  it("shows the bar, and Next picks the change's step with the focus on its mark", async () => {
    const { page } = await showPage(fakeReview(reviewOf([nameChange, writeChange])).host);
    expect(page.textContent).toContain("The assistant changed 2 things here");
    expect(card(page, "write")?.className).toContain("border-s-accent");
    expect(mark(page, "field:name")).not.toBeNull();
    expect(mark(page, "step:write")).toBeNull();

    await click(buttonNamed(page, "Next"));

    expect(card(page, "write")?.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(mark(page, "step:write"));
  });

  it("edges an added step's card in success, 2px as ChangeMark draws it", async () => {
    const { page } = await showPage(fakeReview(reviewOf([writeAdded])).host);

    const classes = card(page, "write")?.classList;
    expect(classes?.contains("border-s-2")).toBe(true);
    expect(classes?.contains("border-s-success")).toBe(true);
    expect(classes?.contains("border-s-4")).toBe(false);
  });

  it("accepts one change with a toast whose Undo takes it back", async () => {
    const review = fakeReview(reviewOf([nameChange, writeChange]));
    const { page, toasts } = await showPage(review.host);

    await click(accept(page, "field:name"));

    expect(review.host.accept).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "change", change: nameChange }),
    );
    const [toast] = toasts.list();
    expect(toast?.title).toBe("Accepted 1 change in Support reply");
    await act(async () => toast?.action?.onClick());
    expect(review.undo).toHaveBeenCalledOnce();
  });

  it("names the changes a decision takes along, and counts them in its toast", async () => {
    const review = fakeReview(reviewOf([startToCheck, checkAdded]));
    const { page, toasts } = await showPage(review.host);
    // `check` isn't on the canvas the page read, so its mark is above it, as a removed step's is.
    expect(mark(page, "step:check")?.textContent).toContain(
      "Rejecting this also rejects “Step changed: Start (next steps)”",
    );

    // Picking a changed step on the canvas shows its mark too.
    await click(card(page, "start") as HTMLElement);
    expect(mark(page, "step:start")?.textContent).toContain(
      "Accepting this also accepts “Step added: Check”",
    );
    await click(accept(page, "step:start"));

    expect(toasts.list()[0]?.title).toBe("Accepted 2 changes in Support reply");
  });

  it("offers Reject and delete file on a workflow the assistant created", async () => {
    const created = { id: "item", sentence: "New", important: false, parts: [] };
    const { page } = await showPage(
      fakeReview(reviewOf([created], { whole: true, created: true })).host,
    );

    expect(mark(page, "item")).not.toBeNull();
    expect(buttonNamed(page, "Reject and delete file")).toBeDefined();
  });

  it("waits for Compare when the file changed outside Halonic", async () => {
    const review = fakeReview(reviewOf([nameChange, writeChange]));
    review.host.accept.mockResolvedValueOnce({ status: "held" } as never);
    const openFileAt = vi.fn();
    const { page } = await showPage(review.host, { openFileAt });

    await click(buttonNamed(page, "Accept all"));

    expect(page.textContent).toContain("Changed outside Halonic");
    await click(buttonNamed(page, "Compare"));
    expect(openFileAt).toHaveBeenCalledWith(path, 1);
  });

  it("says politely when an edit accepted a change", async () => {
    const review = fakeReview(reviewOf([nameChange, writeChange]));
    const rename = vi.fn(async () => {});
    const { page, announce } = await showPage(review.host, { host: { rename } });
    const field = page.querySelector<HTMLInputElement>('h1 input[aria-label="Workflow name"]');
    act(() => field?.focus());

    await typeInto(field as HTMLInputElement, "Support answers");
    await act(async () => {
      field?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(rename).toHaveBeenCalledOnce();
    await review.set(reviewOf([writeChange]));

    expect(announce).toHaveBeenCalledWith("Change accepted by your edit", "polite");
  });

  it("shows no bar and no marks where the app has no changes to review", async () => {
    const { page } = await showPage(undefined);
    expect(page.textContent).not.toContain("The assistant changed");
    expect(page.querySelector("[data-change-id]")).toBeNull();
  });
});

/** What a screen reader hears after an element's name: its description, read from its ids. */
const description = (element: Element | null) =>
  (element?.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent)
    .join(" ");

verifies("workflows.review.step-card-words", () => {
  it("says in a step card's description that the assistant changed or added it", async () => {
    const { page } = await showPage(fakeReview(reviewOf([writeChange])).host);
    expect(description(card(page, "write"))).toContain("Changed by the assistant, to review");
    unmount();

    const added = await showPage(fakeReview(reviewOf([writeAdded])).host);
    expect(description(card(added.page, "write"))).toContain("Added by the assistant, to review");
  });

  it("says nothing of the kind on a card the assistant didn't change", async () => {
    const { page } = await showPage(fakeReview(reviewOf([writeChange])).host);
    expect(description(card(page, "start"))).not.toContain("by the assistant");
  });
});
