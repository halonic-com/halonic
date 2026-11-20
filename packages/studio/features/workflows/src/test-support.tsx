import type { RunSummary } from "@halonicjs/events";
import { KindedError } from "@halonicjs/std";
import type { RunsSource } from "@halonicjs/studio-feature-runs/api";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  WorkflowConfiguration,
  WorkflowHub,
  WorkflowListing,
  WorkflowRef,
  WorkflowsHost,
  WorkflowTests,
  WorkflowView,
} from "./api.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let element: HTMLElement | undefined;

/** Unmounts what {@link show} drew; call it in `afterEach`. */
export function unmount(): void {
  act(() => root?.unmount());
  element?.remove();
}

/** Draws `node` in the document and waits for what it reads. */
export async function show(node: React.ReactNode): Promise<HTMLElement> {
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
  await act(async () => root?.render(node));
  return element;
}

/** A listing with no problems and no runs, for a test to change what it cares about. */
export function listing(
  hubId: string,
  id: string,
  name: string,
  more: Partial<WorkflowListing> = {},
): WorkflowListing {
  return {
    hubId,
    id,
    name,
    problems: { errors: 0, warnings: 0 },
    runs: { waiting: 0, running: 0 },
    ...more,
  };
}

/** A host in memory that tells its listeners about each change, as the app's does. */
export function memoryHost(
  hubs: readonly WorkflowHub[],
  initial: readonly WorkflowListing[],
  views: readonly WorkflowView[] = [],
  configurations: readonly WorkflowConfiguration[] = [],
  overrides: Partial<WorkflowsHost> = {},
) {
  let listings = initial;
  const listeners = new Set<() => void>();
  const created: { name: string; hubId: string }[] = [];
  const madeListings: WorkflowListing[] = [];
  const host: WorkflowsHost = {
    hubs: () => hubs,
    list: async () => listings,
    read: async (ref) => {
      const view = views.find((one) => one.hubId === ref.hubId && one.id === ref.id);
      if (view === undefined) throw new KindedError("not_found", "This workflow isn't there.");
      return view;
    },
    nameOf: (ref) =>
      [...listings, ...madeListings].find((each) => each.hubId === ref.hubId && each.id === ref.id)
        ?.name,
    configuration: async (ref) => {
      const found = configurations.find((one) => one.hubId === ref.hubId && one.id === ref.id);
      if (found === undefined) throw new KindedError("not_found", "This workflow isn't there.");
      return found;
    },
    tests: async () => ({ cases: [] }) satisfies WorkflowTests,
    ...overrides,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    create: async (newWorkflow) => {
      created.push(newWorkflow);
      madeListings.push(listing(newWorkflow.hubId, "made", newWorkflow.name));
      return { hubId: newWorkflow.hubId, id: "made" } satisfies WorkflowRef;
    },
  };
  return {
    host,
    created,
    change: (next: readonly WorkflowListing[]) => {
      listings = next;
      for (const listener of listeners) listener();
    },
  };
}

/** The button with this text, or `undefined`. */
export function buttonNamed(page: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...page.querySelectorAll("button")].find((button) =>
    button.textContent?.trim().startsWith(text),
  );
}

/** Types into an input the way a person does, so React sees the change. */
export async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** jsdom has `<dialog>` but no `showModal()`; opening it is all the dialog tests need. */
export function openDialogsInJsdom(): void {
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
    close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  Element.prototype.scrollIntoView = () => {};
}

/** A run of Acme's `reply` workflow, running in `draft`, for a test to change what it cares about. */
export function runSummary(changes: Partial<RunSummary>): RunSummary {
  const minute = (at: number) => new Date(2026, 10, 9, 10, 40 + at).toISOString();
  return {
    id: "run_mfx3k2a1_01jd8q",
    hubId: "acme",
    workflowId: "reply",
    kind: "run",
    status: "running",
    state: "draft",
    startedAt: minute(0),
    endedAt: null,
    usage: { inputTokens: 0, outputTokens: 0 },
    cost: 0,
    unpricedCalls: 0,
    subscriptionCalls: 0,
    statesVisited: ["read", "draft"],
    context: {},
    error: null,
    reason: null,
    definitionsVersion: "v1",
    trigger: null,
    parentRunId: null,
    waitingOn: null,
    accepts: [],
    answerLabels: {},
    nextTimer: null,
    waitingFor: null,
    lastWaitingAt: null,
    approvals: [],
    signals: [],
    cantTry: [],
    lastSeq: 3,
    updatedAt: minute(1),
    ...changes,
  };
}

/** A runs source in memory: it lists `summaries` newest first and tells its listeners of a change. */
export function memoryRuns(summaries: readonly RunSummary[] = []) {
  let runs = summaries;
  let failure: Error | undefined;
  const listeners = new Set<() => void>();
  const source: RunsSource = {
    list: async () => {
      if (failure) throw failure;
      return runs.map((summary) => ({ summary }));
    },
    log: async () => [],
    workflow: () => ({ name: "Support reply", stepDescription: () => undefined }),
    routine: () => undefined,
    runnableWorkflows: async () => [
      { hubId: "acme", id: "reply", name: "Support reply", command: "reply" },
    ],
    providerKind: () => undefined,
    currency: () => "EUR",
    monthlyBudget: () => undefined,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    source,
    change: (next: readonly RunSummary[]) => {
      runs = next;
      for (const listener of listeners) listener();
    },
    failWith: (error: Error | undefined) => {
      failure = error;
    },
  };
}
