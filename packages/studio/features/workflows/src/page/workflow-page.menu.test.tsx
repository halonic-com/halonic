// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { WorkflowsHost, WorkflowUsers } from "../api.ts";
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
 * The page of acme's Support reply, over a host whose workflow is gone once `trash` ran and back
 * once its undo ran; `undo` and `trash` can be swapped for ones that fail.
 */
async function showPage(
  options: {
    users?: WorkflowUsers;
    trash?: WorkflowsHost["trash"];
    undo?: () => Promise<void>;
    canDelete?: boolean;
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
  const { host, change } = memoryHost(
    [],
    [listing("acme", "reply", "Support reply")],
    [reply],
    [],
    options.canDelete === false
      ? {}
      : { trash, referencesTo: async () => options.users ?? { routines: 0, steps: 0 } },
  );
  const read = host.read;
  host.read = async (ref) => {
    if (inTrash) throw new KindedError("not_found", "This workflow isn't there.");
    return read(ref);
  };
  const toasts = createToastStore();
  const page = await show(
    <ToastStoreProvider store={toasts}>
      <WorkflowScreen host={host} runs={memoryRuns().source} hubId="acme" id="reply" />
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

async function pickDelete(page: HTMLElement) {
  const button = page.querySelector<HTMLElement>(`button[aria-label="${menuLabel}"]`);
  act(() => button?.click());
  const menu = document.getElementById(button?.getAttribute("popovertarget") ?? "");
  const item = [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].find(
    (each) => each.textContent === "Delete",
  );
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
    expect(page.textContent).toContain("This workflow was deleted");
    expect(page.textContent).not.toContain("This workflow was deleted.");
    expect(page.querySelector("header")).toBeNull();
    expect(document.activeElement).toBe(buttonNamed(page, "Undo"));
    expect(toasts.list()).toEqual([]);
  });

  it("says in a second line which routines and steps now show an error", async () => {
    const { page } = await showPage({ users: { routines: 1, steps: 2 } });

    await pickDelete(page);

    expect(page.textContent).toContain("This workflow was deleted.");
    expect(page.textContent).toContain(
      "1 routine and 2 workflow steps now show an error until you pick another workflow.",
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
    expect(page.textContent).not.toContain("This workflow was deleted");
    expect(document.activeElement).toBe(page.querySelector("h1"));
  });

  it("comes back without the strip after the workspace's own undo", async () => {
    const { page, undoInWorkspace } = await showPage();
    await pickDelete(page);

    await undoInWorkspace();

    expect(page.textContent).not.toContain("This workflow was deleted");
    expect(page.querySelector("h1")?.textContent).toContain("Support reply");
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
    expect(page.textContent).toContain("This workflow was deleted");
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
});
