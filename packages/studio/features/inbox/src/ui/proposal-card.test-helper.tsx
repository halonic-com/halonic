// Shared by the proposal card's test files. The mocks stay in the tests: only they may import vitest.
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { act } from "react";
import type { ProposalDecided, ProposalDecisions } from "../proposal-decisions.ts";
import type { ProposalItem } from "../proposal-items.ts";
import { render } from "../test-support/render.tsx";
import { ProposalCard } from "./proposal-card.tsx";

const finishedAt = new Date(2026, 10, 12, 6, 12);

export function proposal(fields: Partial<ProposalItem> = {}): ProposalItem {
  return {
    kind: "proposal",
    key: "proposal:run_mfx3k2a1_0001JD8Q",
    runId: "run_mfx3k2a1_0001JD8Q",
    changes: 2,
    items: ["support-triage"],
    itemNames: ["Support triage"],
    files: [
      { path: "notes/a.md", change: "modified", decision: "undecided" },
      { path: "notes/b.md", change: "added", decision: "undecided" },
    ],
    ending: "finished",
    since: finishedAt.toISOString(),
    ...fields,
  };
}

export const wrote = (undo: string): ProposalDecided => ({
  undo,
  changedSinceRun: [],
  cantBeWritten: [],
});

/** Renders the proposal page in its toast store, as the Inbox shows it. */
export function renderCard(
  decisions: ProposalDecisions | undefined,
  item: ProposalItem,
  onDecided: () => void,
) {
  const toasts = createToastStore();
  const root = render(
    <ToastStoreProvider store={toasts}>
      <ProposalCard
        item={item}
        now={new Date(2026, 10, 12, 9, 0)}
        facts={{ hubId: "support", workflow: "Support triage", startedBy: "a schedule" }}
        decisions={decisions}
        onDecided={onDecided}
        onOpenRun={() => {}}
      />
    </ToastStoreProvider>,
  );
  return { root, toasts };
}

/**
 * The words a button shows: with a `busyLabel` the kit keeps both copies in the button and hides the
 * one not in use with `invisible`, which screen readers skip too.
 */
export function shownText(element: Element | null | undefined): string | undefined {
  const copy = element?.cloneNode(true);
  if (!(copy instanceof Element)) return undefined;
  for (const hidden of copy.querySelectorAll(".invisible")) hidden.remove();
  return copy.textContent?.trim();
}

export function buttons(root: HTMLElement, name: string): HTMLButtonElement[] {
  return [...root.querySelectorAll("button")].filter((b) => shownText(b) === name);
}

export async function press(button: HTMLButtonElement | undefined) {
  await act(async () => button?.click());
}
