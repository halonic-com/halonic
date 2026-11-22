// @vitest-environment jsdom

import type { FilesWithErrorsSource, FileWithErrors } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkflowProblem, WorkflowView } from "../api.ts";
import { buttonNamed, memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";
import { blockingFileOf } from "./blocking-file.ts";
import { WorkflowScreen } from "./workflow-page.tsx";

afterEach(() => unmount());

const writerPath = "hubs/acme/agents/writer.agent.yaml";
const sorterPath = "hubs/acme/agents/sorter.agent.yaml";

/** *Support reply*, whose step `draft` runs `writer`. */
const reply: WorkflowView = {
  hubId: "acme",
  id: "reply",
  name: "Support reply",
  initial: "draft",
  steps: [
    { id: "draft", type: "task", agent: "writer" },
    { id: "done", type: "final" },
  ],
  arrows: [{ from: "draft", to: "done" }],
  layout: {},
};

/** An error in the file of the agent `writer`, as the desktop host gives it. */
const inWriter: WorkflowProblem = {
  severity: "error",
  code: "invalid-value",
  message: 'Agent "writer": "temperature" has to be a number',
  agent: { id: "writer", name: "Writer" },
  file: writerPath,
};
/** The same agent's missing model alias, which the band names with its own fix. */
const writerAlias: WorkflowProblem = {
  ...inWriter,
  code: "unknown-model-alias",
  message: 'Agent "writer" uses unknown model alias "smrt"',
  modelAlias: "smrt",
};
/** An error in the workflow's own file. */
const deadEnd: WorkflowProblem = {
  severity: "error",
  code: "dead-end",
  message: '"draft" has no transitions',
  stepId: "draft",
};

/** One entry of the shared list, as `studio.files-with-errors` gives it. */
function entry(
  path: string,
  name: string,
  overrides: Partial<FileWithErrors> = {},
): FileWithErrors {
  const id = path.slice(path.lastIndexOf("/") + 1).split(".")[0] ?? path;
  return {
    path,
    kind: "agent",
    hub: "acme",
    id,
    name,
    loaded: true,
    firstError: { line: 4, col: 3, reason: "A reason." },
    errors: 1,
    ...overrides,
  };
}

/** A shared list that holds `files` until `change` swaps them, telling its listeners. */
function memoryList(files: readonly FileWithErrors[]) {
  let now = files;
  const listeners = new Set<() => void>();
  const source: FilesWithErrorsSource = {
    list: async () => now,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const change = (next: readonly FileWithErrors[]) =>
    act(async () => {
      now = next;
      for (const listener of listeners) listener();
    });
  return { source, change };
}

/** The page of *Support reply* with `problems`, the shared list and a spy for opening a file. */
async function open(
  problems: readonly WorkflowProblem[],
  filesWithErrors: FilesWithErrorsSource | undefined,
  withOpen = true,
) {
  const { host } = memoryHost([], [], [reply], [], {
    configuration: async () => ({
      hubId: "acme",
      id: "reply",
      name: "Support reply",
      initial: "draft",
      stepIds: ["draft", "done"],
      file: "hubs/acme/workflows/reply.workflow.yaml",
      problems,
    }),
    startRun: async () => ({ runId: "x" }),
  });
  const openFileAt = vi.fn();
  const page = await show(
    <WorkflowScreen
      host={host}
      runs={memoryRuns().source}
      hubId="acme"
      id="reply"
      filesWithErrors={filesWithErrors}
      {...(withOpen && { openFileAt })}
    />,
  );
  await act(async () => {});
  return { page, openFileAt };
}

const fileLine = (page: HTMLElement) =>
  page.querySelector('[data-testid="blocking-file"]')?.textContent;

verifies("workflows.start.start-run", () => {
  it("names the other file whose error stops the workflow, and opens it at its first error", async () => {
    const { source } = memoryList([entry(writerPath, "Writer")]);
    const { page, openFileAt } = await open([inWriter, deadEnd], source);

    expect(fileLine(page)).toBe("Writer has 1 problem that stops this workflow. Open writer.agent.yaml");
    await act(async () => buttonNamed(page, "Open writer.agent.yaml")?.click());
    expect(openFileAt).toHaveBeenCalledWith(writerPath, 4);
  });

  it("says the file's count of errors, and follows the list when it changes", async () => {
    const { source, change } = memoryList([entry(writerPath, "Writer", { errors: 3 })]);
    const { page } = await open([inWriter], source);
    expect(fileLine(page)).toContain("Writer has 3 problems that stop this workflow.");

    await change([]);
    expect(fileLine(page)).toBeUndefined();
  });

  it("leaves the line out for errors only in the workflow's own file, or without a list", async () => {
    const { source } = memoryList([entry(writerPath, "Writer")]);
    expect(fileLine((await open([deadEnd], source)).page)).toBeUndefined();
    unmount();
    expect(fileLine((await open([inWriter], undefined)).page)).toBeUndefined();
  });

  it("names the file with no link where the page can't open files", async () => {
    const { source } = memoryList([entry(writerPath, "Writer")]);
    const { page } = await open([inWriter], source, false);
    expect(fileLine(page)).toBe("Writer has 1 problem that stops this workflow.");
  });

  it("doesn't name an agent again that the missing model alias line names", async () => {
    const { source } = memoryList([entry(writerPath, "Writer")]);
    const { page } = await open([writerAlias], source);
    expect(page.querySelector('[data-testid="missing-alias"]')).not.toBeNull();
    expect(fileLine(page)).toBeUndefined();
  });
});

describe("blockingFileOf", () => {
  it("takes the list's first file that holds one of the workflow's errors", () => {
    const sorter: WorkflowProblem = { ...inWriter, file: sorterPath };
    const files = [
      entry(sorterPath, "sorter.agent.yaml", { loaded: false }),
      entry(writerPath, "Writer"),
    ];
    expect(blockingFileOf(files, [inWriter, sorter], "acme", undefined)?.path).toBe(sorterPath);
    expect(blockingFileOf(files, [inWriter], "acme", undefined)?.path).toBe(writerPath);
  });

  it("skips a file whose problems are only warnings", () => {
    const warning: WorkflowProblem = { ...inWriter, severity: "warning" };
    expect(blockingFileOf([entry(writerPath, "Writer")], [warning], "acme", undefined)).toBe(
      undefined,
    );
  });
});
