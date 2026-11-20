// @vitest-environment jsdom

import type { RunEvent, RunSummary } from "@halonicjs/events";
import { RunsList, type RunsSource } from "@halonicjs/studio-feature-runs/api";
import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import type { InboxRequests } from "../request/inbox-requests.ts";
import { waitingRun } from "../test-runs.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const support = {
  key: "support/support-reply",
  name: "Support reply",
  label: "Answer a customer's email",
};

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

/** The Runs list's source: one Acme hub, Support reply, and Ollama as a local provider. */
function fakeRunsSource() {
  let summaries: readonly RunSummary[] = [];
  let logs: Readonly<Record<string, readonly RunEvent[]>> = {};
  const listeners = new Set<() => void>();
  const source: RunsSource = {
    list: async () => summaries.map((summary) => ({ summary })),
    log: async (runId) => [...(logs[runId] ?? [])],
    workflow: () => ({ name: "Support reply", stepDescription: () => undefined }),
    routine: () => undefined,
    runnableWorkflows: async () => [
      { hubId: "support", id: "support-reply", name: "Support reply", command: "support-reply" },
    ],
    providerKind: (id) => (id === "ollama" ? "local" : undefined),
    currency: () => "EUR",
    monthlyBudget: () => undefined,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const change = (
    next: readonly RunSummary[],
    nextLogs: Readonly<Record<string, readonly RunEvent[]>> = {},
  ) => {
    summaries = next;
    logs = nextLogs;
    for (const listener of listeners) listener();
  };
  return { source, change };
}

/** A phone's Inbox whose request starts the run `r9`, with the request sheet open. */
async function openSheet() {
  const requests: InboxRequests = {
    offered: async () => [support],
    subscribe: () => () => {},
    start: async () => ({ runId: "r9", hubId: "acme" }),
  };
  const runsSource = fakeRunsSource();
  const openRun = vi.fn();
  const root = render(
    <ToastStoreProvider store={createToastStore()}>
      <PresentationProvider presentation="phone">
        <InboxView
          inbox={new Inbox(fakeRuns([]).runs)}
          requests={requests}
          runs={new RunsList(runsSource.source)}
          openRun={openRun}
        />
      </PresentationProvider>
    </ToastStoreProvider>,
  );
  await settled();
  await act(async () => button(root, "New request").click());
  return { root, runs: runsSource, openRun };
}

function button(root: HTMLElement, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((b) => b.textContent?.startsWith(name));
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

function message(root: HTMLElement): HTMLTextAreaElement {
  const found = root.querySelector("textarea");
  if (found === null) throw new Error("no Message field");
  return found;
}

async function sendRequest(root: HTMLElement) {
  await act(async () => {
    const field = message(root);
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    set?.call(field, "Hi, my order arrived damaged.");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => button(root, "Send").click());
  await settled();
}

function submit(root: HTMLElement): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>('dialog button[type="submit"]');
}

/** `r9` as the Runs list holds it once it has ended. */
function ended(status: "failed" | "completed", fields: Partial<RunSummary> = {}): RunSummary {
  return waitingRun("r9", {
    status,
    state: null,
    accepts: [],
    endedAt: "2026-11-10T10:00:12.000Z",
    ...fields,
  });
}

/** The log of a run that couldn't reach Ollama at its first model call. */
const ollamaUnreachable: RunEvent[] = [
  { type: "llm.request", agent: "replier", provider: "ollama", model: "llama3.2", messages: 1 },
  {
    type: "run.failed",
    state: "draft",
    error: "no model reachable",
    reason: "model-unreachable",
    host: "localhost:11434",
  },
].map((body, index) => ({
  ...body,
  runId: "r9",
  seq: index + 2,
  at: "2026-11-10T10:00:12.000Z",
})) as RunEvent[];

verifies("inbox.request-run-end", () => {
  it("names Close plain while the sheet waits on a sent request", async () => {
    const { root } = await openSheet();
    expect(
      root.querySelector('dialog button[aria-label="Close, keeps your message"]'),
    ).not.toBeNull();
    await sendRequest(root);
    expect(submit(root)?.getAttribute("aria-busy")).toBe("true");
    expect(root.querySelector('dialog button[aria-label="Close"]')).not.toBeNull();
  });

  it("stops waiting when the run fails before its card, with the run page's line and Open run", async () => {
    const { root, runs, openRun } = await openSheet();
    await sendRequest(root);
    await act(async () =>
      runs.change([ended("failed", { reason: "model-unreachable", error: "no model reachable" })], {
        r9: ollamaUnreachable,
      }),
    );
    await settled();
    expect(submit(root)?.getAttribute("aria-busy")).toBeNull();
    const alert = root.querySelector('dialog [role="alert"]');
    expect(alert?.textContent).toContain(
      "Halonic couldn't reach Ollama on your computer (localhost:11434) for the model llama3.2. Start Ollama there, then run again.",
    );
    // The message stays and can be changed, so Send can try again; Close keeps it again.
    expect(message(root).value).toBe("Hi, my order arrived damaged.");
    expect(message(root).readOnly).toBe(false);
    expect(
      root.querySelector('dialog button[aria-label="Close, keeps your message"]'),
    ).not.toBeNull();
    await act(async () => button(alert as HTMLElement, "Open run").click());
    expect(openRun).toHaveBeenCalledWith("acme", "r9");
  });

  it("closes the sheet when the run finishes without a card, and focus goes to New request", async () => {
    const { root, runs } = await openSheet();
    await sendRequest(root);
    await act(async () => runs.change([ended("completed")]));
    await settled();
    expect(root.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(button(root, "New request"));
    // The text was sent, so the next request starts empty.
    await act(async () => button(root, "New request").click());
    expect(message(root).value).toBe("");
  });

  it("keeps waiting while the run still runs", async () => {
    const { root, runs } = await openSheet();
    await sendRequest(root);
    await act(async () => runs.change([waitingRun("r9", { status: "running", accepts: [] })]));
    await settled();
    expect(submit(root)?.getAttribute("aria-busy")).toBe("true");
    expect(message(root).readOnly).toBe(true);
  });
});
