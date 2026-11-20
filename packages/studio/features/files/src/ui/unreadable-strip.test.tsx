// @vitest-environment jsdom
import { limitedLookup, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { filesFeature } from "../feature.ts";
import { fileItem } from "../file-item.ts";
import type { FilesHost } from "../files-host.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { FileView } from "./file-view.tsx";

let opened = 0;

// The real editor is tested in its own package; here a stand-in counts how often one opens.
vi.mock("@halonicjs/studio-code-editor", () => ({
  languageFor: () => "yaml",
  openCodeEditor: async () => {
    opened++;
    return {
      text: () => "",
      load: () => {},
      focus: () => {},
      setProblems: () => {},
      goTo: () => {},
      destroy: () => {},
    };
  },
}));

afterEach(() => {
  unmountAll();
  opened = 0;
  vi.useRealTimers();
});

function hostOf(read: FilesHost["read"], more: Partial<FilesHost> = {}): FilesHost {
  return {
    list: async () => ({ paths: [], marks: new Map() }),
    subscribe: () => () => {},
    read,
    edit: () => {},
    problems: async () => [],
    yamlSyntaxLine: async () => null,
    outside: () => new Map(),
    noteHeld: () => undefined,
    onReloaded: () => () => undefined,
    compare: async (path) => ({ path, mine: null, theirs: null, combined: null }),
    settle: async () => {},
    create: async () => {},
    renameImpact: async () => ({ places: 0, owners: [] }),
    rename: async () => ({ places: 0, owners: [], undo: async () => {} }),
    remove: async () => ({ places: 0, undo: async () => {} }),
    ...more,
  };
}

function show(
  host: FilesHost,
  path: string,
  announce: (text: string) => void = () => {},
): HTMLElement {
  const context = {
    services: limitedLookup(filesFeature, { get: () => host }),
    announcer: { announce },
    openItem: () => {},
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

verifies("files.ui.unreadable-strip", () => {
  it("says a YAML file can't be read, with the line, and keeps the editor", async () => {
    const page = show(
      hostOf(async () => "name: [unclosed\n", { yamlSyntaxLine: async () => 1 }),
      "a.agent.yaml",
    );
    await settle();

    expect(page.textContent).toContain("a.agent.yaml can't be read: line 1 isn't valid YAML.");
    expect(opened).toBe(1);
  });

  it("shows no strip when the file reads", async () => {
    const page = show(
      hostOf(async () => "name: a\n"),
      "a.agent.yaml",
    );
    await settle();

    expect(page.textContent).not.toContain("can't be read");
  });

  it("takes the strip away in the next check, once the file reads again", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let line: number | null = 1;
    const listeners = new Set<() => void>();
    const page = show(
      hostOf(async () => "name: [unclosed\n", {
        yamlSyntaxLine: async () => line,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      }),
      "a.agent.yaml",
    );
    await act(async () => {});
    expect(page.textContent).toContain("can't be read");

    line = null;
    for (const listener of listeners) listener();
    await act(async () => vi.advanceTimersByTime(300));

    expect(page.textContent).not.toContain("can't be read");
  });

  it("says the strip once when typing makes the file unreadable, not again while it stays so", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let line: number | null = null;
    const listeners = new Set<() => void>();
    const announce = vi.fn();
    show(
      hostOf(async () => "name: a\n", {
        yamlSyntaxLine: async () => line,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      }),
      "a.agent.yaml",
      announce,
    );
    const check = async (next: number | null) => {
      line = next;
      for (const listener of listeners) listener();
      await act(async () => vi.advanceTimersByTime(300));
    };
    await act(async () => {});

    await check(15);
    await check(16);
    expect(announce.mock.calls).toEqual([
      ["a.agent.yaml can't be read: line 15 isn't valid YAML."],
    ]);

    await check(null);
    await check(2);
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenLastCalledWith(
      "a.agent.yaml can't be read: line 2 isn't valid YAML.",
    );
  });

  it("says nothing for a file that opens unreadable: the strip is there as it opens", async () => {
    const announce = vi.fn();
    show(
      hostOf(async () => "name: [unclosed\n", { yamlSyntaxLine: async () => 1 }),
      "a.agent.yaml",
      announce,
    );
    await settle();

    expect(announce).not.toHaveBeenCalled();
  });

  it("keeps the problems when the syntax check fails", async () => {
    const page = show(
      hostOf(async () => "a: 1\n", {
        problems: async () => [
          { file: "a.yaml", severity: "error", message: "Bad.", line: 1, col: 1 },
        ],
        yamlSyntaxLine: async () => {
          throw new Error("no");
        },
      }),
      "a.yaml",
    );
    await settle();

    expect(page.textContent).toContain("Problems (1)");
  });
});
