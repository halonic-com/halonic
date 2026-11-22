// @vitest-environment jsdom
import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { type LibraryItemsHost, LibraryItemsHostService } from "../library-items-host.ts";
import { LibraryTabMemoryService } from "../library-tab-memory.ts";
import { requestFilesReveal } from "../test-support/files-reveal.spec.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { LibraryPlace } from "./library-place.tsx";

afterEach(() => {
  unmountAll();
  requestFilesReveal.mockReset();
});

/** A workspace whose Library was last on Knowledge, which lists nothing. */
function contextOf(extra: Partial<WorkspaceContext> = {}): { context: WorkspaceContext } {
  const host: LibraryItemsHost = {
    list: async () => ({ hubs: [] }),
    remove: async () => ({ undo: async () => {} }),
    readFile: async () => "",
    subscribe: () => () => {},
  };
  const provided = new Map<unknown, unknown>([
    [LibraryItemsHostService, host],
    [LibraryTabMemoryService, { get: () => "knowledge", set: () => {} }],
  ]);
  const services = {
    get: (key: unknown) => provided.get(key),
    find: (key: unknown) => provided.get(key),
  };
  return { context: { services, ...extra } as unknown as WorkspaceContext };
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function show(
  context: WorkspaceContext,
  presentation: "desktop" | "phone" = "desktop",
  sub?: string,
): Promise<HTMLElement> {
  const page = render(
    <PresentationProvider presentation={presentation}>
      <LibraryPlace context={context} {...(sub === undefined ? {} : { sub })} />
    </PresentationProvider>,
  );
  await settled();
  return page;
}

verifies("library.open-docs-folder", () => {
  const docsButton = (page: HTMLElement) =>
    Array.from(page.querySelectorAll("button")).find(
      (button) => button.textContent === "Open the docs folder",
    );

  it("shows Files with the workspace's docs folder revealed, writing nothing", async () => {
    const showSidebarView = vi.fn();
    const { context } = contextOf({ showSidebarView });
    const page = await show(context);

    act(() => docsButton(page)?.click());

    expect(requestFilesReveal).toHaveBeenCalledExactlyOnceWith("docs");
    expect(showSidebarView).toHaveBeenCalledExactlyOnceWith("files");
  });

  /** Clicks the button while the reveal answers `answer`, and returns the toasts shown. */
  async function toastsAfterReveal(answer: "shown" | "nearest") {
    requestFilesReveal.mockResolvedValue(answer);
    const toasts = createToastStore();
    const { context } = contextOf({ showSidebarView: vi.fn() });
    const page = render(
      <ToastStoreProvider store={toasts}>
        <LibraryPlace context={context} />
      </ToastStoreProvider>,
    );
    await settled();
    await act(async () => docsButton(page)?.click());
    return toasts.list();
  }

  it("says politely, once, that there's no docs folder when Files shows the root instead", async () => {
    expect(await toastsAfterReveal("nearest")).toMatchObject([
      {
        tone: "info",
        title:
          "There's no docs folder in this workspace yet. Make one on your computer, then put documents in it.",
      },
    ]);
  });

  it("shows no toast when the docs folder is there", async () => {
    expect(await toastsAfterReveal("shown")).toEqual([]);
  });

  it("offers no button where the window has no sidebar views to show", async () => {
    const page = await show(contextOf().context);
    expect(page.textContent).toContain("docs folder");
    expect(docsButton(page)).toBeUndefined();
  });

  it("offers no button on a phone", async () => {
    const { context } = contextOf({ showSidebarView: vi.fn() });
    const page = await show(context, "phone", "knowledge");
    expect(page.textContent).toContain("docs folder");
    expect(docsButton(page)).toBeUndefined();
  });
});
