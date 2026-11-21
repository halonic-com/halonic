// @vitest-environment jsdom
import { limitedLookup, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { filesFeature } from "../feature.ts";
import { fileItem } from "../file-item.ts";
import type { FilesHost } from "../files-host.ts";
import { requestOpenAtLine } from "../open-at-line.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { contextHost } from "../test-support/sidebar.ts";
import { FileView } from "./file-view.tsx";

/** The lines each opened editor was sent to, in the order the editors opened. */
const goneTo: number[][] = [];

// The real editor is tested in its own package; here a stand-in notes the lines it is sent to.
vi.mock("@halonicjs/studio-code-editor", () => ({
  languageFor: () => "yaml",
  openCodeEditor: async (options: { text: string }) => {
    const lines: number[] = [];
    goneTo.push(lines);
    return {
      text: () => options.text,
      load: () => {},
      focus: () => {},
      setProblems: () => {},
      goTo: (line: number) => lines.push(line),
      destroy: () => {},
    };
  },
}));

afterEach(() => {
  unmountAll();
  goneTo.length = 0;
});

const writer = "hubs/support/agents/writer.agent.yaml";

async function settle(): Promise<void> {
  for (let turn = 0; turn < 3; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function showFile(path: string): Promise<void> {
  const host: FilesHost = { ...contextHost(), read: async () => "id: writer\nname: Writer: x\n" };
  const context = {
    services: limitedLookup(filesFeature, { get: () => host }),
    announcer: { announce: () => {} },
  } as unknown as WorkspaceContext;
  render(<FileView item={fileItem(path)} context={context} Sections={() => null} />);
  await settle();
}

verifies("files.open-at-line", () => {
  it("opens the file with the cursor on the line asked for, and only once", async () => {
    requestOpenAtLine(writer, 2);
    await showFile(writer);
    expect(goneTo).toEqual([[2]]);

    unmountAll();
    await showFile(writer);
    expect(goneTo).toEqual([[2], []]);
  });

  it("moves the cursor of a tab that is already open", async () => {
    await showFile(writer);

    act(() => requestOpenAtLine(writer, 4));

    expect(goneTo).toEqual([[4]]);
  });

  it("leaves another file's tab alone", async () => {
    await showFile("models.yaml");

    act(() => requestOpenAtLine(writer, 4));

    expect(goneTo).toEqual([[]]);
    // The request still waits for the writer's own tab.
    unmountAll();
    await showFile(writer);
    expect(goneTo).toEqual([[], [4]]);
  });
});
