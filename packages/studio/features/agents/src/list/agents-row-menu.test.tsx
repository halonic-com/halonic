// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentsHost } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { installFakePopover, show, unmount } from "../test-support.tsx";
import { AgentsView } from "./agents-page.tsx";

let restorePopover: () => void;
beforeEach(() => {
  restorePopover = installFakePopover();
});
afterEach(() => {
  unmount();
  restorePopover();
});

const sorter = { hubId: "acme", id: "sorter", name: "Sorter" };
const writer = { hubId: "acme", id: "writer", name: "Writer" };

const hostWith = (users: Record<string, { hubId: string; id: string; name: string }[]> = {}) =>
  memoryAgentsHost({
    hubs: [{ id: "acme", name: "acme" }],
    agents: [sorter, writer],
    users,
  });

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function showList(host: AgentsHost, phone = false, openFile?: (path: string) => void) {
  const toasts = createToastStore();
  const view = (
    <ToastStoreProvider store={toasts}>
      <AgentsView host={host} {...(openFile ? { openFile } : {})} />
    </ToastStoreProvider>
  );
  const page = await show(
    phone ? <PresentationProvider presentation="phone">{view}</PresentationProvider> : view,
  );
  await settled();
  return { page, toasts };
}

const menuButton = (page: HTMLElement, name: string) =>
  page.querySelector<HTMLElement>(`button[aria-label="More actions for ${name}"]`);

const entries = () =>
  [...document.querySelectorAll('[role="menuitem"]')].map((each) => each.textContent);

async function pick(page: HTMLElement, name: string, entry: string): Promise<void> {
  act(() => menuButton(page, name)?.click());
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (each) => each.textContent === entry,
  );
  await act(async () => item?.click());
  await settled();
}

verifies("agents.list.row-menu", () => {
  it("lists Open, Open in new tab, Open as file and Delete, with Delete last", async () => {
    const { page } = await showList(hostWith(), false, () => undefined);
    act(() => menuButton(page, "Sorter")?.click());

    expect(entries()).toEqual(["Open", "Open in new tab", "Open as file", "Delete"]);
  });

  it("has no Open as file on a phone, or where the app can't open a file", async () => {
    const phone = await showList(hostWith(), true, () => undefined);
    act(() => menuButton(phone.page, "Sorter")?.click());
    expect(entries()).toEqual(["Open", "Open in new tab", "Delete"]);
    unmount();

    const desktop = await showList(hostWith());
    act(() => menuButton(desktop.page, "Sorter")?.click());
    expect(entries()).toEqual(["Open", "Open in new tab", "Delete"]);
  });

  it("opens the agent's file in a tab", async () => {
    const openFile = vi.fn();
    const { page } = await showList(hostWith(), false, openFile);

    await pick(page, "Sorter", "Open as file");

    expect(openFile).toHaveBeenCalledWith("hubs/acme/agents/sorter.agent.yaml");
  });

  it("deletes with no dialog and a toast with Undo, and Undo brings the row back", async () => {
    const host = hostWith();
    const trash = vi.spyOn(host, "trash");
    const { page, toasts } = await showList(host);

    await pick(page, "Sorter", "Delete");

    expect(trash).toHaveBeenCalledWith(expect.objectContaining({ hubId: "acme", id: "sorter" }));
    expect(document.querySelector("dialog[open]")).toBeNull();
    expect(page.textContent).not.toContain("Sorter");
    expect(toasts.list()[0]).toMatchObject({
      title: "Moved Sorter to the trash",
      action: { label: "Undo" },
    });

    await act(async () => toasts.list()[0]?.action?.onClick());
    await settled();
    expect(page.textContent).toContain("Sorter");
  });

  it("says which workflows now show an error, as the toast's second line", async () => {
    const host = hostWith({ "acme/sorter": [{ hubId: "acme", id: "reply", name: "Reply" }] });
    const { page, toasts } = await showList(host);

    await pick(page, "Sorter", "Delete");

    expect(toasts.list()[0]).toMatchObject({
      title: "Moved Sorter to the trash.",
      text: "1 workflow now shows an error until you pick another agent for its step.",
    });
  });

  it("still deletes when the workflows can't be read", async () => {
    const host = hostWith();
    host.referencesTo = async () => {
      throw new Error("The hub didn't answer.");
    };
    const { page, toasts } = await showList(host);

    await pick(page, "Sorter", "Delete");

    expect(toasts.list()[0]?.title).toBe("Moved Sorter to the trash");
  });

  it("says why it couldn't move the agent, and Try again moves it", async () => {
    const host = hostWith();
    const real = host.trash.bind(host);
    let works = false;
    host.trash = async (ref) => {
      if (!works) throw new KindedError("unavailable", "the disk is full");
      return real(ref);
    };
    const { page, toasts } = await showList(host);

    await pick(page, "Sorter", "Delete");
    expect(toasts.list()[0]).toMatchObject({
      tone: "danger",
      title: "Couldn't move Sorter to the trash: the disk is full.",
      sticky: true,
      action: { label: "Try again" },
    });
    expect(page.textContent).toContain("Sorter");

    works = true;
    await act(async () => toasts.list()[0]?.action?.onClick());
    await settled();
    expect(page.textContent).not.toContain("Sorter");
  });

  it("says why Undo couldn't put the agent back", async () => {
    const host = hostWith();
    const { page, toasts } = await showList(host);
    await pick(page, "Sorter", "Delete");
    const undo = toasts.list()[0]?.action;

    await act(async () => undo?.onClick());
    await settled();
    await act(async () => undo?.onClick());
    await settled();

    expect(toasts.list().some((toast) => toast.title === "Couldn't put Sorter back")).toBe(true);
  });
});
