// @vitest-environment jsdom

import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RoutineListing } from "../api.ts";
import { installFakePopover, listing, memoryHost, show, unmount } from "../test-support.tsx";
import { RoutinesView } from "./routines-page.tsx";

let restorePopover: () => void;
beforeEach(() => {
  restorePopover = installFakePopover();
});
afterEach(() => {
  unmount();
  restorePopover();
});

const hubs = [{ id: "acme", name: "acme" }];
const routines: readonly RoutineListing[] = [
  listing("acme", "daily", "Daily"),
  listing("acme", "weekly", "Weekly report"),
];

/** An error with a kind, as the host throws: its message is safe to show. */
function kinded(kind: string, message: string): Error {
  return Object.assign(new Error(message), { kind });
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function pick(page: HTMLElement, trigger: string, entry: string): Promise<void> {
  act(() => page.querySelector<HTMLElement>(`button[aria-label="${trigger}"]`)?.click());
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (each) => each.textContent === entry,
  );
  await act(async () => item?.click());
  await settled();
}

async function showList(host: ReturnType<typeof memoryHost>["host"]) {
  const toasts = createToastStore();
  const page = await show(
    <ToastStoreProvider store={toasts}>
      <RoutinesView host={host} />
    </ToastStoreProvider>,
  );
  await settled();
  return { page, toasts };
}

verifies("routines.list.delete-with-undo", () => {
  it("deletes from a row's menu with no dialog, and says what it stops, with Undo", async () => {
    const { host } = memoryHost(hubs, routines);
    const trash = vi.spyOn(host, "trash");
    const { page, toasts } = await showList(host);

    await pick(page, "More actions for Daily", "Delete");

    expect(trash).toHaveBeenCalledWith(expect.objectContaining({ hubId: "acme", id: "daily" }));
    expect(document.querySelector("dialog[open]")).toBeNull();
    expect(page.textContent).not.toContain("→ Daily");
    expect(toasts.list()[0]).toMatchObject({
      title: "Deleted Daily.",
      text: "It won't start Briefing any more. Runs it already started keep going.",
      action: { label: "Undo" },
    });
  });

  it("lists Open, Open in new tab and Delete, with Delete last", async () => {
    const { page } = await showList(memoryHost(hubs, routines).host);

    act(() =>
      page.querySelector<HTMLElement>('button[aria-label="More actions for Daily"]')?.click(),
    );

    const entries = [...document.querySelectorAll('[role="menuitem"]')].map(
      (each) => each.textContent,
    );
    expect(entries).toEqual(["Open", "Open in new tab", "Delete"]);
  });

  it("puts the routine back with Undo, and its row takes the focus", async () => {
    const { host } = memoryHost(hubs, routines);
    const { page, toasts } = await showList(host);
    await pick(page, "More actions for Daily", "Delete");
    expect(page.textContent).not.toContain("→ Daily");

    await act(async () => toasts.list()[0]?.action?.onClick());
    await settled();

    const cell = [...page.querySelectorAll<HTMLElement>('[role="gridcell"]')].find((each) =>
      each.textContent?.includes("Daily"),
    );
    expect(cell).toBeDefined();
    expect(document.activeElement).toBe(cell);
  });

  it("moves the focus to the next row after a delete", async () => {
    const { page } = await showList(memoryHost(hubs, routines).host);

    await pick(page, "More actions for Daily", "Delete");

    expect(document.activeElement?.textContent).toContain("Weekly report");
  });

  it("gives the page's heading the focus when the last routine is deleted", async () => {
    const { page } = await showList(memoryHost(hubs, [routines[0] as RoutineListing]).host);

    await pick(page, "More actions for Daily", "Delete");

    expect(document.activeElement).toBe(page.querySelector("h1"));
  });

  it("says why a delete failed, with Try again, and shows no system message", async () => {
    const { host } = memoryHost(hubs, routines);
    host.trash = async () => {
      throw kinded("not_found", "Daily isn't in this workspace any more.");
    };
    const { page, toasts } = await showList(host);

    await pick(page, "More actions for Daily", "Delete");

    expect(toasts.list()[0]).toMatchObject({
      tone: "danger",
      title: "Couldn't delete Daily: Daily isn't in this workspace any more.",
      sticky: true,
      action: { label: "Try again" },
    });
  });

  it("says why Undo failed", async () => {
    const { host } = memoryHost(hubs, routines);
    host.trash = async () => ({
      undo: async () => {
        throw kinded("conflict", "Daily can't be put back, because the workspace changed.");
      },
    });
    const { page, toasts } = await showList(host);
    await pick(page, "More actions for Daily", "Delete");

    await act(async () => toasts.list()[0]?.action?.onClick());

    expect(toasts.list().at(-1)).toMatchObject({
      tone: "danger",
      title: "Couldn't put Daily back",
      text: "Daily can't be put back, because the workspace changed.",
    });
  });
});
