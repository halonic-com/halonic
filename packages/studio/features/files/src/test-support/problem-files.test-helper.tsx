/**
 * The workspace's shared list of files with errors, for the tests of the problem count and Home's
 * Problems: two files, a list a test changes as a save would, and a view rendered with a context
 * that gives it. Shipped code may not import vitest, so a test passes its `vi.fn` in.
 */
import { PresentationProvider } from "@halonicjs/studio-kit";
import {
  type FilesWithErrorsSource,
  type FileWithErrors,
  limitedLookup,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
import { act, type ReactNode } from "react";
import { filesFeature } from "../feature.ts";
import { render } from "./render.tsx";

/** An agent whose file didn't load, with its first error on line 2. */
export const sorter: FileWithErrors = {
  path: "hubs/support/agents/sorter.agent.yaml",
  kind: "agent",
  hub: "support",
  id: "sorter",
  name: "Sorter",
  loaded: false,
  firstError: { line: 2, col: 7, reason: 'A value has ": " in it. Put the value in quotes.' },
  errors: 1,
};

/** A workflow with three errors, the first on line 11. */
export const weekly: FileWithErrors = {
  path: "hubs/reports/workflows/weekly-report.workflow.yaml",
  kind: "workflow",
  hub: "reports",
  id: "weekly-report",
  name: "weekly-report.workflow.yaml",
  loaded: false,
  firstError: { line: 11, col: 3, reason: "options needs at least one choice." },
  errors: 3,
};

/** A shared list whose files a test sets, telling its listeners as a save would. */
export function listOf(start: readonly FileWithErrors[]) {
  let files = start;
  const listeners = new Set<() => void>();
  let reads = 0;
  const source: FilesWithErrorsSource = {
    list: async () => {
      reads++;
      return files;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const save = async (next: readonly FileWithErrors[]) => {
    files = next;
    for (const listener of listeners) listener();
    await settled();
  };
  return { source, save, reads: () => reads };
}

/** Lets the list's reads and React's updates settle. */
export async function settled(): Promise<void> {
  for (let turn = 0; turn < 3; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** A test's `vi.fn`, which records the calls of `openItem` and `announceState`. */
type MakeSpy<Spy> = () => Spy;

/** The context the Files feature's views get, giving `source` as the shared list. */
export function contextOf<Spy>(spy: MakeSpy<Spy>, source: FilesWithErrorsSource) {
  const openItem = spy();
  const announceState = spy();
  const context = {
    services: limitedLookup(filesFeature, { get: () => source }),
    announcer: { announce: () => {}, announceState },
    openItem,
  } as unknown as WorkspaceContext;
  return { context, openItem, announceState };
}

/** Renders `view` with a context that gives `source`, on the desktop or a phone. */
export async function show<Spy>(
  spy: MakeSpy<Spy>,
  source: FilesWithErrorsSource,
  view: (context: WorkspaceContext) => ReactNode,
  presentation: "desktop" | "phone" = "desktop",
) {
  const { context, openItem, announceState } = contextOf(spy, source);
  const page = render(
    <PresentationProvider presentation={presentation}>{view(context)}</PresentationProvider>,
  );
  await settled();
  return { page, openItem, announceState, context };
}
