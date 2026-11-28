// @vitest-environment jsdom
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { fileItem } from "../file-item.ts";
import type { FilesHost } from "../files-host.ts";
import { removeFile } from "../remove-file.ts";
import { forgetOpenedEditors, openedEditors as opened } from "../test-support/code-editor.ts";
import { filesLookup } from "../test-support/lookup.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { clearTrashed, markTrashed } from "../trash.ts";
import { FileView } from "./file-view.tsx";

// The real editor is tested in its own package; here a stand-in records how it was opened.
vi.mock("@halonicjs/studio-code-editor", () => import("../test-support/code-editor.ts"));

const announced: string[] = [];

afterEach(() => {
  unmountAll();
  forgetOpenedEditors();
  announced.length = 0;
  clearTrashed("notes/a.md");
  // A field a test focused outside the tab.
  document.body.replaceChildren();
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
    services: filesLookup(host),
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
  it("greys the editor and says the file was deleted, with Undo that brings it back", async () => {
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

    expect(page.textContent).toContain("This file was deleted");
    expect(announced).toEqual(["This file was deleted"]);
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
    expect(page.textContent).not.toContain("This file was deleted");
    expect(opened.at(-1)?.options.readOnly).toBe(false);
  });

  it("gives the editor the focus after the strip's Undo, whose button is gone", async () => {
    const state = { text: "keep" as string | null };
    const { host, notify } = hostOf(state);
    const undo = async () => {
      state.text = "keep";
      clearTrashed(path);
      notify();
      return true;
    };
    const page = show(host, path);
    await settle();
    state.text = null;
    await act(async () => {
      markTrashed(path, { undo });
    });
    await settle();

    const button = [...page.querySelectorAll("button")].find((b) => b.textContent === "Undo");
    await act(async () => {
      button?.focus();
      button?.click();
    });
    await settle();

    expect(opened.at(-1)?.options.readOnly).toBe(false);
    expect(document.activeElement).toBe(page.querySelector("[data-editor]"));
  });

  it("leaves the focus where it is when the file comes back from outside Halonic", async () => {
    const state = { text: "keep" as string | null };
    const { host, notify } = hostOf(state);
    const page = show(host, path);
    await settle();
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();

    state.text = null;
    act(() => notify());
    await settle();
    expect(page.textContent).toContain("This file isn't in this workspace any more.");
    state.text = "back";
    act(() => notify());
    await settle();

    expect(opened.at(-1)?.options.text).toBe("back");
    expect(document.activeElement).toBe(field);
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

  it("keeps the strip and its Undo when Undo can't bring the file back yet", async () => {
    const state = { text: "keep" as string | null };
    const { host, notify } = hostOf(state);
    const undo = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(
        new Error("notes/a.md can't be put back, because there is a new notes/a.md."),
      )
      .mockImplementation(async () => {
        state.text = "keep";
      });
    const toasts = { show: vi.fn() } as unknown as Parameters<typeof removeFile>[1];
    const page = show(host, path);
    await settle();

    state.text = null;
    await act(async () => {
      await removeFile({ remove: async () => ({ places: 0, undo }) }, toasts, path);
    });
    notify();
    await settle();
    const pressUndo = async () => {
      await act(async () => {
        [...page.querySelectorAll("button")].find((b) => b.textContent === "Undo")?.click();
      });
      await settle();
    };

    await pressUndo();
    expect(page.textContent).toContain("This file was deleted");

    await pressUndo();
    act(() => notify());
    await settle();
    expect(undo).toHaveBeenCalledTimes(2);
    expect(page.textContent).not.toContain("This file was deleted");
  });
});
