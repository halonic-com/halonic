// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
import { PhoneTopBarSlot } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentListing, AgentsHost, TrashedAgent } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import {
  buttonNamed,
  installFakePopover,
  redraw,
  show,
  typeInto,
  unmount,
} from "../test-support.tsx";
import { AgentScreen } from "./agent-page.tsx";
import { markFreshAgent } from "./fresh-agents.ts";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const sorter: AgentListing = { hubId: "acme", id: "sorter", name: "Sorter" };
const hostWith = () => memoryAgentsHost({ hubs: [{ id: "acme", name: "acme" }], agents: [sorter] });

verifies("agents.page.frame", () => {
  it("shows AGENT and the name at once, and opens on Configuration", async () => {
    const page = await show(<AgentScreen host={hostWith()} hubId="acme" id="sorter" />);

    expect(page.textContent).toContain("AGENT");
    expect(page.querySelector("h1")?.textContent).toBe("Sorter");
    expect(buttonNamed(page, "Configuration")?.getAttribute("aria-selected")).toBe("true");
    expect(page.querySelector("[role=status]")).toBeNull();
  });

  it("says on the empty Runs tab that the agent runs as a step in a workflow", async () => {
    const page = await show(<AgentScreen host={hostWith()} hubId="acme" id="sorter" />);
    await act(async () => buttonNamed(page, "Runs")?.click());

    expect(page.textContent).toContain("Runs aren't listed by agent yet.");
    expect(buttonNamed(page, "Open the Runs page ›")).toBeUndefined();
    expect(page.textContent).toContain(
      "Sorter runs as a step in a workflow. Add it to one in Workflows.",
    );
  });

  it("ends the Runs line in Open the Runs page ›, which opens the Runs page", async () => {
    const openRuns = vi.fn();
    const page = await show(
      <AgentScreen host={hostWith()} hubId="acme" id="sorter" openRuns={openRuns} />,
    );
    await act(async () => buttonNamed(page, "Runs")?.click());

    expect(page.textContent).toContain("Runs aren't listed by agent yet. Open the Runs page ›");
    await act(async () => buttonNamed(page, "Open the Runs page ›")?.click());
    expect(openRuns).toHaveBeenCalledOnce();
  });

  it("doesn't say an agent a workflow runs has no runs, and points to that workflow's runs", async () => {
    const host = memoryAgentsHost({
      hubs: [{ id: "acme", name: "acme" }],
      agents: [sorter],
      users: { "acme/sorter": [{ hubId: "acme", id: "reply", name: "Support reply", steps: 1 }] },
    });
    const page = await show(<AgentScreen host={host} hubId="acme" id="sorter" />);
    await act(async () => buttonNamed(page, "Runs")?.click());

    expect(page.textContent).not.toContain("Runs aren't listed by agent yet.");
    expect(page.textContent).toContain(
      "Sorter runs as a step in Support reply. That workflow's runs are in Runs.",
    );
  });

  it("counts the workflows when several run the agent, and doesn't guess when they can't be read", async () => {
    const reply = { hubId: "acme", id: "reply", name: "Support reply", steps: 1 };
    const triage = { hubId: "acme", id: "triage", name: "Triage", steps: 2 };
    const several = memoryAgentsHost({
      hubs: [{ id: "acme", name: "acme" }],
      agents: [sorter],
      users: { "acme/sorter": [reply, triage] },
    });
    const page = await show(<AgentScreen host={several} hubId="acme" id="sorter" />);
    await act(async () => buttonNamed(page, "Runs")?.click());
    expect(page.textContent).toContain(
      "Sorter runs as a step in 2 workflows. Their runs are in Runs.",
    );
    unmount();

    const unread: AgentsHost = {
      ...hostWith(),
      referencesTo: () => Promise.reject(new Error("The workflows couldn't be read.")),
    };
    const failed = await show(<AgentScreen host={unread} hubId="acme" id="sorter" />);
    await act(async () => buttonNamed(failed, "Runs")?.click());
    expect(failed.textContent).not.toContain("Runs aren't listed by agent yet.");
    expect(failed.textContent).toContain("Sorter runs as a step in a workflow.");
  });

  it("doesn't repeat the name on a phone, where the top bar has it", async () => {
    const page = await show(
      <PresentationProvider presentation="phone">
        <AgentScreen host={hostWith()} hubId="acme" id="sorter" />
      </PresentationProvider>,
    );
    expect(page.textContent).toContain("AGENT");
    expect(page.querySelector("h1")?.className).toContain("sr-only");
  });

  it("shows a skeleton only after 300 ms, and Still loading with Try again after 10 s", async () => {
    const slow: AgentsHost = { ...hostWith(), read: () => new Promise<AgentListing>(() => {}) };
    const page = await show(<AgentScreen host={slow} hubId="acme" id="sorter" />);
    expect(page.querySelector("[role=status]")).toBeNull();

    await act(async () => vi.advanceTimersByTime(300));
    expect(page.querySelector("[role=status]")?.textContent).toContain("Loading sorter");
    expect(page.textContent).not.toContain("Still loading");

    await act(async () => vi.advanceTimersByTime(10_000));
    expect(page.textContent).toContain("Still loading");
    expect(buttonNamed(page, "Try again")).toBeDefined();
  });

  it("says why it couldn't read the agent, and Try again reads it and focuses the name", async () => {
    let fail = true;
    const base = hostWith();
    const host: AgentsHost = {
      ...base,
      read: async (ref) => {
        if (fail) throw new KindedError("unavailable", "The engine isn't answering.");
        return base.read(ref);
      },
    };
    const page = await show(<AgentScreen host={host} hubId="acme" id="sorter" />);
    expect(page.textContent).toContain("Couldn't load this agent");
    expect(page.textContent).toContain("The engine isn't answering.");

    fail = false;
    await act(async () => buttonNamed(page, "Try again")?.click());
    expect(page.querySelector("h1")?.textContent).toBe("Sorter");
    expect(document.activeElement).toBe(page.querySelector("h1"));
  });

  it("shows the item-gone state, with the way to the Agents list, for an agent that isn't there", async () => {
    const goToAgents = vi.fn();
    const page = await show(
      <AgentScreen host={hostWith()} hubId="acme" id="ghost" goToAgents={goToAgents} />,
    );
    expect(page.textContent).toContain("Agents");
    await act(async () => buttonNamed(page, "Go to Agents")?.click());
    expect(goToAgents).toHaveBeenCalled();
  });

  it("shows the new name when the agent is renamed, without a skeleton", async () => {
    const files = new Map([["acme/sorter", sorter]]);
    const listeners = new Set<() => void>();
    const host: AgentsHost = {
      ...hostWith(),
      read: async (ref) => files.get(`${ref.hubId}/${ref.id}`) as AgentListing,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const page = await show(<AgentScreen host={host} hubId="acme" id="sorter" />);

    files.set("acme/sorter", { ...sorter, name: "Mail sorter" });
    await act(async () => {
      for (const listener of listeners) listener();
    });
    expect(page.querySelector("h1")?.textContent).toBe("Mail sorter");
    expect(page.querySelector("[role=status]")).toBeNull();
  });
});

const nameInput = (page: HTMLElement) => page.querySelector("input") as HTMLInputElement;
const press = (input: HTMLInputElement, key: string) =>
  act(async () => void input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
const leave = (input: HTMLInputElement) =>
  act(async () => void input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));

verifies("agents.page.rename", () => {
  const writer: AgentListing = { hubId: "acme", id: "writer", name: "Writer" };
  const twoAgents = () =>
    memoryAgentsHost({ hubs: [{ id: "acme", name: "acme" }], agents: [sorter, writer] });
  const nameInFile = async (host: AgentsHost) => (await host.read(sorter)).name;

  it("applies the name when the person leaves the field, and keeps the id", async () => {
    const host = twoAgents();
    const page = await show(<AgentScreen host={host} hubId="acme" id="sorter" />);
    await typeInto(nameInput(page), "Mail sorter");
    expect(await nameInFile(host)).toBe("Sorter");

    await leave(nameInput(page));
    expect(await nameInFile(host)).toBe("Mail sorter");
    expect((await host.list()).map((agent) => agent.id)).toEqual(["sorter", "writer"]);
  });

  it("says why a taken or empty name isn't applied, and puts the old one back", async () => {
    const host = twoAgents();
    const page = await show(<AgentScreen host={host} hubId="acme" id="sorter" />);
    await typeInto(nameInput(page), "writer");
    expect(page.textContent).toContain("An agent called writer already exists.");
    await leave(nameInput(page));
    expect(await nameInFile(host)).toBe("Sorter");
    expect(nameInput(page).value).toBe("Sorter");

    await typeInto(nameInput(page), "  ");
    expect(page.textContent).toContain("Give it a name.");
    await press(nameInput(page), "Enter");
    expect(await nameInFile(host)).toBe("Sorter");
  });

  it("puts the old name back on Esc", async () => {
    const host = twoAgents();
    const page = await show(<AgentScreen host={host} hubId="acme" id="sorter" />);
    await typeInto(nameInput(page), "Other");
    await press(nameInput(page), "Escape");
    expect(nameInput(page).value).toBe("Sorter");
    expect(await nameInFile(host)).toBe("Sorter");
  });
});

verifies("agents.page.menu", () => {
  let restorePopover: () => void;
  beforeEach(() => {
    restorePopover = installFakePopover();
  });
  afterEach(() => restorePopover());

  const settled = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  const menuButton = (page: HTMLElement) =>
    page.querySelector<HTMLElement>('button[aria-label="More actions for Sorter"]');
  const entries = () =>
    [...document.querySelectorAll('[role="menuitem"]')].map((each) => each.textContent);

  async function pick(page: HTMLElement, entry: string) {
    act(() => menuButton(page)?.click());
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (each) => each.textContent === entry,
    );
    await act(async () => item?.click());
    await settled();
  }

  async function open(
    host: AgentsHost,
    props: { phone?: boolean; openFile?: (path: string) => void } = {},
  ) {
    const toasts = createToastStore();
    const screenOf = (shown: AgentsHost) => {
      const screen = (
        <ToastStoreProvider store={toasts}>
          <AgentScreen
            host={shown}
            hubId="acme"
            id="sorter"
            {...(props.openFile ? { openFile: props.openFile } : {})}
          />
        </ToastStoreProvider>
      );
      return props.phone ? (
        <PresentationProvider presentation="phone">{screen}</PresentationProvider>
      ) : (
        screen
      );
    };
    const page = await show(screenOf(host));
    await settled();
    /** Draws the page again with another host, so it reads the agent over. */
    const redrawWith = async (shown: AgentsHost) => {
      await redraw(screenOf(shown));
      await settled();
    };
    return { page, toasts, redrawWith };
  }

  it("has Open as file and Delete in the header's ⋮ menu", async () => {
    const { page } = await open(hostWith(), { openFile: () => undefined });
    act(() => menuButton(page)?.click());

    expect(entries()).toEqual(["Open as file", "Delete"]);
  });

  it("has Delete only on a phone, or where the app can't open a file", async () => {
    const phone = await open(hostWith(), { phone: true, openFile: () => undefined });
    act(() => menuButton(phone.page)?.click());
    expect(entries()).toEqual(["Delete"]);
    unmount();

    const noFile = await open(hostWith());
    act(() => menuButton(noFile.page)?.click());
    expect(entries()).toEqual(["Delete"]);
  });

  it("puts the ⋮ in the phone's top bar, not the header, and takes it away after Delete", async () => {
    const topBar = document.createElement("div");
    document.body.append(topBar);
    const page = await show(
      <PresentationProvider presentation="phone">
        <PhoneTopBarSlot value={topBar}>
          <AgentScreen host={hostWith()} hubId="acme" id="sorter" />
        </PhoneTopBarSlot>
      </PresentationProvider>,
    );
    await settled();
    expect(menuButton(page)).toBeNull();
    expect(menuButton(topBar)).not.toBeNull();

    await pick(topBar, "Delete");

    expect(page.textContent).toContain("This agent was deleted");
    expect(menuButton(topBar)).toBeNull();
    expect(document.activeElement?.textContent).toBe("Undo");
    topBar.remove();
  });

  it("opens the agent's file in a tab", async () => {
    const openFile = vi.fn();
    const { page } = await open(hostWith(), { openFile });

    await pick(page, "Open as file");

    expect(openFile).toHaveBeenCalledWith("hubs/acme/agents/sorter.agent.yaml");
  });

  it("replaces the page with a strip with Undo after Delete, and Undo brings the page back with its name focused", async () => {
    const { page, toasts } = await open(hostWith());

    await pick(page, "Delete");

    expect(page.textContent).toContain("This agent was deleted");
    expect(document.activeElement?.textContent).toBe("Undo");
    expect(toasts.list()).toEqual([]);
    expect(page.textContent).not.toContain("AGENT");

    await act(async () => buttonNamed(page, "Undo")?.click());
    await settled();
    expect(page.textContent).toContain("AGENT");
    expect(document.activeElement).toBe(page.querySelector("h1"));
  });

  /** A host whose Delete hands the test its way back, as the workspace's undo (Ctrl Z) has it. */
  function hostKeepingUndo() {
    const host = hostWith();
    const trash = host.trash;
    const kept: { trashed?: TrashedAgent } = {};
    host.trash = async (ref) => {
      kept.trashed = await trash(ref);
      return kept.trashed;
    };
    return { host, kept };
  }

  it("brings the page back when the workspace's undo puts the agent back, not only the strip's Undo", async () => {
    const { host, kept } = hostKeepingUndo();
    const { page } = await open(host);

    await pick(page, "Delete");
    expect(page.textContent).toContain("This agent was deleted");

    await act(async () => kept.trashed?.undo());
    await settled();
    expect(page.textContent).not.toContain("This agent was deleted");
    expect(page.textContent).toContain("AGENT");
    expect(document.activeElement).toBe(page.querySelector("h1"));
  });

  it("names the agent, not its id, when Undo can't put it back", async () => {
    const host = hostWith();
    const trash = host.trash;
    // The agent is gone, so the page can't read its name any more, and the way back fails.
    host.trash = async (ref) => {
      await trash(ref);
      return {
        undo: async () => {
          throw new KindedError("conflict", "Another change came after the delete.");
        },
      };
    };
    const { page, toasts, redrawWith } = await open(host);

    await pick(page, "Delete");
    // A fresh read can't find the agent, so the page falls back to its id for the name.
    await redrawWith({ ...host });
    await act(async () => buttonNamed(page, "Undo")?.click());
    await settled();

    expect(toasts.list()[0]).toMatchObject({ tone: "danger", title: "Couldn't put Sorter back" });
  });

  it("adds the workflow steps that now show an error to the strip", async () => {
    const host = memoryAgentsHost({
      hubs: [{ id: "acme", name: "acme" }],
      agents: [sorter],
      users: { "acme/sorter": [{ hubId: "acme", id: "reply", name: "Reply", steps: 1 }] },
    });
    const { page } = await open(host);

    await pick(page, "Delete");

    expect(page.textContent).toContain("This agent was deleted.");
    expect(page.textContent).toContain(
      "1 workflow step now shows an error until you pick another agent.",
    );
  });

  it("says why it couldn't move the agent, in a toast that stays, and keeps the page", async () => {
    const host = hostWith();
    host.trash = async () => {
      throw new KindedError("unavailable", "the disk is full");
    };
    const { page, toasts } = await open(host);

    await pick(page, "Delete");

    expect(toasts.list()[0]).toMatchObject({
      tone: "danger",
      title: "Couldn't delete Sorter: the disk is full.",
      sticky: true,
      action: { label: "Try again" },
    });
    expect(page.textContent).toContain("AGENT");
  });
});

verifies("agents.page.new-agent", () => {
  const instructionsBox = (page: HTMLElement) => page.querySelector("textarea");

  it("opens a just-made agent on Behaviour with Instructions focused, and later opens on Runs", async () => {
    markFreshAgent("acme", "sorter");
    const first = await show(<AgentScreen host={hostWith()} hubId="acme" id="sorter" />);

    const box = instructionsBox(first);
    expect(box).not.toBeNull();
    expect(document.activeElement).toBe(box);
    expect(first.textContent).not.toContain("No runs with this agent yet.");
    unmount();

    const later = await show(<AgentScreen host={hostWith()} hubId="acme" id="sorter" />);
    expect(later.textContent).toContain("No runs with this agent yet.");
    expect(instructionsBox(later)).toBeNull();
  });

  it("leaves other agents on Runs", async () => {
    markFreshAgent("acme", "someone-else");
    const page = await show(<AgentScreen host={hostWith()} hubId="acme" id="sorter" />);

    expect(page.textContent).toContain("No runs with this agent yet.");
  });

  it("doesn't take the focus again when the person leaves Behaviour and comes back", async () => {
    markFreshAgent("acme", "sorter");
    const page = await show(<AgentScreen host={hostWith()} hubId="acme" id="sorter" />);
    const tab = (name: string) =>
      [...page.querySelectorAll<HTMLElement>("[role=tab]")].find(
        (each) => each.textContent === name,
      );
    await act(async () => tab("Model")?.click());
    await act(async () => tab("Behaviour")?.click());

    expect(instructionsBox(page)).not.toBeNull();
    expect(document.activeElement).not.toBe(instructionsBox(page));
  });
});
