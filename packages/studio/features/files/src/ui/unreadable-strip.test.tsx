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

const opened: { text: string }[] = [];

// The real editor is tested in its own package; here a stand-in holds the text.
vi.mock("@halonicjs/studio-code-editor", () => ({
  languageFor: (path: string) => (path.endsWith(".md") ? "markdown" : "yaml"),
  openCodeEditor: async (options: { text: string }) => {
    const entry = { text: options.text };
    opened.push(entry);
    return {
      text: () => entry.text,
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
  opened.length = 0;
  vi.useRealTimers();
});

function hostOf(read: FilesHost["read"]): FilesHost {
  return {
    list: async () => ({ paths: [], marks: new Map() }),
    subscribe: () => () => {},
    read,
    edit: () => {},
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
    announcer: { announce: () => {} },
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
  const strip = (page: HTMLElement) =>
    [...page.querySelectorAll("[role=status]")].find((node) =>
      node.textContent?.includes("can't be read"),
    );

  it("says the file can't be read, keeps the text in the editor, and drops the strip once it reads", async () => {
    let line: number | null = 1;
    const listeners = new Set<() => void>();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const page = show(
      {
        ...hostOf(async () => "name: [unclosed"),
        yamlSyntaxLine: async () => line,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      "a.agent.yaml",
    );
    await act(async () => {});

    expect(strip(page)?.textContent).toBe("a.agent.yaml can't be read: line 1 isn't valid YAML.");
    expect(opened[0]?.text).toBe("name: [unclosed");

    line = null;
    for (const listener of listeners) listener();
    await act(async () => vi.advanceTimersByTime(300));

    expect(strip(page)).toBeUndefined();
  });

  it("shows no strip for a file the host finds readable", async () => {
    const page = show(
      hostOf(async () => "name: a\n"),
      "a.md",
    );
    await settle();

    expect(strip(page)).toBeUndefined();
  });

  it("leaves the strip to the outside strip while saving is paused", async () => {
    const page = show(
      {
        ...hostOf(async () => "name: [unclosed"),
        yamlSyntaxLine: async () => 1,
        outside: () => new Map([["a.agent.yaml", "changed" as const]]),
      },
      "a.agent.yaml",
    );
    await settle();

    expect(strip(page)).toBeUndefined();
    expect(page.textContent).toContain("changed outside Halonic");
  });
});
