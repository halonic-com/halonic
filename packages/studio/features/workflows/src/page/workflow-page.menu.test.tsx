// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
import { PhoneTopBarSlot } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { TrashedWorkflow, WorkflowRef, WorkflowsHost, WorkflowUsers } from "../api.ts";
import { buttonNamed, listing, memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";
import { reply } from "./page-fixtures.ts";
import { WorkflowScreen } from "./workflow-page.tsx";

// jsdom has no popover: a menu closes itself after a pick by hiding it.
beforeAll(() => {
  HTMLElement.prototype.hidePopover ??= () => {};
});
afterEach(unmount);

const menuLabel = "More actions for Support reply";

/**
 * Trash and its count as methods that read `#private` fields, like the app's `WorkspaceWorkflows`:
 * called without `this`, they throw.
 */
class PrivateFieldsTrash {
  readonly #trash: NonNullable<WorkflowsHost["trash"]>;
  readonly #users: WorkflowUsers;

  constructor(trash: NonNullable<WorkflowsHost["trash"]>, users: WorkflowUsers) {
    this.#trash = trash;
    this.#users = users;
  }

  trash(ref: WorkflowRef): Promise<TrashedWorkflow> {
    return this.#trash(ref);
  }

  async referencesTo(): Promise<WorkflowUsers> {
    return this.#users;
  }
}

/**
 * The page of acme's Support reply, over a host whose workflow is gone once `trash` ran and back
 * once its undo ran; `undo` and `trash` can be swapped for ones that fail.
 */
async function showPage(
  options: {
    users?: WorkflowUsers;
    trash?: WorkflowsHost["trash"];
    undo?: () => Promise<void>;
    canDelete?: boolean;
    /** Trash and its count as a class's methods, as in the app, not as plain functions. */
    privateFields?: boolean;
    /** Shows the page on a phone, with this as its top bar. */
    topBar?: HTMLElement;
  } = {},
) {
  let inTrash = false;
  const undo = vi.fn(
    options.undo ??
      (async () => {
        inTrash = false;
      }),
  );
  const trash = vi.fn(
    options.trash ??
      (async () => {
        inTrash = true;
        return { undo };
      }),
  );
  const users = options.users ?? { routines: 0, steps: 0 };
  const deleting =
    options.canDelete === false || options.privateFields
      ? {}
      : { trash, referencesTo: async () => users };
  const memory = memoryHost([], [listing("acme", "reply", "Support reply")], [reply], [], deleting);
  const { change } = memory;
  const host: WorkflowsHost = options.privateFields
    ? Object.assign(new PrivateFieldsTrash(trash, users), memory.host)
    : memory.host;
  const read = host.read;
  host.read = async (ref) => {
    if (inTrash) throw new KindedError("not_found", "This workflow isn't there.");
    return read(ref);
  };
  const toasts = createToastStore();
  const screen = <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />;
  const page = await show(
    <ToastStoreProvider store={toasts}>
      {options.topBar === undefined ? (
        screen
      ) : (
        <PresentationProvider presentation="phone">
          <PhoneTopBarSlot value={options.topBar}>{screen}</PhoneTopBarSlot>
        </PresentationProvider>
      )}
    </ToastStoreProvider>,
  );
  /** The workspace's own undo: the workflow is back and the host says the files changed. */
  const undoInWorkspace = async () => {
    inTrash = false;
    await act(async () => change([listing("acme", "reply", "Support reply")]));
    await settled();
  };
  return { page, toasts, trash, undo, undoInWorkspace };
}

const settled = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

/** The Delete item of the ⋮ in `where`, after opening the menu. */
function deleteItem(where: HTMLElement): HTMLElement | undefined {
  const button = where.querySelector<HTMLElement>(`button[aria-label="${menuLabel}"]`);
  act(() => button?.click());
  const menu = document.getElementById(button?.getAttribute("popovertarget") ?? "");
  return [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].find(
    (each) => each.textContent === "Delete",
  );
}

async function pickDelete(where: HTMLElement) {
  const item = deleteItem(where);
  await act(async () => item?.click());
  await settled();
}

const toastTitles = (toasts: ReturnType<typeof createToastStore>) =>
  toasts.list().map((toast) => toast.title);

verifies("workflows.page.menu", () => {
  it("has Delete in the header's ⋮", async () => {
    const { page } = await showPage();
    const button = page.querySelector<HTMLElement>(`header button[aria-label="${menuLabel}"]`);
    expect(button).not.toBeNull();
    act(() => button?.click());
    const menu = document.getElementById(button?.getAttribute("popovertarget") ?? "");
    expect(
      [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])].map((each) => each.textContent),
    ).toEqual(["Delete"]);
  });

  it("has no ⋮ where the host can't delete", async () => {
    const { page } = await showPage({ canDelete: false });
    expect(page.querySelector(`button[aria-label="${menuLabel}"]`)).toBeNull();
  });

  it("replaces the page with the strip at once, with the focus on Undo and no toast", async () => {
    const { page, toasts, trash } = await showPage();

    await pickDelete(page);

    expect(trash).toHaveBeenCalledWith({ hubId: "acme", id: "reply" });
    expect(page.textContent).toContain("Support reply was deleted");
    expect(page.textContent).not.toContain("Support reply was deleted.");
    expect(page.querySelector("header")).toBeNull();
    expect(document.activeElement).toBe(buttonNamed(page, "Undo"));
    expect(toasts.list()).toEqual([]);
  });

  it("says in a second line which routines and steps now show an error", async () => {
    const { page } = await showPage({ users: { routines: 1, steps: 2 } });

    await pickDelete(page);

    expect(page.textContent).toContain("Support reply was deleted.");
    expect(page.textContent).toContain(
      "1 routine and 2 workflow steps now show an error until you pick another workflow.",
    );
  });

  it("says that second line with a host whose methods read private fields", async () => {
    const { page, trash } = await showPage({
      users: { routines: 1, steps: 0 },
      privateFields: true,
    });

    await pickDelete(page);

    expect(trash).toHaveBeenCalledOnce();
    expect(page.textContent).toContain(
      "1 routine now shows an error until you pick another workflow.",
    );
  });

  it("names only the parts that apply", async () => {
    const { page } = await showPage({ users: { routines: 1, steps: 0 } });

    await pickDelete(page);

    expect(page.textContent).toContain(
      "1 routine now shows an error until you pick another workflow.",
    );
  });

  it("brings the page back with Undo and focuses its name", async () => {
    const { page, undo } = await showPage();
    await pickDelete(page);

    await act(async () => buttonNamed(page, "Undo")?.click());
    await settled();

    expect(undo).toHaveBeenCalledOnce();
    expect(page.textContent).not.toContain("Support reply was deleted");
    expect(document.activeElement).toBe(page.querySelector("h1"));
  });

  it("comes back without the strip after the workspace's own undo", async () => {
    const { page, undoInWorkspace } = await showPage();
    await pickDelete(page);

    await undoInWorkspace();

    expect(page.textContent).not.toContain("Support reply was deleted");
    expect(page.querySelector("h1")?.textContent).toContain("Support reply");
    expect(document.activeElement).toBe(page.querySelector("h1"));
  });

  it("deletes once when Delete is picked again while the first one runs", async () => {
    let finish: () => void = () => {};
    const trash = vi.fn(
      () =>
        new Promise<TrashedWorkflow>((resolve) => {
          finish = () => resolve({ undo: async () => {} });
        }),
    );
    const { page } = await showPage({ trash });

    const item = deleteItem(page);
    await act(async () => item?.click());
    await act(async () => item?.click());
    await act(async () => finish());
    await settled();

    expect(trash).toHaveBeenCalledOnce();
    expect(page.textContent).toContain("Support reply was deleted");
  });

  it("puts the ⋮ in a phone's top bar and deletes from there", async () => {
    const topBar = document.createElement("div");
    document.body.append(topBar);
    const { page } = await showPage({ topBar });
    const menuIn = (where: HTMLElement) => where.querySelector(`button[aria-label="${menuLabel}"]`);
    expect(menuIn(page)).toBeNull();
    expect(menuIn(topBar)).not.toBeNull();

    await pickDelete(topBar);

    expect(page.textContent).toContain("Support reply was deleted");
    expect(menuIn(topBar)).toBeNull();
    expect(document.activeElement).toBe(buttonNamed(page, "Undo"));
    topBar.remove();
  });

  it("says why when Undo can't put it back, and keeps the strip", async () => {
    const { page, toasts } = await showPage({
      undo: async () => {
        throw new KindedError("conflict", "The workspace changed after it was deleted.");
      },
    });
    await pickDelete(page);

    await act(async () => buttonNamed(page, "Undo")?.click());
    await settled();

    expect(toastTitles(toasts)).toEqual(["Couldn't put Support reply back"]);
    expect(toasts.list()[0]?.text).toBe("The workspace changed after it was deleted.");
    expect(page.textContent).toContain("Support reply was deleted");
  });

  it("says why a delete failed in a toast that stays, with Try again", async () => {
    const trash = vi.fn(async () => {
      throw new KindedError("unavailable", "The file is read-only.");
    });
    const { page, toasts } = await showPage({ trash });

    await pickDelete(page);

    const [toast] = toasts.list();
    expect(toast?.title).toBe("Couldn't delete Support reply: The file is read-only.");
    expect(toast?.sticky).toBe(true);
    expect(toast?.action?.label).toBe("Try again");
    expect(page.querySelector("header")).not.toBeNull();

    await act(async () => toast?.action?.onClick());
    expect(trash).toHaveBeenCalledTimes(2);
  });

  it("closes that toast when the page goes, so Try again can't delete out of sight", async () => {
    const trash = vi.fn(async () => {
      throw new KindedError("unavailable", "The file is read-only.");
    });
    const { page, toasts } = await showPage({ trash });
    await pickDelete(page);
    expect(toasts.list()).toHaveLength(1);

    unmount();

    expect(toasts.list()).toEqual([]);
  });

  it("closes the failure's toast when Delete is picked from ⋮ again, so none is left behind", async () => {
    const trash = vi
      .fn<() => Promise<TrashedWorkflow>>()
      .mockRejectedValueOnce(new KindedError("unavailable", "The file is read-only."))
      .mockResolvedValue({ undo: async () => {} });
    const { page, toasts } = await showPage({ trash });
    await pickDelete(page);
    expect(toasts.list()).toHaveLength(1);

    await pickDelete(page);

    expect(trash).toHaveBeenCalledTimes(2);
    expect(page.textContent).toContain("Support reply was deleted");
    expect(toasts.list()).toEqual([]);
  });
});
