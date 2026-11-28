// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { requestOpenAtLine, takeOpenAtLineRequests } from "../open-at-line.ts";
import { askRename, takeRenameAsked } from "../rename-request.ts";
import { requestFilesReveal, takeFilesRevealRequests } from "../reveal-request.ts";
import { forgetOpenedEditors } from "../test-support/code-editor.ts";
import { codePane, showCodePage } from "../test-support/code-page.tsx";
import { unmountAll } from "../test-support/render.tsx";
import { listing, rowNamed, settled } from "../test-support/sidebar.ts";

// The real editor is tested in its own package; here a stand-in lets the pane draw.
vi.mock("@halonicjs/studio-code-editor", () => import("../test-support/code-editor.ts"));

afterEach(() => {
  unmountAll();
  forgetOpenedEditors();
  // The window's queues outlive a test: nothing one test leaves may reach the next.
  takeRenameAsked();
  takeFilesRevealRequests(() => "nearest")();
  takeOpenAtLineRequests("README.md", () => {})();
});

/** The name field a row shows while its name is edited, if any: not the search field or a chip. */
function nameField(root: HTMLElement | null): HTMLInputElement | null {
  return (
    root?.querySelector<HTMLInputElement>('input:not([type="search"], [type="radio"])') ?? null
  );
}

async function openInPane(page: HTMLElement, path: string): Promise<void> {
  act(() => rowNamed(page, path).click());
  await settled();
}

verifies("files.code-page", () => {
  it("leaves a file tab's Rename waiting for the sidebar's tree", async () => {
    // The sidebar shows Studio, so its tree isn't drawn yet: the ask waits for it.
    const { page } = await showCodePage();

    act(() => askRename("README.md"));
    await settled();

    expect(nameField(page)).toBeNull();
    expect(takeRenameAsked()).toBe("README.md");
  });

  it("leaves another feature's reveal request to the sidebar's tree", async () => {
    const { page } = await showCodePage();
    const answer = requestFilesReveal("src/checkout");
    await settled();
    expect(page.querySelector('[aria-expanded="true"]')).toBeNull();

    // The request still waits, for the tree the person sees.
    let taken: string | undefined;
    takeFilesRevealRequests((path) => {
      taken = path;
      return "shown";
    })();
    expect(taken).toBe("src/checkout");
    expect(await answer).toBe("shown");
  });

  it("edits the pane's file name in Code's own list column on F2, and leaves the sidebar", async () => {
    const { page, sidebar, shownViews } = await showCodePage({ withSidebar: true });
    await openInPane(page, "README.md");

    const file = codePane(page, "content")?.querySelector("section");
    await act(async () => {
      file?.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
    });
    await settled();

    expect(rowNamed(page, "README.md").querySelector("input")).not.toBeNull();
    expect(nameField(sidebar)).toBeNull();
    expect(shownViews).toEqual([]);
  });

  it("leaves a request to open a file at a line to the file's own tab", async () => {
    const { page } = await showCodePage();
    await openInPane(page, "README.md");

    act(() => requestOpenAtLine("README.md", 4));
    const lines: number[] = [];
    takeOpenAtLineRequests("README.md", (line) => lines.push(line))();

    expect(lines).toEqual([4]);
  });
});

verifies("files.ui.delete-file", () => {
  it("moves the focus to a row of Code's own list column after a delete there", async () => {
    let paths = ["src/checkout/orders.ts", "README.md"];
    let notify = () => {};
    const { page, sidebar } = await showCodePage({
      withSidebar: true,
      host: {
        list: async () => listing(paths),
        subscribe: (listener) => {
          notify = listener;
          return () => {};
        },
        remove: async () => {
          paths = ["src/checkout/orders.ts"];
          notify();
          return { places: 0, undo: async () => {} };
        },
      },
    });
    const readme = rowNamed(page, "README.md");
    act(() => readme.click());

    await act(async () => {
      readme.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    });
    await settled();

    expect(document.activeElement).toBe(rowNamed(page, "src"));
    expect(sidebar?.contains(document.activeElement)).toBe(false);
  });
});

verifies("files.ui.file-tab", () => {
  it("takes Go to Files in Code's pane to Code's own list column", async () => {
    const { page, sidebar } = await showCodePage({
      withSidebar: true,
      host: { read: async () => null },
    });
    await openInPane(page, "README.md");

    const goTo = [...page.querySelectorAll("button")].find(
      (button) => button.textContent === "Go to Files",
    );
    act(() => goTo?.click());

    expect(codePane(page, "list")?.contains(document.activeElement)).toBe(true);
    expect(sidebar?.contains(document.activeElement)).toBe(false);
  });
});
