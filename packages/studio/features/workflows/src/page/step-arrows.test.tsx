// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { WorkflowArrowChange, WorkflowsHost, WorkflowView } from "../api.ts";
import { buttonNamed, memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";
import { WorkflowScreen } from "./workflow-page.tsx";

// jsdom has no popover: a menu closes itself after a pick by hiding it.
beforeAll(() => {
  HTMLElement.prototype.hidePopover ??= () => {};
});
afterEach(unmount);

/** Support reply: `sort` goes to `approve` for a refund, else to `write`; `approve` waits. */
const reply: WorkflowView = {
  hubId: "acme",
  id: "reply",
  name: "Support reply",
  initial: "sort",
  steps: [
    { id: "sort", type: "task" },
    { id: "approve", type: "wait" },
    { id: "write", type: "task" },
    { id: "done", type: "final" },
  ],
  arrows: [
    { from: "sort", to: "approve", condition: { equals: ["{{context.category}}", "refund"] } },
    { from: "sort", to: "write" },
    { from: "approve", to: "write", event: "approved" },
    { from: "approve", to: "done", after: "2d" },
    { from: "write", to: "done" },
  ],
  layout: {},
};

type ChangeArrows = NonNullable<WorkflowsHost["changeArrows"]>;

/**
 * The page over a host whose arrows change as the file would: an added arrow comes last, a moved
 * one swaps places. `fail` makes every change fail instead.
 */
async function showPage({ fail = false } = {}) {
  let view = reply;
  const changeArrows = vi.fn<ChangeArrows>(async (_ref, stepId, change) => {
    if (fail) throw new KindedError("invalid_input", "The file can't be changed.");
    view = { ...view, arrows: changedArrows(view.arrows, stepId, change) };
    notify([]);
  });
  const { host, change: notify } = memoryHost([], [], [], [], {
    read: async () => view,
    changeStep: async () => {},
    changeArrows,
  });
  const announce = vi.fn();
  const toasts = createToastStore();
  const page = await show(
    <ToastStoreProvider store={toasts}>
      <WorkflowScreen
        host={host}
        runs={memoryRuns().source}
        hubId="acme"
        id="reply"
        announce={announce}
      />
    </ToastStoreProvider>,
  );
  return { page, changeArrows, announce, toasts };
}

function changedArrows(
  arrows: WorkflowView["arrows"],
  stepId: string,
  change: WorkflowArrowChange,
): WorkflowView["arrows"] {
  const own = arrows.filter((arrow) => arrow.from === stepId);
  const others = arrows.filter((arrow) => arrow.from !== stepId);
  if (change.kind === "add") return [...others, ...own, { from: stepId, to: change.to }];
  const moved = [...own];
  const [arrow] = moved.splice(change.index, 1);
  if (arrow !== undefined) moved.splice(change.index + change.by, 0, arrow);
  return [...others, ...moved];
}

async function pick(page: HTMLElement, stepId: string) {
  const card = [...page.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(
    (one) => one.querySelector("[title]")?.textContent === stepId,
  );
  await act(async () => card?.click());
}

/** The arrows section of the docked card, and its numbered rows' text. */
function arrowsSection(page: HTMLElement) {
  const section = [...page.querySelectorAll<HTMLElement>("aside section")].find(
    (one) => one.querySelector("h3")?.textContent === "Arrows (first match wins)",
  );
  // A row's words are its spans; its ⋮ menu holds words of its own.
  const rows = [...(section?.querySelectorAll("li") ?? [])].map((row) =>
    [...row.querySelectorAll(":scope > span")].map((span) => span.textContent).join(" "),
  );
  return { section, rows };
}

/** Opens the ⋮ named `trigger` and gives its items. */
function openMenu(page: HTMLElement, trigger: string): HTMLElement[] {
  const button = page.querySelector<HTMLElement>(`button[aria-label="${trigger}"]`);
  act(() => button?.click());
  const menu = document.getElementById(button?.getAttribute("popovertarget") ?? "");
  return [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
}

async function menuPick(page: HTMLElement, trigger: string, entry: string) {
  const item = openMenu(page, trigger).find((each) => each.textContent === entry);
  await act(async () => item?.click());
}

async function goTo(page: HTMLElement, stepId: string) {
  const picker = page.querySelector<HTMLSelectElement>('aside select[aria-label="Go to…"]');
  await act(async () => {
    if (picker === null) return;
    picker.value = stepId;
    picker.dispatchEvent(new Event("change", { bubbles: true }));
  });
  return picker;
}

verifies("workflows.page.step-arrows", () => {
  it("numbers the step's arrows in file order, with their event, timer and condition", async () => {
    const { page } = await showPage();

    await pick(page, "sort");
    expect(arrowsSection(page).rows).toEqual([
      "1 → approve on done if category = refund",
      "2 → write on done",
    ]);

    await pick(page, "approve");
    expect(arrowsSection(page).rows).toEqual(["1 → write on approved", "2 → done after 2d"]);
  });

  it("has no arrows section on an end step", async () => {
    const { page } = await showPage();
    await pick(page, "done");
    expect(arrowsSection(page).section).toBeUndefined();
  });

  it("moves an arrow from its ⋮, keeping focus on its row, and says where it is now", async () => {
    const { page, changeArrows, announce } = await showPage();
    await pick(page, "sort");

    await menuPick(page, "More actions for arrow 2", "Move up");

    expect(changeArrows).toHaveBeenCalledWith(expect.objectContaining({ id: "reply" }), "sort", {
      kind: "move",
      index: 1,
      by: -1,
    });
    expect(arrowsSection(page).rows[0]).toBe("1 → write on done");
    expect(announce).toHaveBeenCalledWith("Arrow 2 is now first.");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("More actions for arrow 1");
  });

  it("offers Move up only below the first arrow and Move down only above the last", async () => {
    const { page } = await showPage();
    await pick(page, "sort");

    const entries = openMenu(page, "More actions for arrow 1").map((one) => [
      one.textContent,
      one.getAttribute("aria-disabled") === "true",
    ]);
    expect(entries).toEqual([
      ["Move up", true],
      ["Move down", false],
    ]);
  });

  it("adds an arrow on done to the step picked in Go to…, and says so", async () => {
    const { page, changeArrows, announce } = await showPage();
    await pick(page, "sort");

    const picker = await goTo(page, "done");
    await act(async () => buttonNamed(page, "Add")?.click());

    expect(changeArrows).toHaveBeenCalledWith(expect.anything(), "sort", {
      kind: "add",
      to: "done",
    });
    expect(arrowsSection(page).rows[2]).toBe("3 → done on done");
    expect(announce).toHaveBeenCalledWith("Arrow added: sort to done.");
    expect(picker?.value).toBe("");
  });

  it("puts focus on Go to… when Add is pressed with no step picked, and adds nothing", async () => {
    const { page, changeArrows } = await showPage();
    await pick(page, "sort");

    await act(async () => buttonNamed(page, "Add")?.click());

    expect(changeArrows).not.toHaveBeenCalled();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Go to…");
  });

  it("says why on a toast when the arrows can't change, and announces nothing", async () => {
    const { page, announce, toasts } = await showPage({ fail: true });
    await pick(page, "sort");

    await goTo(page, "done");
    await act(async () => buttonNamed(page, "Add")?.click());

    expect(toasts.list()).toEqual([
      expect.objectContaining({ title: "Couldn't change step sort", tone: "danger" }),
    ]);
    expect(announce).not.toHaveBeenCalled();
    expect(arrowsSection(page).rows).toHaveLength(2);
  });

  it("lists the steps with arrows in, each opening its step's card", async () => {
    const { page } = await showPage();
    await pick(page, "write");

    const from = [...page.querySelectorAll<HTMLButtonElement>("aside section button")].filter(
      (button) => button.textContent?.startsWith("From "),
    );
    expect(from.map((button) => button.textContent)).toEqual(["From sort", "From approve"]);

    await act(async () => from[1]?.click());
    expect(page.querySelector("aside h2")?.textContent).toBe("Step approve");
  });
});
