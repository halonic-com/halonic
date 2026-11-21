// @vitest-environment jsdom
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { AgentListing, AgentsHost, TrashedAgent } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { buttonNamed, installFakePopover, show, unmount } from "../test-support.tsx";
import { AgentScreen } from "./agent-page.tsx";

const sorter: AgentListing = { hubId: "acme", id: "sorter", name: "Sorter" };

let restorePopover: () => void;
beforeEach(() => {
  restorePopover = installFakePopover();
});
afterEach(() => {
  unmount();
  restorePopover();
});

const settled = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

/** A host whose Delete hands the test its way back, as the workspace's undo (Ctrl Z) has it. */
function hostKeepingUndo(host: AgentsHost) {
  const trash = host.trash;
  const kept: { trashed?: TrashedAgent } = {};
  host.trash = async (ref) => {
    kept.trashed = await trash(ref);
    return kept.trashed;
  };
  return kept;
}

/** Opens Sorter's page and deletes it from the page's ⋮. */
async function openAndDelete(host: AgentsHost) {
  const toasts = createToastStore();
  const page = await show(
    <ToastStoreProvider store={toasts}>
      <AgentScreen host={host} hubId="acme" id="sorter" />
    </ToastStoreProvider>,
  );
  await settled();
  act(() =>
    page.querySelector<HTMLElement>('button[aria-label="More actions for Sorter"]')?.click(),
  );
  const deleteEntry = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (each) => each.textContent === "Delete",
  );
  await act(async () => deleteEntry?.click());
  await settled();
  return { page, toasts };
}

const isThere = (host: AgentsHost) =>
  host.read({ hubId: "acme", id: "sorter" }).then(
    () => true,
    () => false,
  );

verifies("agents.page.menu", () => {
  it("hands Undo to a toast that stays when the page is left after Delete, and the toast puts the agent back", async () => {
    const host = memoryAgentsHost({ hubs: [{ id: "acme", name: "acme" }], agents: [sorter] });
    const { page, toasts } = await openAndDelete(host);
    expect(page.textContent).toContain("Sorter was deleted");
    expect(toasts.list()).toEqual([]);

    unmount();

    const [toast] = toasts.list();
    expect(toast).toMatchObject({
      tone: "success",
      title: "Deleted Sorter",
      sticky: true,
      action: { label: "Undo" },
    });
    await act(async () => toast?.action?.onClick());
    await settled();
    expect(await isThere(host)).toBe(true);
  });

  it("adds the workflow steps that now show an error to that toast", async () => {
    const host = memoryAgentsHost({
      hubs: [{ id: "acme", name: "acme" }],
      agents: [sorter],
      users: { "acme/sorter": [{ hubId: "acme", id: "reply", name: "Reply", stepIds: ["draft"] }] },
    });
    const { toasts } = await openAndDelete(host);

    unmount();

    expect(toasts.list()[0]).toMatchObject({
      title: "Deleted Sorter.",
      text: "1 workflow step now shows an error until you pick another agent.",
    });
  });

  it("shows no toast when the page is left after the strip's Undo", async () => {
    const host = memoryAgentsHost({ hubs: [{ id: "acme", name: "acme" }], agents: [sorter] });
    const { page, toasts } = await openAndDelete(host);
    await act(async () => buttonNamed(page, "Undo")?.click());
    await settled();

    unmount();

    expect(toasts.list()).toEqual([]);
  });

  it("closes that toast once the workspace's undo puts the agent back", async () => {
    const host = memoryAgentsHost({ hubs: [{ id: "acme", name: "acme" }], agents: [sorter] });
    const kept = hostKeepingUndo(host);
    const { toasts } = await openAndDelete(host);
    unmount();
    expect(toasts.list()).toHaveLength(1);

    await act(async () => kept.trashed?.undo());
    await settled();

    expect(toasts.list()).toEqual([]);
  });
});
