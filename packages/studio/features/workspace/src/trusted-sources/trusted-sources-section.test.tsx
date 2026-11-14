// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TrustedSource, TrustedSourcesHost } from "../api.ts";
import { TrustedSourcesView } from "./trusted-sources-section.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let element: HTMLElement;
let root: Root | undefined;

beforeEach(() => {
  Element.prototype.scrollIntoView ??= () => {};
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  element.remove();
});

// Noon UTC is the same calendar day in every time zone.
const inbox: TrustedSource = {
  location: "/work/inbox-helper",
  name: "inbox-helper",
  trustedAt: "2026-11-03T12:00:00.000Z",
};
const pdf: TrustedSource = {
  location: "/skills/pdf-tools",
  name: "pdf-tools",
  trustedAt: "2026-11-05T12:00:00.000Z",
};

function hostOf(sources: TrustedSource[], remove?: (location: string) => Promise<void>) {
  return {
    list: vi.fn(async () => sources),
    remove: vi.fn(remove ?? (async () => undefined)),
  } satisfies TrustedSourcesHost;
}

async function show(host: TrustedSourcesHost, readOnly = false) {
  const announce = vi.fn();
  root = createRoot(element);
  await act(async () => {
    root?.render(createElement(TrustedSourcesView, { host, readOnly, announce }));
  });
  return announce;
}

function button(label: string, within: ParentNode = document): HTMLButtonElement | undefined {
  return [...within.querySelectorAll("button")].find((one) => one.textContent?.trim() === label);
}

function confirm(): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("dialog button")].find(
    (one): one is HTMLButtonElement => one.textContent?.startsWith("Remove trust") === true,
  );
}

verifies("workspace.trusted-sources", () => {
  it("lists the most recently trusted first, with the date", async () => {
    await show(hostOf([inbox, pdf]));
    const rows = [...element.querySelectorAll("li")].map((row) => row.textContent);
    expect(rows[0]).toContain("pdf-tools");
    expect(rows[0]).toContain("Trusted on 5 Nov 2026");
    expect(rows[1]).toContain("inbox-helper");
    expect(element.textContent).toContain(
      "Trust given with the halonic command is kept separately.",
    );
    expect(element.querySelector("p code")?.textContent).toBe("halonic");
  });

  it("keeps a row whose folder is gone, saying so", async () => {
    await show(hostOf([{ ...inbox, found: false }]));
    expect(element.querySelector("li")?.textContent).toContain("Folder not found");
  });

  it("says so when nothing is trusted", async () => {
    await show(hostOf([]));
    expect(element.textContent).toContain("Nothing trusted yet. Halonic asks before running");
  });

  it("removes a source after the dialog is confirmed, and says so", async () => {
    const host = hostOf([inbox, pdf]);
    const announce = await show(host);
    act(() => button("Remove", element.querySelectorAll("li")[1] as HTMLElement)?.click());
    expect(document.querySelector("dialog")?.textContent).toContain(
      "Remove trust from inbox-helper?",
    );
    expect(host.remove).not.toHaveBeenCalled();
    await act(async () => confirm()?.click());
    expect(host.remove).toHaveBeenCalledWith("/work/inbox-helper");
    expect(element.textContent).not.toContain("inbox-helper");
    expect(element.textContent).toContain("pdf-tools");
    expect(announce).toHaveBeenCalledWith("Removed trust from inbox-helper");
  });

  it("keeps the dialog open and says why when removing fails", async () => {
    const host = hostOf([inbox], async () => {
      throw new Error("the disk is full");
    });
    const announce = await show(host);
    act(() => button("Remove")?.click());
    await act(async () => confirm()?.click());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(document.querySelector("dialog")?.textContent).toContain(
      "Couldn't remove trust from inbox-helper: the disk is full.",
    );
    expect(element.textContent).toContain("inbox-helper");
    expect(announce).not.toHaveBeenCalled();
  });

  it("is read-only when served, with the server's words", async () => {
    await show(hostOf([inbox]), true);
    expect(element.textContent).toContain("View only here.");
    expect(element.textContent).toContain("on the computer running Halonic");
    expect(button("Remove")).toBeUndefined();
    expect(element.textContent).not.toContain("kept separately");
  });

  it("shows skeleton bars while loading", () => {
    root = createRoot(element);
    const host = { list: () => new Promise<never>(() => undefined), remove: vi.fn() };
    act(() => {
      root?.render(createElement(TrustedSourcesView, { host, readOnly: false, announce: vi.fn() }));
    });
    expect(element.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(element.querySelector('[role="status"]')?.textContent).toBe("Loading trusted sources");
    expect(element.querySelector("li")).toBeNull();
  });

  it("says it couldn't load, with the reason, and tries again", async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error("the profile is locked."));
    list.mockResolvedValue([pdf]);
    await show({ list, remove: vi.fn() });
    expect(element.textContent).toContain("Couldn't load trusted sources");
    expect(element.textContent).toContain("the profile is locked");
    await act(async () => button("Try again")?.click());
    expect(element.textContent).toContain("pdf-tools");
  });
});
