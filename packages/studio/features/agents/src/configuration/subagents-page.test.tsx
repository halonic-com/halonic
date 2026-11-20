// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { AgentsHost } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen } from "../page/agent-page.tsx";
import { buttonNamed, openDialogsInJsdom, show, typeInto, unmount } from "../test-support.tsx";

beforeEach(openDialogsInJsdom);
afterEach(unmount);

const triage = { hubId: "acme", id: "triage" };

const agent = (id: string, name: string, more: { subagents?: string[]; description?: string }) => ({
  hubId: "acme",
  id,
  name,
  ...more,
});

const host = () =>
  memoryAgentsHost({
    hubs: [{ id: "acme", name: "Acme" }],
    agents: [
      agent("triage", "Mail triage", { subagents: ["writer"] }),
      agent("writer", "Writer", {}),
      agent("sorter", "Sorter", { subagents: ["triage"] }),
      agent("refunds", "Refund checker", { description: "Checks refunds." }),
      agent("archive", "Archive", {}),
    ],
  });

async function openSubagents(agents: AgentsHost = host()) {
  const toasts = createToastStore();
  const page = await show(
    <ToastStoreProvider store={toasts}>
      <AgentScreen host={agents} hubId="acme" id="triage" />
    </ToastStoreProvider>,
  );
  await act(async () => buttonNamed(page, "Configuration")?.click());
  await act(async () =>
    [...page.querySelectorAll<HTMLElement>("[role=tab]")]
      .find((tab) => tab.textContent === "Subagents")
      ?.click(),
  );
  return { page, toasts };
}

const dialog = () => document.querySelector("dialog") as HTMLDialogElement;

/** The row of the agent named `name` in the dialog's Pick an agent list. */
const pickNamed = (name: string) =>
  [...dialog().querySelectorAll<HTMLElement>("[role=gridcell]")].find((cell) =>
    cell.textContent?.startsWith(name),
  );

verifies("agents.configuration.subagents", () => {
  it("shows the subagents as chips with ✕, and a loop as a disabled chip with its reason", async () => {
    const { page } = await openSubagents();
    expect(page.textContent).toContain("The agents Mail triage hands work to.");
    expect(page.querySelector("[aria-label='Remove Writer']")).not.toBeNull();
    const disabled = page.querySelector("[aria-disabled=true]");
    expect(disabled?.textContent).toBe("Sorter");
    expect(disabled?.parentElement?.textContent).toContain(
      "Sorter already hands work to Mail triage",
    );
    expect(page.querySelector("[aria-label='Remove Sorter']")).toBeNull();
  });

  it("removes a subagent, saves the list and moves focus to Add subagent", async () => {
    const agents = host();
    const { page } = await openSubagents(agents);
    await act(async () => page.querySelector<HTMLElement>("[aria-label='Remove Writer']")?.click());
    expect((await agents.settings(triage)).subagents).toEqual([]);
    expect(document.activeElement?.textContent).toContain("Add subagent");
  });

  it("lists only agents that wouldn't loop, by name, with their description; a click adds it", async () => {
    const agents = host();
    const { page } = await openSubagents(agents);
    await act(async () => buttonNamed(page, "Add subagent")?.click());
    expect(dialog().textContent).toContain("Add a subagent to Mail triage");
    // The agents are the kit List's rows, so they look pressable (HAL-14105).
    const grid = dialog().querySelector("[role=grid]");
    expect(grid?.getAttribute("aria-label")).toBe("Pick an agent");
    const picks = [...dialog().querySelectorAll<HTMLElement>("[role=gridcell]")];
    expect(picks.map((cell) => cell.textContent)).toEqual([
      "Archive",
      "Refund checkerChecks refunds.",
    ]);
    expect(dialog().textContent).toContain("Or create a new agent");
    await act(async () => pickNamed("Archive")?.click());
    expect((await agents.settings(triage)).subagents).toEqual(["writer", "archive"]);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("creates a new agent in the hub and adds it, and asks for a name first", async () => {
    const agents = host();
    const { page } = await openSubagents(agents);
    await act(async () => buttonNamed(page, "Add subagent")?.click());
    const input = dialog().querySelector("input") as HTMLInputElement;
    expect(input.placeholder).toBe("Name");
    expect(input.getAttribute("aria-label") ?? input.labels?.[0]?.textContent).toBe(
      "New agent's name",
    );
    await act(async () => buttonNamed(dialog(), "Create")?.click());
    expect(dialog().textContent).toContain("Give it a name.");
    expect((await agents.list()).length).toBe(5);

    await typeInto(input, "Sorter 2");
    await act(async () => buttonNamed(dialog(), "Create")?.click());
    expect((await agents.settings(triage)).subagents).toEqual(["writer", "sorter-2"]);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("names the create box New agent when there is nothing to pick", async () => {
    const agents = host();
    await agents.update(triage, { subagents: ["writer", "refunds", "archive"] });
    const { page } = await openSubagents(agents);
    await act(async () => buttonNamed(page, "Add subagent")?.click());
    expect(dialog().querySelector("h3")?.textContent).toBe("New agent");
  });

  it("shows a refused change as a toast and keeps the chips", async () => {
    const agents = host();
    const refusing: AgentsHost = {
      ...agents,
      update: async () => {
        throw new KindedError(
          "conflict",
          "Archive already hands work to Mail triage; that would be a loop.",
        );
      },
    };
    const { page, toasts } = await openSubagents(refusing);
    await act(async () => buttonNamed(page, "Add subagent")?.click());
    await act(async () => pickNamed("Archive")?.click());
    expect(toasts.list().map((toast) => toast.title)).toEqual([
      "Archive already hands work to Mail triage; that would be a loop.",
    ]);
    expect(page.querySelector("[aria-label='Remove Archive']")).toBeNull();
    expect(page.querySelector("[aria-label='Remove Writer']")).not.toBeNull();
  });

  it("says why when the hub's agents can't be read, and Try again reads them", async () => {
    const agents = host();
    let works = false;
    const { page } = await openSubagents({
      ...agents,
      team: async (ref) => {
        if (!works) throw new Error("The workspace didn't answer.");
        return agents.team(ref);
      },
    });
    expect(page.textContent).toContain("Couldn't load the hub's agents");
    works = true;
    await act(async () => buttonNamed(page, "Try again")?.click());
    expect(page.textContent).not.toContain("Couldn't load the hub's agents");
    expect(page.querySelector("[aria-label='Remove Writer']")).not.toBeNull();
  });
});
