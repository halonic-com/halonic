// The docked step card's arrows section over a host whose arrows change as the file would.

import { KindedError } from "@halonicjs/std";
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { act } from "react";
import type { WorkflowArrowChange, WorkflowsHost, WorkflowView } from "../api.ts";
import { memoryHost, memoryRuns, show } from "../test-support.tsx";
import { WorkflowScreen } from "./workflow-page.tsx";

/** Support reply: `sort` goes to `approve` for a refund, else to `write`; `approve` waits. */
export const reply: WorkflowView = {
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
 * Wraps a host part so the test can check its calls. Tests pass vitest's `vi.fn`, which only test
 * files may import, so the helper sees the wrapped part as the part itself (see {@link spied}).
 */
export type Spy = (part: (...args: never[]) => unknown) => unknown;

/** `part` wrapped by `spy`, called the way `part` is. */
function spied<F extends (...args: never[]) => unknown>(spy: Spy, part: F): F {
  return spy(part) as F;
}

/**
 * The page over a host whose arrows change as the file would: an added arrow comes last, a moved
 * one swaps places. `fail` makes every change fail instead, `held` makes each change wait until
 * the returned `release` is called, and `canChangeArrows: false` leaves `changeArrows` out.
 * `spy` wraps the host's parts and `announce` so the test can check their calls.
 */
export async function showPage(
  spy: Spy,
  { fail = false, held = false, canChangeArrows = true, workflow = reply } = {},
) {
  let view = workflow;
  let release: () => void = () => {};
  const changeArrows = spied<ChangeArrows>(spy, async (_ref, stepId, change) => {
    if (held) await new Promise<void>((resolve) => (release = resolve));
    if (fail) throw new KindedError("invalid_input", "The file can't be changed.");
    view = { ...view, arrows: changedArrows(view.arrows, stepId, change) };
    notify([]);
  });
  const { host, change: notify } = memoryHost([], [], [], [], {
    read: async () => view,
    changeStep: async () => {},
    ...(canChangeArrows ? { changeArrows } : {}),
  });
  const announce = spied(spy, (_message: string) => {});
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
  return { page, changeArrows, announce, toasts, release: () => release() };
}

export function changedArrows(
  arrows: WorkflowView["arrows"],
  stepId: string,
  change: WorkflowArrowChange,
): WorkflowView["arrows"] {
  const own = arrows.filter((arrow) => arrow.from === stepId);
  const others = arrows.filter((arrow) => arrow.from !== stepId);
  if (change.kind === "add") return [...others, ...own, { from: stepId, to: change.to }];
  if (change.kind === "set") {
    const { index, field, value } = change;
    // A timer replaces the arrow's event, as the file's does.
    const timer = field === "after" && value !== undefined ? { event: undefined } : {};
    const set = own.map((arrow, at) =>
      at === index ? { ...arrow, [field]: value, ...timer } : arrow,
    );
    return [...others, ...set];
  }
  const moved = [...own];
  const [arrow] = moved.splice(change.index, 1);
  if (arrow !== undefined) moved.splice(change.index + change.by, 0, arrow);
  return [...others, ...moved];
}

export async function pick(page: HTMLElement, stepId: string) {
  const card = [...page.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(
    (one) => one.querySelector("[title]")?.textContent === stepId,
  );
  await act(async () => card?.click());
}

/** The arrows section of the docked card, and its numbered rows' text. */
export function arrowsSection(page: HTMLElement) {
  const section = [...page.querySelectorAll<HTMLElement>("aside section")].find(
    (one) => one.querySelector("h3")?.textContent === "Arrows (first match wins)",
  );
  // A row's words are its number and its button; its ⋮ menu holds words of its own.
  const rows = [...(section?.querySelectorAll("li") ?? [])].map((row) =>
    [
      row.querySelector(":scope > div > span")?.textContent,
      row.querySelector("button[aria-expanded]")?.textContent,
    ].join(" "),
  );
  return { section, rows };
}

/** Opens the ⋮ named `trigger` and gives its items. */
export function openMenu(page: HTMLElement, trigger: string): HTMLElement[] {
  const button = page.querySelector<HTMLElement>(`button[aria-label="${trigger}"]`);
  act(() => button?.click());
  const menu = document.getElementById(button?.getAttribute("popovertarget") ?? "");
  return [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
}

export async function menuPick(page: HTMLElement, trigger: string, entry: string) {
  const item = openMenu(page, trigger).find((each) => each.textContent === entry);
  await act(async () => item?.click());
}

export async function goTo(page: HTMLElement, stepId: string) {
  const picker = page.querySelector<HTMLSelectElement>('aside select[aria-label="Go to…"]');
  await act(async () => {
    if (picker === null) return;
    picker.value = stepId;
    picker.dispatchEvent(new Event("change", { bubbles: true }));
  });
  return picker;
}
