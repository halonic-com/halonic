// Shared by the wait card's test files.
import { act } from "react";
import type { WaitItem } from "../inbox-items.ts";
import { inboxItems } from "../inbox-items.ts";
import { waitingRun } from "../test-runs.test-helper.ts";
import { renderWithUpdate } from "../test-support/render.tsx";
import { WaitCard, type WaitCardProps } from "./wait-card.tsx";

// Local times, so the test reads the same in every time zone. Tue 10 Nov 2026.
const waitingSinceAt = new Date(2026, 10, 10, 10, 40);

/** A run waiting on a review step, with `fields` set on its summary. */
export function reviewItem(fields: Parameters<typeof waitingRun>[1] = {}): WaitItem {
  const [item] = inboxItems([
    waitingRun("r43", {
      waitingFor: {
        title: "Approve this reply?",
        body: "Hi Sam, your refund is on its way.\nSee [our policy](https://evil.example) <script>alert(1)</script>",
      },
      lastWaitingAt: waitingSinceAt.toISOString(),
      ...fields,
    }),
  ]);
  if (item?.kind !== "wait") throw new Error("expected a wait item");
  return item;
}

/** Renders a wait card three minutes after the run started waiting; `later` moves its clock on. */
export function openCard(overrides: Partial<WaitCardProps> = {}) {
  const clock = { now: new Date(2026, 10, 10, 10, 43) };
  const sent: string[] = [];
  const props: WaitCardProps = {
    item: reviewItem(),
    decisions: {
      answer: async (_item, event) => {
        sent.push(event);
        return waitingRun("r43");
      },
    },
    onOpenRun: () => {},
    next: null,
    back: null,
    now: () => clock.now,
    ...overrides,
  };
  const { container: root, update } = renderWithUpdate(<WaitCard {...props} />);
  const later = (seconds: number) => {
    clock.now = new Date(clock.now.getTime() + seconds * 1000);
  };
  const rerender = (changes: Partial<WaitCardProps>) =>
    update(<WaitCard {...props} {...changes} />);
  return { root, sent, later, rerender };
}

/** The first button under `root` whose text starts with `name`. */
export function button(root: HTMLElement, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((b) => b.textContent?.startsWith(name));
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

/** Presses `target` as a pointer would. */
export async function press(target: HTMLElement) {
  await act(async () => {
    target.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    target.click();
  });
}
