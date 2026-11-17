// @vitest-environment jsdom
import type { CodeEditorOptions } from "@halonicjs/studio-code-editor";
import { limitedLookup, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { filesFeature } from "../feature.ts";
import { fileItem } from "../file-item.ts";
import type { FilesHost } from "../files-host.ts";
import { removeFile } from "../remove-file.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { clearTrashed, markTrashed } from "../trash.ts";
import { FileView } from "./file-view.tsx";

const opened: { options: CodeEditorOptions; destroyed: boolean }[] = [];

// The real editor is tested in its own package; here a stand-in records how it was opened.
vi.mock("@halonicjs/studio-code-editor", () => ({
  languageFor: () => "markdown",
  openCodeEditor: async (options: CodeEditorOptions) => {
    const entry = { options, destroyed: false };
    opened.push(entry);
    return {
      text: () => options.text,
      load: () => {},
      focus: () => {},
      setProblems: () => {},
      goTo: () => {},
      destroy: () => {
        entry.destroyed = true;
      },
    };
  },
}));

const announced: string[] = [];

afterEach(() => {
  unmountAll();
  opened.length = 0;
  announced.length = 0;
  clearTrashed("notes/a.md");
});

/** A host whose file holds `state.text`, and that tells its listeners when told to. */
function hostOf(state: { text: string | null }): { host: FilesHost; notify: () => void } {
  const listeners = new Set<() => void>();
  const host: FilesHost = {
    list: async () => ({ paths: [], marks: new Map() }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    read: async () => state.text,
    edit: () => {},
    problems: async () => [],
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
  return {
    host,
    notify: () => {
      for (const listener of listeners) listener();
    },
  };
}

function show(host: FilesHost, path: string): HTMLElement {
  const context = {
    services: limitedLookup(filesFeature, { get: () => host }),
    announcer: { announce: (text: string) => announced.push(text) },
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

const path = "notes/a.md";

verifies("files.ui.delete-file", () => {
  it("greys the editor and says the file went to the trash, with Undo that brings it back", async () => {
    const state = { text: "keep" as string | null };
    const { host, notify } = hostOf(state);
    const undo = vi.fn(async () => {
      state.text = "keep";
      clearTrashed(path);
      notify();
      return true;
    });
    const page = show(host, path);
    await settle();
    expect(opened).toHaveLength(1);

    state.text = null;
    await act(async () => {
      markTrashed(path, { undo });
    });
    await settle();

    expect(page.textContent).toContain("This file was moved to the trash");
    expect(announced).toEqual(["This file was moved to the trash"]);
    expect(opened.at(-1)?.options.readOnly).toBe(true);
    expect(opened.at(-1)?.options.text).toBe("keep");
    const button = [...page.querySelectorAll("button")].find((b) => b.textContent === "Undo");
    // Focus belongs to the tree's next row, so the strip takes none.
    expect(document.activeElement).not.toBe(button);

    await act(async () => {
      button?.click();
    });
    await settle();

    expect(undo).toHaveBeenCalledOnce();
    expect(page.textContent).not.toContain("moved to the trash");
    expect(opened.at(-1)?.options.readOnly).toBe(false);
  });

  it("is read-only as soon as the file is in the trash, before any read says it is gone", async () => {
    const { host } = hostOf({ text: "keep" });
    show(host, path);
    await settle();

    await act(async () => {
      markTrashed(path, { undo: async () => true });
    });

    expect(opened.at(-1)?.options.readOnly).toBe(true);
  });

  it("falls back to the missing-file text when Undo can no longer bring the file back", async () => {
    const state = { text: "keep" as string | null };
    const { host, notify } = hostOf(state);
    const remove = async () => ({
      places: 0,
      undo: async () => {
        throw new Error("notes/a.md can't be put back, because the workspace changed.");
      },
    });
    const toasts = { show: vi.fn() } as unknown as Parameters<typeof removeFile>[1];
    const page = show(host, path);
    await settle();

    state.text = null;
    await act(async () => {
      await removeFile({ remove }, toasts, path);
    });
    notify();
    await settle();
    expect(page.textContent).toContain("This file was moved to the trash");

    await act(async () => {
      [...page.querySelectorAll("button")].find((b) => b.textContent === "Undo")?.click();
    });
    await settle();

    expect(page.textContent).not.toContain("moved to the trash");
    expect(page.textContent).toContain("This file isn't in this workspace any more.");
    expect([...page.querySelectorAll("button")].map((b) => b.textContent)).toContain("Go to Files");
    expect(opened.at(-1)?.destroyed).toBe(true);
  });
});
