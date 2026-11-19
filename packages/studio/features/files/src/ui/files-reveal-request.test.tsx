// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { FilesHost } from "../files-host.ts";
import { requestFilesReveal, takeFilesRevealRequests } from "../reveal-request.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { contextHost, contextOf, listing, rowNamed, settled } from "../test-support/sidebar.ts";
import { FilesSidebarView } from "./files-sidebar-view.tsx";

afterEach(() => {
  unmountAll();
  takeFilesRevealRequests(() => "shown")();
});

/** The Acme sample's shape: one hub with docs, one without. */
const paths = [
  "hubs/reports/hub.yaml",
  "hubs/reports/agents/a.agent.yaml",
  "hubs/sales/docs/guide.md",
  "hubs/sales/hub.yaml",
  "models.yaml",
];

/** A host that lists `paths` and records any write. */
function watchedHost(): FilesHost {
  return {
    ...contextHost(),
    list: async () => listing(paths),
    edit: vi.fn(),
    create: vi.fn(async () => {}),
    rename: vi.fn(async () => ({ places: 0, owners: [], undo: async () => {} })),
    remove: vi.fn(async () => ({ places: 0, undo: async () => {} })),
  };
}

async function show(host: FilesHost): Promise<HTMLElement> {
  const page = render(<FilesSidebarView context={contextOf(host)} />);
  await settled();
  return page;
}

const opened = (page: HTMLElement) =>
  Array.from(page.querySelectorAll<HTMLElement>('[aria-expanded="true"]')).map(
    (row) => row.dataset["path"],
  );

verifies("files.tree.reveal-request", () => {
  it("opens the folders down to a folder asked for before the tree is listed, and focuses it", async () => {
    const answer = requestFilesReveal("hubs/sales/docs");
    const page = await show(watchedHost());
    await settled();

    expect(await answer).toBe("shown");
    expect(opened(page)).toEqual(["hubs", "hubs/sales", "hubs/sales/docs"]);
    expect(rowNamed(page, "hubs/sales/docs/guide.md")).toBeDefined();
    expect(document.activeElement).toBe(rowNamed(page, "hubs/sales/docs"));
  });

  it("takes a request made while the tree is shown", async () => {
    const page = await show(watchedHost());

    act(() => {
      void requestFilesReveal("hubs/reports/agents/a.agent.yaml");
    });
    await settled();

    expect(opened(page)).toEqual(["hubs", "hubs/reports", "hubs/reports/agents"]);
    expect(document.activeElement).toBe(rowNamed(page, "hubs/reports/agents/a.agent.yaml"));
  });

  it("shows the deepest folder on the path when the folder asked for isn't in the tree", async () => {
    const answer = requestFilesReveal("hubs/reports/docs");
    const page = await show(watchedHost());
    await settled();

    expect(await answer).toBe("nearest");
    expect(opened(page)).toEqual(["hubs", "hubs/reports"]);
    expect(document.activeElement).toBe(rowNamed(page, "hubs/reports"));
  });

  it("falls back to the tree's first row, opening nothing, when no folder on the path is there", async () => {
    const answer = requestFilesReveal("notes/a/b");
    const page = await show(watchedHost());
    await settled();

    expect(await answer).toBe("nearest");
    expect(opened(page)).toEqual([]);
    expect(document.activeElement).toBe(rowNamed(page, "hubs"));
  });

  it("creates and writes nothing", async () => {
    const host = watchedHost();
    requestFilesReveal("hubs/reports/docs");
    await show(host);
    await settled();

    expect(host.create).not.toHaveBeenCalled();
    expect(host.edit).not.toHaveBeenCalled();
    expect(host.rename).not.toHaveBeenCalled();
    expect(host.remove).not.toHaveBeenCalled();
  });
});
