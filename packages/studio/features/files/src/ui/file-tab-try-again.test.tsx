// @vitest-environment jsdom
import type { CodeEditorOptions } from "@halonicjs/studio-code-editor";
import { limitedLookup, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { filesFeature } from "../feature.ts";
import { fileItem } from "../file-item.ts";
import type { FilesHost } from "../files-host.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { FileView } from "./file-view.tsx";

const opened: string[] = [];

// The real editor is tested in its own package; here a stand-in records the text it opens on.
vi.mock("@halonicjs/studio-code-editor", () => ({
  languageFor: () => "markdown",
  openCodeEditor: async (options: CodeEditorOptions) => {
    opened.push(options.text);
    return {
      text: () => options.text,
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
});

function hostOf(read: FilesHost["read"]): FilesHost {
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

verifies("files.ui.file-tab-try-again", () => {
  it("never shows a system message, and Try again reads the file again", async () => {
    let reads = 0;
    const page = show(
      hostOf(async () => {
        reads += 1;
        if (reads === 1) throw new Error("EIO: i/o error, read /acme/locked.md");
        return "# Back";
      }),
      "locked.md",
    );
    await settle();

    expect(page.textContent).toContain("Couldn't open this file");
    expect(page.textContent).toContain("Halonic ran into a problem it can't explain yet.");
    expect(page.textContent).not.toContain("EIO");

    const tryAgain = [...page.querySelectorAll("button")].find(
      (button) => button.textContent === "Try again",
    );
    await act(async () => tryAgain?.click());
    await settle();

    expect(reads).toBe(2);
    expect(page.textContent).not.toContain("Couldn't open this file");
    expect(opened.at(-1)).toBe("# Back");
  });

  it("shows a kinded error's own sentence, with Try again", async () => {
    const page = show(
      hostOf(async () => {
        throw Object.assign(new Error("Access was denied."), { kind: "denied" });
      }),
      "locked.md",
    );
    await settle();

    expect(page.textContent).toContain("Access was denied.");
    expect([...page.querySelectorAll("button")].map((b) => b.textContent)).toContain("Try again");
  });
});
