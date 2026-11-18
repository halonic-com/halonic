// @vitest-environment jsdom

import { defineFeature, watchResources, workspaceContentAttribute } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceSaving } from "./workspace-saving.ts";
import { MENU_BUSY_AFTER_MS } from "./workspace-switcher.ts";
import {
  element,
  press,
  setUpWindow,
  start,
  switcherButton,
  tearDownWindow,
} from "./workspace-window.test-helper.tsx";
import { workspaceKeyPosition } from "./workspace-window.tsx";

beforeEach(setUpWindow);
afterEach(tearDownWindow);

verifies("workspace.workspace-window", () => {
  it("shows Welcome with no switcher until a folder is open", () => {
    start([]);

    expect(element.querySelector("h1")?.textContent).toBe("Halonic Studio");
    expect(switcherButton()).toBeNull();
  });

  it("shows the opened workspace with its switcher, named after the folder", async () => {
    const { switcher } = start([]);

    await act(() => switcher.openLocation("/work/acme"));
    expect(switcherButton()?.getAttribute("aria-label")).toBe("Workspace: acme");
    expect(switcherButton()?.textContent).toContain("/work/acme");
    expect(element.querySelector("h1")?.textContent).not.toBe("Halonic Studio");
  });

  it("opens the picked folder from Welcome's Open folder", async () => {
    const { shell } = start(["/work/acme"]);
    const open = element.querySelector("button");

    await act(async () => open?.click());
    expect(switcherButton()?.getAttribute("aria-label")).toBe("Workspace: acme");
    expect(shell.toasts.list().map((toast) => toast.title)).toEqual(["Opened acme"]);
  });

  it('creates a workspace from Welcome\'s New workspace… and opens it with "Created acme"', async () => {
    const { shell } = start([], [], undefined, [], {
      defaultParent: async () => "/docs",
      folderOf: (parent, name) => `${parent}/${name}`,
      probe: async () => "new",
      create: async () => ({ kind: "trusted" }),
    });
    // jsdom has `<dialog>` but no `showModal()`; opening it is all this needs.
    Object.assign(HTMLDialogElement.prototype, {
      showModal(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
      close(this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    });
    const newButton = [...element.querySelectorAll("button")].find((each) =>
      each.textContent?.includes("New workspace…"),
    );

    await act(async () => newButton?.click());
    const name = document.querySelector<HTMLInputElement>("input");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(name, "acme");
      name?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const create = [...document.querySelectorAll("button")].find((each) =>
      each.textContent?.startsWith("Create"),
    );
    await act(async () => create?.click());
    await act(async () => {});

    expect(switcherButton()?.getAttribute("aria-label")).toBe("Workspace: acme");
    expect(shell.toasts.list().map((toast) => toast.title)).toEqual(["Created acme"]);
  });

  it("has no New workspace… on Welcome without the app's dialog", () => {
    start([]);

    expect(element.textContent).not.toContain("New workspace…");
  });

  it("shows the resources item in the status bar when the app gives it a watch", async () => {
    const watch = watchResources({
      // The minute's check never fires inside the test.
      timers: { now: () => Date.now(), setTimeout: () => undefined, clearTimeout: () => {} },
      onError: (error) => {
        throw error;
      },
      read: async () => ({
        engineMemoryBytes: 230 * 1024 ** 2,
        childProcesses: [],
        dataBytes: 0,
        freeDiskBytes: 48 * 1024 ** 3,
      }),
    });
    try {
      const { switcher } = start([], [], undefined, [], undefined, watch);
      await act(() => switcher.openLocation("/work/acme"));
      await act(async () => {});

      expect(element.textContent).toContain("230 MB");
    } finally {
      watch.stop();
    }
  });

  it("has no resources item without a watch", async () => {
    const { switcher } = start([]);

    await act(() => switcher.openLocation("/work/acme"));
    expect(element.textContent).not.toContain("MB");
  });

  it("shows the workspace at a position on Ctrl and its number", async () => {
    const { switcher } = start([]);
    await act(() => switcher.openLocation("/work/acme"));
    await act(() => switcher.openLocation("/work/beta"));

    await press({ key: "1", ctrlKey: true });
    expect(switcherButton()?.getAttribute("aria-label")).toBe("Workspace: acme");
    await press({ key: "2", ctrlKey: true, altKey: true });
    expect(switcherButton()?.getAttribute("aria-label")).toBe("Workspace: acme");
  });

  it("opens the workspace page from the menu's Workspace settings… (workspace.workspace-page)", async () => {
    // jsdom has no popovers, which the menu closes itself with.
    HTMLElement.prototype.hidePopover ??= () => {};
    const opened = vi.fn();
    const stub = defineFeature({
      id: "stub",
      title: "Stub",
      register: (studio) =>
        studio.commands.add({ id: "workspace.open", title: "Open", run: opened }),
    });
    const { switcher } = start([], [], undefined, [stub]);
    await act(() => switcher.openLocation("/work/acme"));

    const row = [...element.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (each) => each.textContent === "Workspace settings…",
    );
    await act(async () => row?.click());
    expect(opened).toHaveBeenCalledOnce();
  });

  it("goes back to Welcome when the last workspace closes", async () => {
    const { switcher } = start([]);
    await act(() => switcher.openLocation("/work/acme"));

    await act(() => switcher.closeShown());
    expect(element.querySelector("h1")?.textContent).toBe("Halonic Studio");
  });

  it("lists Recent on Welcome, and a row opens its workspace", async () => {
    const { switcher } = start([]);
    await act(() => switcher.openLocation("/work/acme"));
    await act(() => switcher.closeShown());

    const row = element.querySelector<HTMLButtonElement>('button[aria-label="acme, /work/acme"]');
    expect(element.querySelector("h2")?.textContent).toBe("Recent");
    await act(async () => row?.click());
    expect(switcherButton()?.getAttribute("aria-label")).toBe("Workspace: acme");
  });

  it("forgets a Recent row whose folder is gone from Welcome's Remove from Recent", async () => {
    const { switcher } = start([], ["/work/old"]);
    act(() => switcher.recent.remember({ location: "/work/old", name: "old" }));

    const row = element.querySelector<HTMLButtonElement>('button[aria-label="old, /work/old"]');
    await act(async () => row?.click());
    const remove = [...element.querySelectorAll("button")].find(
      (each) => each.textContent === "Remove from Recent",
    );
    await act(async () => remove?.click());
    expect(switcher.recent.list()).toEqual([]);
    expect(element.querySelector("h2")).toBeNull();
  });

  it("shows the switcher busy while the switcher says so (workspace.busy-switcher)", async () => {
    vi.useFakeTimers();
    let finish: () => void = () => {};
    const { switcher } = start([]);
    await act(() => switcher.openLocation("/work/acme"));
    const slow = new Promise<undefined>((resolve) => {
      finish = () => resolve(undefined);
    });

    let opening: Promise<void> = Promise.resolve();
    act(() => {
      opening = switcher.fromMenu(() => slow);
    });
    act(() => vi.advanceTimersByTime(MENU_BUSY_AFTER_MS));
    expect(switcherButton()?.getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      finish();
      await opening;
    });
    expect(switcherButton()?.hasAttribute("aria-busy")).toBe(false);
    vi.useRealTimers();
  });
});

describe("workspaceKeyPosition (workspace.switcher.ctrl-number-keys)", () => {
  const key = (init: Partial<KeyboardEvent>) => ({
    key: "1",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...init,
  });

  it("reads Ctrl 1 to Ctrl 9, or ⌘ on macOS", () => {
    expect(workspaceKeyPosition(key({ ctrlKey: true }), "windows")).toBe(1);
    expect(workspaceKeyPosition(key({ key: "9", ctrlKey: true }), "linux")).toBe(9);
    expect(workspaceKeyPosition(key({ metaKey: true }), "macos")).toBe(1);
  });

  it("leaves Alt, Shift, Ctrl 0 and the other platform's key alone", () => {
    expect(workspaceKeyPosition(key({ ctrlKey: true, altKey: true }), "windows")).toBeUndefined();
    expect(workspaceKeyPosition(key({ ctrlKey: true, shiftKey: true }), "windows")).toBeUndefined();
    expect(workspaceKeyPosition(key({ key: "0", ctrlKey: true }), "windows")).toBeUndefined();
    expect(workspaceKeyPosition(key({ ctrlKey: true }), "macos")).toBeUndefined();
    expect(workspaceKeyPosition(key({ metaKey: true }), "windows")).toBeUndefined();
  });
});

verifies("workspace.saves-itself", () => {
  // jsdom has `<dialog>` but no `showModal()`; opening it is all these tests need.
  beforeEach(() => {
    Object.assign(HTMLDialogElement.prototype, {
      showModal(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
      close(this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    });
  });

  /** A saving that can't save: its close asks. */
  function failingSaving() {
    return {
      saveNow: vi.fn(async () => false),
      problem: { reason: "disk-full" },
      undo: vi.fn(),
      redo: vi.fn(),
      dispose: vi.fn(),
    };
  }

  function buttonNamed(name: string): HTMLButtonElement | undefined {
    return [...document.querySelectorAll("button")].find((button) => button.textContent === name);
  }

  it('asks "Close acme?" when saving fails, and Close anyway closes', async () => {
    const saving = failingSaving();
    const { switcher } = start([], [], saving as unknown as WorkspaceSaving);
    await act(() => switcher.openLocation("/work/acme"));

    await act(() => switcher.closeShown());
    expect(document.querySelector("dialog h2")?.textContent).toBe("Close acme?");
    expect(document.querySelector("dialog p")?.textContent).toBe(
      "Couldn't save acme: the disk is full. Close anyway throws away the changes.",
    );
    expect(switcherButton()).not.toBeNull();

    await act(async () => buttonNamed("Close anyway")?.click());
    expect(document.querySelector("dialog")).toBeNull();
    expect(element.querySelector("h1")?.textContent).toBe("Halonic Studio");
  });

  it('says "still saving" and offers only Wait and Close anyway, never a second save', async () => {
    const saving = { ...failingSaving(), saveNow: vi.fn(() => new Promise<boolean>(() => {})) };
    const { switcher } = start([], [], saving as unknown as WorkspaceSaving);
    await act(() => switcher.openLocation("/work/acme"));
    void switcher.saveAllForWindowClose();
    await act(async () => void switcher.askStillSaving());

    expect(document.querySelector("dialog h2")?.textContent).toBe("Close acme?");
    expect(document.querySelector("dialog p")?.textContent).toBe(
      "acme is still saving. Close anyway throws away the changes.",
    );
    expect(buttonNamed("Cancel")).toBeUndefined();
    expect(buttonNamed("Try again")).toBeUndefined();
    const buttons = [...document.querySelectorAll("dialog button")].map((b) => b.textContent);
    expect(buttons.filter(Boolean)).toEqual(["Wait", "Close anywayClosing…"]);
    expect(saving.saveNow).toHaveBeenCalledOnce();

    await act(async () => buttonNamed("Wait")?.click());
    expect(document.querySelector("dialog")).toBeNull();
    expect(switcherButton()?.getAttribute("aria-label")).toBe("Workspace: acme");
    expect(saving.saveNow).toHaveBeenCalledOnce();
  });

  it("names the dialog's close button after what it does", async () => {
    const { switcher } = start([], [], failingSaving() as unknown as WorkspaceSaving);
    await act(() => switcher.openLocation("/work/acme"));
    await act(() => switcher.closeShown());

    expect(document.querySelector('dialog [aria-label="Keep acme open"]')).not.toBeNull();
  });

  it("keeps the workspace on Cancel", async () => {
    const { switcher } = start([], [], failingSaving() as unknown as WorkspaceSaving);
    await act(() => switcher.openLocation("/work/acme"));
    await act(() => switcher.closeShown());

    await act(async () => buttonNamed("Cancel")?.click());
    expect(document.querySelector("dialog")).toBeNull();
    expect(switcherButton()?.getAttribute("aria-label")).toBe("Workspace: acme");
  });

  it("undoes on Ctrl Z and redoes on Ctrl Shift Z, but not inside a text field", async () => {
    const saving = failingSaving();
    const { switcher } = start([], [], saving as unknown as WorkspaceSaving);
    await act(() => switcher.openLocation("/work/acme"));

    await press({ key: "z", ctrlKey: true });
    await press({ key: "Z", ctrlKey: true, shiftKey: true });
    expect([saving.undo.mock.calls.length, saving.redo.mock.calls.length]).toEqual([1, 1]);

    const field = document.createElement("input");
    document.body.append(field);
    await act(async () => {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    });
    field.remove();
    expect(saving.undo.mock.calls.length).toBe(1);
  });

  it("undoes the workspace's history in a field of workspace content, which has no undo of its own", async () => {
    const saving = failingSaving();
    const { switcher } = start([], [], saving as unknown as WorkspaceSaving);
    await act(() => switcher.openLocation("/work/acme"));
    const form = document.createElement("div");
    form.setAttribute(workspaceContentAttribute, "");
    const field = document.createElement("textarea");
    form.append(field);
    document.body.append(form);

    const undo = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      field.dispatchEvent(undo);
    });
    form.remove();

    expect(saving.undo.mock.calls.length).toBe(1);
    expect(undo.defaultPrevented).toBe(true);
  });
});
