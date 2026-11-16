// @vitest-environment jsdom
import type { CodeEditorOptions } from "@halonicjs/studio-code-editor";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { fileItem } from "../file-item.ts";
import type { FilesHost } from "../files-host.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { FileView } from "./file-view.tsx";

const opened: {
  options: CodeEditorOptions;
  destroyed: boolean;
  text: string;
  loads: string[];
}[] = [];

// The real editor is tested in its own package; here a stand-in lets the test type.
vi.mock("@halonicjs/studio-code-editor", () => ({
  languageFor: (path: string) => (path.endsWith(".md") ? "markdown" : "yaml"),
  openCodeEditor: async (options: CodeEditorOptions) => {
    const entry = { options, destroyed: false, text: options.text, loads: [] as string[] };
    opened.push(entry);
    return {
      text: () => entry.text,
      load: (text: string) => {
        entry.text = text;
        entry.loads.push(text);
      },
      destroy: () => {
        entry.destroyed = true;
      },
    };
  },
}));

afterEach(() => {
  unmountAll();
  opened.length = 0;
});

function hostOf(read: FilesHost["read"], edit: FilesHost["edit"] = () => {}): FilesHost {
  return {
    list: async () => ({ paths: [], marks: new Map() }),
    subscribe: () => () => {},
    read,
    edit,
    problems: async () => [],
    outside: () => new Map(),
    compare: async (path) => ({ path, mine: null, theirs: null, combined: null }),
    settle: async () => {},
  };
}

function show(host: FilesHost, path: string): HTMLElement {
  const context = { services: { get: () => host } } as unknown as WorkspaceContext;
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
    expect(opened[0]?.options.label).toBe("Text of models.yaml");
    expect(page.querySelector("button")).toBeNull();
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

  it("says a missing file isn't here any more", async () => {
    const page = show(
      hostOf(async () => null),
      "gone.md",
    );
    await settle();

    expect(page.textContent).toContain("This file isn't here any more");
    expect(opened).toHaveLength(0);
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
