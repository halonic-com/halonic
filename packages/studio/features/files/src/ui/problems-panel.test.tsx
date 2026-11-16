// @vitest-environment jsdom
import type { CodeEditorOptions, EditorProblem } from "@halonicjs/studio-code-editor";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fileItem } from "../file-item.ts";
import type { FileIssue, FilesHost } from "../files-host.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { FileView } from "./file-view.tsx";

const editors: {
  options: CodeEditorOptions;
  problems: readonly EditorProblem[];
  goTo: [number, number][];
}[] = [];

vi.mock("@halonicjs/studio-code-editor", () => ({
  languageFor: () => "yaml",
  openCodeEditor: async (options: CodeEditorOptions) => {
    const entry = {
      options,
      problems: [] as readonly EditorProblem[],
      goTo: [] as [number, number][],
    };
    editors.push(entry);
    return {
      text: () => options.text,
      load: () => {},
      setProblems: (problems: readonly EditorProblem[]) => {
        entry.problems = problems;
      },
      goTo: (line: number, col: number) => {
        entry.goTo.push([line, col]);
      },
      destroy: () => {},
    };
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  unmountAll();
  editors.length = 0;
  vi.useRealTimers();
});

const error = (file: string, line: number, message: string): FileIssue => ({
  file,
  severity: "error",
  message,
  line,
  col: 3,
});
const warning = (file: string, line: number, message: string): FileIssue => ({
  file,
  severity: "warning",
  message,
  line,
  col: 1,
});

function setup(
  issues: () => readonly FileIssue[],
  options: { text?: string; syntaxLine?: number | null } = {},
) {
  const listeners = new Set<() => void>();
  const problems = vi.fn(async () => issues());
  const opened: string[] = [];
  const host: FilesHost = {
    list: async () => ({ paths: [], marks: new Map() }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read: async () => options.text ?? "name: a\n",
    edit: () => {},
    problems,
    yamlSyntaxLine: async () => options.syntaxLine ?? null,
    outside: () => new Map(),
    noteHeld: () => undefined,
    onReloaded: () => () => undefined,
    compare: async (path) => ({ path, mine: null, theirs: null, combined: null }),
    settle: async () => {},
    create: async () => {},
    renameImpact: async () => 0,
    rename: async () => {},
    remove: async () => ({ places: 0, undo: async () => {} }),
  };
  const context = {
    services: { get: () => host },
    openItem: (item: { id: string }) => opened.push(item.id),
  } as unknown as WorkspaceContext;
  const page = render(
    <FileView item={fileItem("hubs/p/a.agent.yaml")} context={context} Sections={() => null} />,
  );
  const changed = () =>
    act(() => {
      for (const listener of listeners) listener();
    });
  return { page, problems, changed, opened };
}

async function flush(milliseconds = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

const rows = (page: HTMLElement) =>
  [...page.querySelectorAll("section[aria-label='Problems'] li button")].map(
    (row) => row.textContent,
  );

verifies("files.ui.problems-panel", () => {
  it("lists the file's problems, errors first, and marks them in the editor", async () => {
    const { page } = setup(() => [
      warning("hubs/p/a.agent.yaml", 1, "careful"),
      error("hubs/p/a.agent.yaml", 3, "wrong"),
      error("hubs/p/other.agent.yaml", 2, "not mine"),
    ]);
    await flush();

    expect(page.textContent).toContain("Problems (2)");
    expect(rows(page)).toEqual(["✕Error: Line 3: wrong", "△Warning: Line 1: careful"]);
    expect(editors[0]?.problems.map((problem) => problem.line)).toEqual([3, 1]);
  });

  it("says there are no problems", async () => {
    const { page } = setup(() => []);
    await flush();

    expect(page.textContent).toContain("Problems (0)");
    expect(page.textContent).toContain("No problems.");
  });

  it("collapses to the header and keeps the count", async () => {
    const { page } = setup(() => [error("hubs/p/a.agent.yaml", 3, "wrong")]);
    await flush();
    const header = page.querySelector<HTMLButtonElement>("section[aria-label='Problems'] > button");

    await act(async () => header?.click());

    expect(rows(page)).toEqual([]);
    expect(header?.textContent).toContain("Problems (1)");
    expect(header?.getAttribute("aria-expanded")).toBe("false");
  });

  it("goes to the line and column of a picked row", async () => {
    const { page } = setup(() => [error("hubs/p/a.agent.yaml", 3, "wrong")]);
    await flush();

    await act(async () => page.querySelector<HTMLButtonElement>("li button")?.click());

    expect(editors[0]?.goTo).toEqual([[3, 3]]);
  });

  it("moves with F8 and Shift F8 round the ends and announces the problem", async () => {
    const { page } = setup(() => [
      error("hubs/p/a.agent.yaml", 3, "wrong"),
      error("hubs/p/a.agent.yaml", 5, "worse"),
    ]);
    await flush();
    const press = (direction: 1 | -1) =>
      act(async () => editors[0]?.options.onProblemKey?.(direction));

    await press(1);
    await press(1);
    await press(1);
    await press(-1);

    expect(editors[0]?.goTo).toEqual([
      [3, 3],
      [5, 3],
      [3, 3],
      [5, 3],
    ]);
    expect(page.querySelector('[aria-live="polite"]')?.textContent).toBe("Line 5: worse");
  });

  it("opens the panel on the row of a clicked gutter mark", async () => {
    const { page } = setup(() => [error("hubs/p/a.agent.yaml", 3, "wrong")]);
    await flush();
    const header = page.querySelector<HTMLButtonElement>("section[aria-label='Problems'] > button");
    await act(async () => header?.click());

    await act(async () => editors[0]?.options.onProblemClick?.(3));

    expect(rows(page)).toHaveLength(1);
    expect(document.activeElement?.textContent).toContain("Line 3: wrong");
  });

  it("checks again 300 ms after the last change, not at each one", async () => {
    let now: FileIssue[] = [];
    const { page, problems, changed } = setup(() => now);
    await flush();
    expect(problems).toHaveBeenCalledTimes(1);

    now = [error("hubs/p/a.agent.yaml", 2, "wrong")];
    changed();
    await flush(200);
    changed();
    await flush(200);
    expect(problems).toHaveBeenCalledTimes(1);
    await flush(100);

    expect(problems).toHaveBeenCalledTimes(2);
    expect(page.textContent).toContain("Problems (1)");
  });

  it("says what the edits broke in other files, not what was already broken", async () => {
    let now: FileIssue[] = [error("hubs/p/old.agent.yaml", 1, "already")];
    const { page, changed, opened } = setup(() => now);
    await flush();
    expect(page.textContent).not.toContain("Changes in this file");

    now = [
      error("hubs/p/old.agent.yaml", 1, "already"),
      error("hubs/p/b.workflow.yaml", 4, "unknown agent"),
      error("hubs/p/c.workflow.yaml", 2, "unknown agent"),
    ];
    changed();
    await flush(300);

    expect(page.textContent).toContain("Changes in this file cause 2 problems in other files.");
    const link = [...page.querySelectorAll("section[aria-label='Problems'] p button")][0];
    expect(link?.textContent).toBe("hubs/p/b.workflow.yaml");
    await act(async () => (link as HTMLButtonElement).click());
    expect(opened).toEqual(["hubs/p/b.workflow.yaml"]);
  });

  it("doesn't check a file over the limit and says so", async () => {
    const { page, problems } = setup(() => [error("hubs/p/a.agent.yaml", 3, "wrong")], {
      text: "a".repeat(1_000_001),
    });
    await flush();

    expect(page.textContent).toContain("This file is too long to check.");
    expect(rows(page)).toEqual([]);
    expect(problems).not.toHaveBeenCalled();
  });
});

verifies("files.ui.unreadable-strip", () => {
  it("says a YAML file can't be read, with the line, and keeps the editor", async () => {
    const { page } = setup(() => [], { text: "name: [unclosed\n", syntaxLine: 1 });
    await flush();

    expect(page.textContent).toContain("a.agent.yaml can't be read: line 1 isn't valid YAML.");
    expect(editors).toHaveLength(1);
  });

  it("shows no strip for a file that reads", async () => {
    const { page } = setup(() => []);
    await flush();

    expect(page.textContent).not.toContain("can't be read");
  });
});
