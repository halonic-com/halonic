import {
  ClipboardProvider,
  createToastStore,
  PresentationProvider,
  type ToastStore,
  ToastStoreProvider,
} from "@halonicjs/studio-kit";
import { act } from "react";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import type { InboxRequests, RequestWorkflow } from "../request/inbox-requests.ts";
import { pendingApproval, waitingRun } from "../test-runs.test-helper.ts";
import { render } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

// The request form's tests share these: two workflows, the Inbox page around a fake start, and the form's controls.

export const support: RequestWorkflow = {
  key: "support/support-reply",
  name: "Support reply",
  label: "Answer a customer's email",
  description: 'A customer\'s email, for example: "Hi, my order #1042 arrived damaged."',
};
export const travel: RequestWorkflow = {
  key: "ops/book-travel",
  name: "Book travel",
  label: "Book travel",
};

export async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Requests that offer `offered` and start a run with `start`. */
export function requestsStarting(
  offered: readonly RequestWorkflow[],
  start: InboxRequests["start"],
): InboxRequests {
  return { offered: async () => offered, subscribe: () => () => {}, start };
}

export async function open(
  requests: InboxRequests | undefined,
  options: {
    phone?: boolean;
    openRun?: (hubId: string, runId: string) => void;
    openBudget?: () => void;
    writeClipboard?: (text: string) => Promise<boolean>;
  } = {},
) {
  const toasts: ToastStore = createToastStore();
  const waiting = waitingRun("r1", {
    approvals: [pendingApproval("call-1", "notes-mcp__create_note", new Date().toISOString())],
  });
  const runs = fakeRuns([waiting]);
  const inbox = new Inbox(runs.runs);
  const view = (
    <ToastStoreProvider store={toasts}>
      <InboxView
        inbox={inbox}
        requests={requests}
        openRun={options.openRun}
        openBudget={options.openBudget}
      />
    </ToastStoreProvider>
  );
  const shown = options.phone ? (
    <PresentationProvider presentation="phone">{view}</PresentationProvider>
  ) : (
    view
  );
  const root = render(
    options.writeClipboard === undefined ? (
      shown
    ) : (
      <ClipboardProvider writeClipboard={options.writeClipboard}>{shown}</ClipboardProvider>
    ),
  );
  await settled();
  return { root, toasts, runs, inbox };
}

export function message(root: HTMLElement): HTMLTextAreaElement {
  const found = root.querySelector("textarea");
  if (found === null) throw new Error("no Message field");
  return found;
}

export async function type(field: HTMLTextAreaElement, text: string) {
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    set?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export function button(root: HTMLElement, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((b) => b.textContent?.startsWith(name));
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

export async function send(root: HTMLElement) {
  await act(async () => {
    button(root, "Send").click();
  });
  await settled();
}
