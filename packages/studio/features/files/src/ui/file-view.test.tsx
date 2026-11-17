// @vitest-environment jsdom
import type { CodeEditorOptions, EditorProblem } from "@halonicjs/studio-code-editor";
import { limitedLookup, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { filesFeature } from "../feature.ts";
import { fileItem } from "../file-item.ts";
import type { FileIssue, FilesHost } from "../files-host.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { FileView } from "./file-view.tsx";

const opened: {
  options: CodeEditorOptions;
  destroyed: boolean;
  text: string;
  loads: string[];
  shown: readonly EditorProblem[];
  goneTo: [number, number | undefined][];
}[] = [];

// The real editor is tested in its own package; here a stand-in lets the test type.
vi.mock("@halonicjs/studio-code-editor", () => ({
  languageFor: (path: string) => (path.endsWith(".md") ? "markdown" : "yaml"),
  openCodeEditor: async (options: CodeEditorOptions) => {
    const entry = {
      options,
      destroyed: false,
      text: options.text,
      loads: [] as string[],
      shown: [] as readonly EditorProblem[],
      goneTo: [] as [number, number | undefined][],
    };
    opened.push(entry);
    return {
      text: () => entry.text,
      load: (text: string) => {
        entry.text = text;
        entry.loads.push(text);
      },
      focus: () => {},
      setProblems: (problems: readonly EditorProblem[]) => {
        entry.shown = problems;
      },
      goTo: (line: number, col?: number) => {
        entry.goneTo.push([line, col]);
      },
      destroy: () => {
        entry.destroyed = true;
      },
    };
  },
}));

const announced: string[] = [];
const openedItems: string[] = [];

afterEach(() => {
  unmountAll();
  opened.length = 0;
  announced.length = 0;
  openedItems.length = 0;
  vi.useRealTimers();
});

function hostOf(read: FilesHost["read"], edit: FilesHost["edit"] = () => {}): FilesHost {
  return {
    list: async () => ({ paths: [], marks: new Map() }),
    subscribe: () => () => {},
    read,
    edit,
    problems: async () => [],
    outside: () => new Map(),
    yamlSyntaxLine: async () => null,
    noteHeld: () => undefined,
    onReloaded: () => () => undefined,
    compare: async (path) => ({ path, mine: null, theirs: null, combined: null }),
    settle: async () => {},
    create: async () => {},
    renameImpact: async () => ({ places: 0, owners: [] }),
    rename: async () => ({ places: 0, owners: [], undo: async () => {} }),
    remove: async () => ({ places: 0, undo: async () => {} }),
  };
}

function show(host: FilesHost, path: string): HTMLElement {
  const context = {
    services: limitedLookup(filesFeature, { get: () => host }),
    announcer: { announce: (text: string) => announced.push(text) },
    openItem: (item: { id: string }) => openedItems.push(item.id),
  } as unknown as WorkspaceContext;
  return render(<FileView item={fileItem(path)} context={context} Sections={() => null} />);
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 3; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

verifies("files.ui.file-tab", () => {
  it("shows the file's name and gives its text to the editor, named for a screen reader", async () => {
    const page = show(
      hostOf(async () => "name: a\n"),
      "models.yaml",
    );
    await settle();

    expect(page.querySelector("h1")?.textContent).toBe("models.yaml");
    expect(opened[0]?.options.text).toBe("name: a\n");
    expect(opened[0]?.options.language).toBe("yaml");
    expect(opened[0]?.options.label).toBe(
      "models.yaml, YAML editor. Press Escape, then Tab, to leave the editor.",
    );
    expect([...page.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "▾Problems (0)",
    ]);
  });

  it("sends every edit to the workspace's files", async () => {
    const edit = vi.fn();
    show(
      hostOf(async () => "a", edit),
      "notes.md",
    );
    await settle();

    opened[0]?.options.onChange?.("ab");

    expect(opened[0]?.options.language).toBe("markdown");
    expect(edit).toHaveBeenCalledWith("notes.md", "ab");
  });

  it("loads a change the editor didn't make, and ignores the echo of its own edits", async () => {
    let text = "one";
    let notify = () => {};
    const host: FilesHost = {
      ...hostOf(async () => text),
      subscribe: (listener) => {
        notify = listener;
        return () => {
          notify = () => {};
        };
      },
    };
    show(host, "notes.md");
    await settle();

    // The user's own typing comes back through the host with the editor's text.
    opened[0]?.options.onChange?.("one!");
    if (opened[0]) opened[0].text = "one!";
    text = "one!";
    notify();
    await settle();
    expect(opened[0]?.loads).toEqual([]);

    // The workspace's Undo puts the old text back.
    text = "one";
    notify();
    await settle();
    expect(opened[0]?.loads).toEqual(["one"]);
  });

  it("removes the editor when the tab closes", async () => {
    show(
      hostOf(async () => "a"),
      "notes.md",
    );
    await settle();

    unmountAll();

    expect(opened[0]?.destroyed).toBe(true);
  });

  it("shows grey bars while the file loads, and no editor", async () => {
    const page = show(
      hostOf(() => new Promise(() => {})),
      "a.md",
    );
    await settle();

    expect(page.querySelector('[role="status"]')).not.toBeNull();
    expect(opened).toHaveLength(0);
  });

  it("says a missing file isn't in this workspace any more, with Go to Files", async () => {
    const page = show(
      hostOf(async () => null),
      "gone.md",
    );
    await settle();

    expect(page.textContent).toContain("This file isn't in this workspace any more.");
    expect([...page.querySelectorAll("button")].map((b) => b.textContent)).toContain("Go to Files");
    expect(opened).toHaveLength(0);
  });

  it("says the file isn't here any more when it goes away without the trash", async () => {
    let text: string | null = "x";
    const notifiers: (() => void)[] = [];
    const host: FilesHost = {
      ...hostOf(async () => text),
      subscribe: (listener) => {
        notifiers.push(listener);
        return () => {};
      },
    };
    const page = show(host, "b.md");
    await settle();

    text = null;
    await act(async () => {
      for (const notify of notifiers) notify();
    });
    await settle();

    expect(page.textContent).toContain("This file isn't in this workspace any more.");
    expect(opened[0]?.destroyed).toBe(true);
  });

  it("says why a file can't be read", async () => {
    const page = show(
      hostOf(async () => {
        throw new Error("Access was denied.");
      }),
      "locked.md",
    );
    await settle();

    expect(page.textContent).toContain("Couldn't open this file");
    expect(page.textContent).toContain("Access was denied.");
  });
});

verifies("files.ui.large-or-not-text", () => {
  it("opens a file over the limit read-only under its line", async () => {
    const page = show(
      hostOf(async () => "a".repeat(1_000_001)),
      "big.md",
    );
    await settle();

    expect(page.textContent).toContain("This file is large, so it opens read-only.");
    expect(opened).toHaveLength(1);
    expect(opened[0]?.options.readOnly).toBe(true);
  });

  it("opens a file at the limit as usual", async () => {
    const page = show(
      hostOf(async () => "a".repeat(1_000_000)),
      "edge.md",
    );
    await settle();

    expect(page.textContent).not.toContain("read-only");
    expect(opened[0]?.options.readOnly).toBe(false);
  });

  it("says a file with a zero byte can't be shown, with its size, and opens no editor", async () => {
    const page = show(
      hostOf(async () => `PK\u0000\u0003${"x".repeat(2000)}`),
      "logo.png",
    );
    await settle();

    expect(page.textContent).toContain("This file can't be shown here.");
    expect(page.textContent).toContain("It is 2.0 KB.");
    expect(opened).toHaveLength(0);
  });
});

function issueIn(file: string, line: number, message = "Unknown model"): FileIssue {
  return { file, severity: "error", message, line, col: 8 };
}

verifies("files.ui.problems-list", () => {
  it("shows the file's problems in the list and the editor, and not another file's", async () => {
    const page = show(
      {
        ...hostOf(async () => "a"),
        problems: async () => [issueIn("a.yaml", 2), issueIn("b.yaml", 1)],
      },
      "a.yaml",
    );
    await settle();

    expect(page.textContent).toContain("Problems (1)");
    expect(page.textContent).toContain("Line 2: Unknown model");
    expect(opened[0]?.shown).toEqual([issueIn("a.yaml", 2)]);
  });

  it("puts the editor's cursor where a chosen row says", async () => {
    const page = show(
      { ...hostOf(async () => "a"), problems: async () => [issueIn("a.yaml", 2)] },
      "a.yaml",
    );
    await settle();

    act(() => page.querySelector<HTMLElement>("li button")?.click());

    expect(opened[0]?.goneTo).toEqual([[2, 8]]);
  });

  it("checks when the tab opens and 300 ms after the last change, not for every key", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const listeners = new Set<() => void>();
    const notify = () => {
      for (const listener of listeners) listener();
    };
    const problems = vi.fn(async () => [] as FileIssue[]);
    show(
      {
        ...hostOf(async () => "a"),
        problems,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      "a.yaml",
    );
    await act(async () => {});
    expect(problems).toHaveBeenCalledTimes(1);

    notify();
    await act(async () => vi.advanceTimersByTime(200));
    notify();
    await act(async () => vi.advanceTimersByTime(299));
    expect(problems).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(1));
    expect(problems).toHaveBeenCalledTimes(2);
  });

  it("shows the problems the changes here caused in other files, once they appear", async () => {
    let now: FileIssue[] = [issueIn("old.yaml", 1)];
    const listeners = new Set<() => void>();
    const notify = () => {
      for (const listener of listeners) listener();
    };
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const page = show(
      {
        ...hostOf(async () => "a"),
        problems: async () => now,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      "a.yaml",
    );
    await act(async () => {});
    expect(page.textContent).not.toContain("Changes in this file");

    act(() => opened[0]?.options.onChange?.("ab"));
    now = [issueIn("old.yaml", 1), issueIn("flow.yaml", 3)];
    notify();
    await act(async () => vi.advanceTimersByTime(300));

    expect(page.textContent).toContain("Your edits here cause 1 problem in another file.");
    act(() => page.querySelector<HTMLElement>("p button")?.click());
    expect(openedItems).toEqual(["flow.yaml"]);
  });

  it("does not blame this tab for a problem another file's change brought in", async () => {
    let now: FileIssue[] = [];
    const listeners = new Set<() => void>();
    const notify = () => {
      for (const listener of listeners) listener();
    };
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const page = show(
      {
        ...hostOf(async () => "a"),
        problems: async () => now,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      "a.yaml",
    );
    await act(async () => {});

    now = [issueIn("b.yaml", 3)];
    notify();
    await act(async () => vi.advanceTimersByTime(300));

    expect(page.textContent).not.toContain("Changes in this file");
  });

  it("still blames this tab for an edit made while a check was running", async () => {
    let now: FileIssue[] = [];
    let finishRunning: (() => void) | undefined;
    const listeners = new Set<() => void>();
    const notify = () => {
      for (const listener of listeners) listener();
    };
    let holdNext = false;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const page = show(
      {
        ...hostOf(async () => "a"),
        problems: () => {
          const seen = now;
          if (!holdNext) return Promise.resolve(seen);
          holdNext = false;
          return new Promise<FileIssue[]>((resolve) => {
            finishRunning = () => resolve(seen);
          });
        },
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      "a.yaml",
    );
    await act(async () => {});

    // The first edit starts a check, which is still running when the second edit arrives.
    act(() => opened[0]?.options.onChange?.("ab"));
    holdNext = true;
    notify();
    await act(async () => vi.advanceTimersByTime(300));
    act(() => opened[0]?.options.onChange?.("abc"));
    notify();
    await act(async () => finishRunning?.());

    now = [issueIn("flow.yaml", 3)];
    await act(async () => vi.advanceTimersByTime(300));

    expect(page.textContent).toContain("Your edits here cause 1 problem in another file.");
  });

  it("announces the problem F8 reached, and opens the list for a gutter icon", async () => {
    const page = show(
      {
        ...hostOf(async () => "a"),
        problems: async () => [issueIn("a.yaml", 2, "Unknown model.")],
      },
      "a.yaml",
    );
    await settle();

    opened[0]?.options.onProblemJump?.({
      severity: "error",
      message: "Unknown model.",
      line: 2,
      col: 8,
    });
    expect(announced).toEqual(["Line 2, error: Unknown model."]);

    act(() => opened[0]?.options.onProblemMarkClick?.(2));
    expect(page.querySelector("[hidden]")).toBeNull();
  });

  it("keeps working when the check fails", async () => {
    const page = show(
      {
        ...hostOf(async () => "a"),
        problems: async () => {
          throw new Error("no");
        },
      },
      "a.yaml",
    );
    await settle();

    expect(page.textContent).toContain("Problems (0)");
  });
});
