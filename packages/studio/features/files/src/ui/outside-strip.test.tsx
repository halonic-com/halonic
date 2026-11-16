// @vitest-environment jsdom
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { fileItem } from "../file-item.ts";
import type { CompareChoice, FileCompare, FilesHost, OutsideChange } from "../files-host.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { FileView } from "./file-view.tsx";

// Every editor the tab opened, with the text it started from.
const opened: { text: string; onChange: ((text: string) => void) | undefined }[] = [];

vi.mock("@halonicjs/studio-code-editor", () => ({
  languageFor: () => "yaml",
  openCodeEditor: async (options: { text: string; onChange?: (text: string) => void }) => {
    opened.push({ text: options.text, onChange: options.onChange });
    return {
      text: () => options.text,
      load: () => {},
      destroy: () => {},
    };
  },
}));

afterEach(() => {
  unmountAll();
  opened.length = 0;
});

function fixture(change: OutsideChange | undefined, compare: Partial<FileCompare> = {}) {
  let text = "mine";
  const outside = new Map<string, OutsideChange>();
  if (change) outside.set("a.agent.yaml", change);
  const settle = vi.fn(async (path: string, _choice: CompareChoice) => {
    outside.delete(path);
    text = "chosen";
  });
  const host: FilesHost = {
    list: async () => ({ paths: [], marks: new Map() }),
    subscribe: () => () => {},
    read: async () => text,
    edit: (_path, next) => {
      text = next;
    },
    problems: async () => [],
    create: async () => {},
    renameImpact: async () => 0,
    rename: async () => {},
    remove: async () => ({ places: 0, undo: async () => {} }),
    outside: () => outside,
    noteHeld: () => undefined,
    onReloaded: () => () => undefined,
    compare: async (path) => ({
      path,
      mine: "mine",
      theirs: change === "deleted" ? null : "theirs",
      combined: null,
      ...compare,
    }),
    settle,
  };
  const context = { services: { get: () => host } } as unknown as WorkspaceContext;
  const page = render(
    <FileView item={fileItem("a.agent.yaml")} context={context} Sections={() => null} />,
  );
  return { page, settle };
}

async function flush(): Promise<void> {
  for (let turn = 0; turn < 3; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function button(page: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...page.querySelectorAll("button")].find((b) => b.textContent === label);
}

async function press(page: HTMLElement, label: string): Promise<void> {
  await act(async () => {
    button(page, label)?.click();
  });
  await flush();
}

verifies("files.ui.outside-strip", () => {
  it("shows no strip for a file without an outside change", async () => {
    const { page } = fixture(undefined);
    await flush();
    expect(page.querySelector("[role=status]")).toBeNull();
  });

  it("shows the strip with Compare and keeps the editor", async () => {
    const { page } = fixture("changed");
    await flush();
    expect(page.querySelector("[role=status]")?.textContent).toContain(
      "a.agent.yaml changed outside Halonic",
    );
    expect(button(page, "Compare")).toBeDefined();
  });

  it("shows both texts in Compare, and Combine both only when they can be combined", async () => {
    const plain = fixture("changed");
    await flush();
    await press(plain.page, "Compare");
    expect(plain.page.textContent).toContain("mine");
    expect(plain.page.textContent).toContain("theirs");
    expect(button(plain.page, "Keep mine")).toBeDefined();
    expect(button(plain.page, "Use the other one")).toBeDefined();
    expect(button(plain.page, "Combine both")).toBeUndefined();
    unmountAll();

    const both = fixture("changed", { combined: "both" });
    await flush();
    await press(both.page, "Compare");
    expect(button(both.page, "Combine both")).toBeDefined();
  });

  it("settles with the choice, closes Compare and shows the saved text", async () => {
    const { page, settle } = fixture("changed");
    await flush();
    await press(page, "Compare");
    await press(page, "Use the other one");
    expect(settle).toHaveBeenCalledWith("a.agent.yaml", "use-other");
    expect(page.querySelector("[role=status]")).toBeNull();
    expect(button(page, "Keep mine")).toBeUndefined();
    expect(opened.at(-1)?.text).toBe("chosen");
  });

  it("reopens the editor with what was typed when Compare is cancelled", async () => {
    const { page } = fixture("changed");
    await flush();
    opened[0]?.onChange?.("typed in this tab");
    await press(page, "Compare");
    await press(page, "Cancel");
    expect(opened.at(-1)?.text).toBe("typed in this tab");
  });

  it("sends a second click on a choice no further while the first is saving", async () => {
    const { page, settle } = fixture("changed");
    settle.mockImplementationOnce(() => new Promise(() => {}));
    await flush();
    await press(page, "Compare");
    await press(page, "Keep mine");
    expect(button(page, "Keep mine")?.getAttribute("aria-busy")).toBe("true");
    await press(page, "Keep mine");
    expect(settle).toHaveBeenCalledTimes(1);
  });

  it("keeps Compare open and says why when a choice can't be saved", async () => {
    const { page, settle } = fixture("changed", { combined: "both" });
    settle.mockRejectedValueOnce(new Error("the texts changed again"));
    await flush();
    await press(page, "Compare");
    await press(page, "Combine both");
    expect(page.textContent).toContain("the texts changed again");
    expect(button(page, "Keep mine")).toBeDefined();
  });

  it("offers Keep mine and Close for a file deleted outside Halonic", async () => {
    const { page, settle } = fixture("deleted");
    await flush();
    expect(page.querySelector("[role=status]")?.textContent).toContain(
      "a.agent.yaml was deleted outside Halonic.",
    );
    expect(button(page, "Compare")).toBeUndefined();
    await press(page, "Keep mine");
    expect(settle).toHaveBeenCalledWith("a.agent.yaml", "keep-mine");
  });

  it("shows the reason in Compare when a choice made in the strip can't be saved", async () => {
    const { page, settle } = fixture("deleted");
    settle.mockRejectedValueOnce(new Error("the folder is read-only"));
    await flush();
    await press(page, "Keep mine");
    expect(page.textContent).toContain("the folder is read-only");
    expect(button(page, "Use the other one")).toBeDefined();
  });

  it("settles a deleted file with the other side when Close is chosen", async () => {
    const { page, settle } = fixture("deleted");
    await flush();
    await press(page, "Close");
    expect(settle).toHaveBeenCalledWith("a.agent.yaml", "use-other");
  });
});
