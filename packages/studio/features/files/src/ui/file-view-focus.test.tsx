// @vitest-environment jsdom
import type { CodeEditorOptions } from "@halonicjs/studio-code-editor";
import { limitedLookup, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { filesFeature } from "../feature.ts";
import { fileItem } from "../file-item.ts";
import type { FilesHost } from "../files-host.ts";
import { askFocusOnOpen } from "../focus-on-open.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { contextHost } from "../test-support/sidebar.ts";
import { FileView } from "./file-view.tsx";

/** How often each opened editor was told to take focus, in the order the editors opened. */
const focusCalls: number[] = [];

// The real editor is tested in its own package; here a stand-in counts the focus it is given.
vi.mock("@halonicjs/studio-code-editor", () => ({
  languageFor: () => "yaml",
  openCodeEditor: async (options: CodeEditorOptions) => {
    const slot = focusCalls.push(0) - 1;
    return {
      text: () => options.text,
      load: () => {},
      focus: () => {
        focusCalls[slot] = (focusCalls[slot] ?? 0) + 1;
      },
      setProblems: () => {},
      goTo: () => {},
      destroy: () => {},
    };
  },
}));

afterEach(() => {
  unmountAll();
  focusCalls.length = 0;
});

async function showFile(path: string): Promise<void> {
  const host: FilesHost = { ...contextHost(), read: async () => "name: a\n" };
  const context = {
    services: limitedLookup(filesFeature, { get: () => host }),
    announcer: { announce: () => {} },
  } as unknown as WorkspaceContext;
  render(<FileView item={fileItem(path)} context={context} Sections={() => null} />);
  for (let turn = 0; turn < 3; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

verifies("files.ui.new-file-focus", () => {
  it("puts the cursor in the editor of a file just made, and only once", async () => {
    askFocusOnOpen("hubs/a.yaml");
    await showFile("hubs/a.yaml");
    expect(focusCalls).toEqual([1]);

    unmountAll();
    await showFile("hubs/a.yaml");
    expect(focusCalls).toEqual([1, 0]);
  });

  it("leaves focus alone for a file opened from the tree", async () => {
    await showFile("models.yaml");
    expect(focusCalls).toEqual([0]);
  });
});
