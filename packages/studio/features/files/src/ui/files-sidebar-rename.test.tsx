// @vitest-environment jsdom
import { type ToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { FilesHost } from "../files-host.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { contextHost, contextOf, listing, rowNamed, settled } from "../test-support/sidebar.ts";
import { FilesSidebarView } from "./files-sidebar-view.tsx";

afterEach(unmountAll);

verifies("files.ui.rename-file", () => {
  const typeInto = async (input: HTMLInputElement | null, value: string) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      set?.call(input, value);
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const key = async (target: Element | null, name: string) => {
    await act(async () => {
      target?.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  async function startRename(
    host: FilesHost,
    openItem = vi.fn(),
    active = "",
    toasts?: ToastStore,
  ) {
    const activeItem = {
      get: () => (active === "" ? null : { kind: "file", hub: "workspace", id: active }),
      subscribe: () => () => {},
    };
    const context = { ...contextOf(host), openItem, activeItem } as unknown as WorkspaceContext;
    const view = <FilesSidebarView context={context} />;
    const page = render(
      toasts === undefined ? view : <ToastStoreProvider store={toasts}>{view}</ToastStoreProvider>,
    );
    await settled();
    const row = rowNamed(page, "models.yaml");
    act(() => row.click());
    openItem.mockClear();
    await key(row, "F2");
    return { page, openItem };
  }

  it("edits the name in its row on F2, with no dialog", async () => {
    fakeModal();
    const { page } = await startRename(contextHost());
    const input = rowNamed(page, "models.yaml").querySelector("input");
    expect(input?.value).toBe("models.yaml");
    expect(document.querySelector("dialog, [role='dialog']")).toBeNull();
    restoreModal();
  });

  it("renames on Enter, leaves a closed file closed and focuses the renamed row", async () => {
    let paths = ["agents/a.agent.yaml", "models.yaml"];
    const rename = vi.fn(async () => {
      paths = ["agents/a.agent.yaml", "providers.yaml"];
      return { places: 0, owners: [], undo: async () => {} };
    });
    const subscribers: (() => void)[] = [];
    const host: FilesHost = {
      ...contextHost(),
      list: async () => listing(paths),
      subscribe: (listener) => {
        subscribers.push(listener);
        return () => {};
      },
      rename,
    };
    const { page, openItem } = await startRename(host);
    const input = rowNamed(page, "models.yaml").querySelector("input");
    await typeInto(input, "providers.yaml");
    await key(input, "Enter");
    expect(rename).toHaveBeenCalledWith("models.yaml", "providers.yaml");
    expect(openItem).not.toHaveBeenCalled();
    await act(async () => {
      for (const listener of subscribers) listener();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(rowNamed(page, "providers.yaml"));
    expect(page.querySelector("input")).toBeNull();
  });

  it("opens the new path when the renamed file was the open one", async () => {
    const { page, openItem } = await startRename(contextHost(), vi.fn(), "models.yaml");
    const input = rowNamed(page, "models.yaml").querySelector("input");
    await typeInto(input, "providers.yaml");
    await key(input, "Enter");
    expect(openItem).toHaveBeenCalledWith({ kind: "file", hub: "workspace", id: "providers.yaml" });
  });

  it("puts the old name back on Escape without asking the host", async () => {
    const rename = vi.fn(contextHost().rename);
    const { page } = await startRename({ ...contextHost(), rename });
    const input = rowNamed(page, "models.yaml").querySelector("input");
    await typeInto(input, "other.yaml");
    await key(input, "Escape");
    expect(rename).not.toHaveBeenCalled();
    expect(page.querySelector("input")).toBeNull();
    expect(document.activeElement).toBe(rowNamed(page, "models.yaml"));
  });

  it("says why under the row and keeps the field when the host refuses", async () => {
    const rename = async () => {
      throw new Error("providers.yaml already exists.");
    };
    const { page } = await startRename({ ...contextHost(), rename });
    const input = rowNamed(page, "models.yaml").querySelector("input");
    await typeInto(input, "providers.yaml");
    await key(input, "Enter");
    expect(page.querySelector("input")).not.toBeNull();
    const alert = page.querySelector(`[id="${input?.getAttribute("aria-describedby")}"]`);
    expect(alert?.textContent).toBe("providers.yaml already exists.");
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    expect(input?.getAttribute("aria-describedby")).toBe(alert?.id);
    expect(rowNamed(page, "models.yaml").getAttribute("aria-description")).toBeNull();
  });

  it("closes the field when the row was left while Enter's rename ran and the host refuses", async () => {
    let refuse: (error: Error) => void = () => {};
    const rename = () =>
      new Promise<never>((_, reject) => {
        refuse = reject;
      });
    const show = vi.fn();
    const toasts = { show } as unknown as ToastStore;
    const { page } = await startRename({ ...contextHost(), rename }, vi.fn(), "", toasts);
    const input = rowNamed(page, "models.yaml").querySelector("input");
    await typeInto(input, "providers.yaml");
    await key(input, "Enter");
    const elsewhere = await leaveRow(input);
    await act(async () => {
      refuse(new Error("providers.yaml already exists."));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(page.querySelector("input")).toBeNull();
    expect(document.activeElement).toBe(elsewhere);
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({ tone: "danger", title: "providers.yaml already exists." }),
    );
    elsewhere.remove();
  });

  it("leaves the focus where the user put it when the row was left while Enter's rename ran and it succeeds", async () => {
    let paths = ["agents/a.agent.yaml", "models.yaml"];
    let finish: () => void = () => {};
    const subscribers: (() => void)[] = [];
    const host: FilesHost = {
      ...contextHost(),
      list: async () => listing(paths),
      subscribe: (listener) => {
        subscribers.push(listener);
        return () => {};
      },
      rename: () =>
        new Promise((resolve) => {
          finish = () => {
            paths = ["agents/a.agent.yaml", "providers.yaml"];
            resolve({ places: 0, owners: [], undo: async () => {} });
          };
        }),
    };
    const { page } = await startRename(host);
    const input = rowNamed(page, "models.yaml").querySelector("input");
    await typeInto(input, "providers.yaml");
    await key(input, "Enter");
    const elsewhere = await leaveRow(input);
    await act(async () => {
      finish();
      await new Promise((resolve) => setTimeout(resolve, 0));
      for (const listener of subscribers) listener();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(page.querySelector("input")).toBeNull();
    expect(document.activeElement).toBe(elsewhere);
    expect(rowNamed(page, "providers.yaml").tabIndex).toBe(0);
    elsewhere.remove();
  });

  // The user clicked or tabbed somewhere else: focus is on `elsewhere` and the field loses it.
  async function leaveRow(input: HTMLInputElement | null) {
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    await act(async () => {
      elsewhere.focus();
      input?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return elsewhere;
  }

  it("leaves the focus where the user put it when the row is left after a rename", async () => {
    let paths = ["agents/a.agent.yaml", "models.yaml"];
    const subscribers: (() => void)[] = [];
    const host: FilesHost = {
      ...contextHost(),
      list: async () => listing(paths),
      subscribe: (listener) => {
        subscribers.push(listener);
        return () => {};
      },
      rename: async () => {
        paths = ["agents/a.agent.yaml", "providers.yaml"];
        return { places: 0, owners: [], undo: async () => {} };
      },
    };
    const { page } = await startRename(host);
    const input = rowNamed(page, "models.yaml").querySelector("input");
    await typeInto(input, "providers.yaml");
    const elsewhere = await leaveRow(input);
    await act(async () => {
      for (const listener of subscribers) listener();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(page.querySelector("input")).toBeNull();
    expect(document.activeElement).toBe(elsewhere);
    expect(rowNamed(page, "providers.yaml").tabIndex).toBe(0);
    elsewhere.remove();
  });

  it("leaves the focus where the user put it when the row is left after a refusal", async () => {
    const rename = async () => {
      throw new Error("providers.yaml already exists.");
    };
    const { page } = await startRename({ ...contextHost(), rename });
    const input = rowNamed(page, "models.yaml").querySelector("input");
    await typeInto(input, "providers.yaml");
    const elsewhere = await leaveRow(input);
    expect(page.querySelector("input")).toBeNull();
    expect(document.activeElement).toBe(elsewhere);
    expect(rowNamed(page, "models.yaml").tabIndex).toBe(0);
    elsewhere.remove();
  });

  it("leaves the focus where the user put it when the row is left with the name unchanged", async () => {
    const rename = vi.fn(contextHost().rename);
    const { page } = await startRename({ ...contextHost(), rename });
    const input = rowNamed(page, "models.yaml").querySelector("input");
    const elsewhere = await leaveRow(input);
    expect(rename).not.toHaveBeenCalled();
    expect(page.querySelector("input")).toBeNull();
    expect(document.activeElement).toBe(elsewhere);
    expect(rowNamed(page, "models.yaml").tabIndex).toBe(0);
    elsewhere.remove();
  });
});
