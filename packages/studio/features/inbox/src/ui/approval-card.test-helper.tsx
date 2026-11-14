// Shared by the approval card's test files.
import { KindedError } from "@halonicjs/std";
import { act } from "react";
import type { ApprovalItem } from "../inbox-items.ts";
import { inboxItems } from "../inbox-items.ts";
import { pendingApproval, waitingRun } from "../test-runs.test-helper.ts";
import { render } from "../test-support/render.tsx";
import { ApprovalCard, type ApprovalCardProps } from "./approval-card.tsx";

// Local times, so the test reads the same in every time zone. Sun 8 Nov 2026.
export const askedAt = new Date(2026, 10, 8, 10, 42);

export function createNoteItem(
  args: unknown = { title: "Refund for Sam", body: "" },
): ApprovalItem {
  const approval = {
    ...pendingApproval("call-1", "notes-mcp__create_note", askedAt.toISOString()),
    args,
  };
  const [item] = inboxItems([waitingRun("r47", { approvals: [approval] })]);
  if (item?.kind !== "approval") throw new Error("expected an approval item");
  return item;
}

export const manual = () =>
  new KindedError(
    "unavailable",
    "Studio can't answer runs yet. Answer this one from the command line.",
    {
      fix: "halonic runs send 7k2m9p approve",
    },
  );

/** A clock the test moves, and a card on it. */
export function openCard(overrides: Partial<ApprovalCardProps> = {}) {
  const clock = { now: new Date(2026, 10, 8, 10, 43) };
  const sent: string[] = [];
  const props: ApprovalCardProps = {
    item: createNoteItem(),
    agentName: "Sorter",
    subagentName: null,
    decisions: {
      approve: async () => {
        sent.push("approve");
        return waitingRun("r47");
      },
      reject: async () => {
        sent.push("reject");
        return waitingRun("r47");
      },
      askForChanges: async (_item, note) => {
        sent.push(`note: ${note}`);
        return waitingRun("r47");
      },
    },
    onOpenRun: () => {},
    next: null,
    back: null,
    now: () => clock.now,
    ...overrides,
  };
  const root = render(<ApprovalCard {...props} />);
  const later = (seconds: number) => {
    clock.now = new Date(clock.now.getTime() + seconds * 1000);
  };
  return { root, sent, clock, later };
}

export function button(root: HTMLElement, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((b) => b.textContent?.startsWith(name));
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

/** A real pointer press: a press, then the click. */
export async function press(target: HTMLElement) {
  await act(async () => {
    target.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    target.click();
  });
}
