// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { engineWords, limitedLookup } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type AgentListing, AgentsHostService } from "../api.ts";
import { agentsFeature } from "../feature.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { isFreshAgent } from "../page/fresh-agents.ts";
import {
  buttonNamed,
  openDialogsInJsdom,
  show,
  typeInto,
  typeIntoArea,
  unmount,
} from "../test-support.tsx";
import { AgentsPage, AgentsView } from "./agents-page.tsx";
import { requestNewAgent } from "./new-request.ts";

beforeEach(openDialogsInJsdom);
afterEach(unmount);

const hubs = [
  { id: "acme", name: "acme" },
  { id: "beta", name: "beta" },
];
const sorter: AgentListing = {
  hubId: "acme",
  id: "sorter",
  name: "Sorter",
  description: "Sorts the inbox.",
  model: "smart",
};
const refundChecker: AgentListing = { hubId: "acme", id: "refund-checker", name: "Refund checker" };

const hostWith = (agents: readonly AgentListing[] = [sorter, refundChecker], hubList = hubs) =>
  memoryAgentsHost({ hubs: hubList, agents });

function rowOf(page: HTMLElement, name: string): HTMLElement {
  const row = [...page.querySelectorAll<HTMLElement>('[role="gridcell"]')].find((each) =>
    each.textContent?.includes(name),
  );
  if (row === undefined) throw new Error(`no row for ${name}`);
  return row;
}

verifies("agents.list.rows-and-states", () => {
  it("lists each hub's agents by name, with a letter avatar, the description and the model", async () => {
    const page = await show(<AgentsView host={hostWith()} />);
    const text = page.textContent ?? "";

    expect(page.querySelector("h1")?.textContent).toBe("Agents");
    expect(text.indexOf("Refund checker")).toBeLessThan(text.indexOf("Sorter"));
    expect(text).toContain("SSorter");
    expect(text).toContain("Sorts the inbox.");
    expect(text).toContain("smart");
    expect(text).toContain("No agents in beta yet.");
  });

  it("opens the agent of the chosen row, in a new tab on Ctrl-click", async () => {
    const open = vi.fn();
    const openInNewTab = vi.fn();
    const page = await show(
      <AgentsView host={hostWith()} open={open} openInNewTab={openInNewTab} />,
    );

    await act(async () => rowOf(page, "Sorter").click());
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ hubId: "acme", id: "sorter" }));

    await act(async () =>
      rowOf(page, "Sorter").dispatchEvent(
        new MouseEvent("click", { bubbles: true, ctrlKey: true }),
      ),
    );
    expect(openInNewTab).toHaveBeenCalledWith(expect.objectContaining({ id: "sorter" }));
  });

  it("opens an agent as an item of the agent kind from the place", async () => {
    const openItem = vi.fn();
    const host = hostWith();
    const context = {
      openItem,
      services: limitedLookup(agentsFeature, {
        get: (key: unknown) => (key === AgentsHostService ? host : undefined),
      }),
    };
    const page = await show(<AgentsPage context={context as never} />);

    await act(async () => rowOf(page, "Sorter").click());

    expect(openItem).toHaveBeenCalledWith({ kind: "agent", hub: "acme", id: "sorter" });
  });

  it("offers no New agent while the agents load, and offers it once they have, even with no hub", async () => {
    const loading = { ...hostWith(), list: () => new Promise<never>(() => {}) };
    expect(buttonNamed(await show(<AgentsView host={loading} />), "New agent")).toBeUndefined();
    unmount();

    const page = await show(<AgentsView host={hostWith([], [])} />);
    expect(buttonNamed(page, "New agent")).toBeDefined();
  });

  it("shows only the empty state, with its one button, when there are no agents", async () => {
    const page = await show(<AgentsView host={hostWith([])} />);

    expect(page.textContent).toContain("No agents yet");
    expect(page.textContent).toContain(
      "An agent is an AI worker you describe in a file: its instructions, model, skills, knowledge and tools.",
    );
    expect(page.querySelector('input[type="search"]')).toBeNull();
    expect(
      [...page.querySelectorAll("button")].filter((b) => b.textContent === "New agent"),
    ).toHaveLength(1);
  });

  it("says which agents match nothing", async () => {
    const page = await show(<AgentsView host={hostWith()} />);
    const search = page.querySelector<HTMLInputElement>('input[type="search"]');
    if (search === null) throw new Error("no search field");

    await typeInto(search, "zzz");

    expect(page.textContent).toContain('No agents match "zzz".');
  });

  it("shows the loading rows, then shows the can't-load state with Try again", async () => {
    const loading = { ...hostWith(), list: () => new Promise<never>(() => {}) };
    const busy = await show(<AgentsView host={loading} />);
    expect(busy.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(busy.textContent).not.toContain("Sorter");
    unmount();

    const failing = {
      ...hostWith(),
      list: vi.fn().mockRejectedValueOnce(new KindedError("unavailable", "no")),
    };
    failing.list.mockResolvedValue([sorter]);
    const page = await show(<AgentsView host={failing} />);
    expect(page.textContent).toContain("Couldn't load agents");
    expect(page.textContent).toContain(engineWords["desktop-app"].notAnswering);

    await act(async () => buttonNamed(page, "Try again")?.click());

    expect(page.textContent).toContain("Sorter");
    expect(page.textContent).not.toContain("Couldn't load agents");
  });

  it("keeps the rows with a Try again line when a later read fails", async () => {
    const host = hostWith();
    let changed = () => {};
    const flaky = {
      ...host,
      subscribe: (listener: () => void) => {
        changed = listener;
        return () => {};
      },
    };
    const page = await show(<AgentsView host={flaky} />);
    flaky.list = () => Promise.reject(new KindedError("unavailable", "no"));

    await act(async () => changed());

    expect(page.textContent).toContain("Sorter");
    expect(page.textContent).toContain(engineWords["desktop-app"].showingLast);
    expect(buttonNamed(page, "Try again")).toBeDefined();
  });

  it("reads again when the host says the agents changed", async () => {
    const host = hostWith();
    const page = await show(<AgentsView host={host} />);

    await act(async () => void host.create({ name: "Fresh one", hubId: "beta" }));

    expect(page.textContent).toContain("Fresh one");
  });

  it("leaves the focus where it is when the host's change comes with a payload", async () => {
    let changed: (payload: unknown) => void = () => {};
    const host = {
      ...hostWith(),
      // Like the Studio's files.changed event, which hands its listeners the changed paths.
      subscribe: (listener: (payload: unknown) => void) => {
        changed = listener;
        return () => {};
      },
    };
    const page = await show(<AgentsView host={host} />);
    const search = page.querySelector<HTMLInputElement>('input[type="search"]');
    if (search === null) throw new Error("no search field");
    search.focus();

    await act(async () => changed({ paths: ["acme/agents/sorter.md"] }));

    expect(document.activeElement).toBe(search);
  });

  it("keeps the newest read when an older read settles after it", async () => {
    const reads: ((rows: readonly AgentListing[]) => void)[] = [];
    let changed = () => {};
    const host = {
      ...hostWith([]),
      list: () => new Promise<readonly AgentListing[]>((resolve) => reads.push(resolve)),
      subscribe: (listener: () => void) => {
        changed = listener;
        return () => {};
      },
    };
    const page = await show(<AgentsView host={host} />);
    await act(async () => changed());
    expect(reads).toHaveLength(2);

    await act(async () => reads[1]?.([sorter]));
    await act(async () => reads[0]?.([]));

    expect(page.textContent).toContain("Sorter");
    expect(page.textContent).not.toContain("No agents yet");
  });

  it("creates an agent from New agent and opens it", async () => {
    const open = vi.fn();
    const host = hostWith();
    const page = await show(<AgentsView host={host} open={open} />);

    await act(async () => buttonNamed(page, "New agent")?.click());
    const input = document.querySelector<HTMLInputElement>("dialog input");
    if (input === null) throw new Error("no name field");
    await typeInto(input, "Fresh one");
    await act(async () => buttonNamed(document.body, "Create")?.click());

    expect(open).toHaveBeenCalledWith({ hubId: "acme", id: "fresh-one" });
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("marks an agent made with nothing written, so its page opens on the instructions", async () => {
    const page = await show(<AgentsView host={hostWith()} open={vi.fn()} />);

    await act(async () => buttonNamed(page, "New agent")?.click());
    const input = document.querySelector<HTMLInputElement>("dialog input");
    if (input === null) throw new Error("no name field");
    await typeInto(input, "Blank");
    await act(async () => buttonNamed(document.body, "Create")?.click());

    expect(isFreshAgent("acme", "blank")).toBe(true);
  });

  it("doesn't mark an agent made with instructions written", async () => {
    const page = await show(<AgentsView host={hostWith()} open={vi.fn()} />);

    await act(async () => buttonNamed(page, "New agent")?.click());
    const input = document.querySelector<HTMLInputElement>("dialog input");
    const area = document.querySelector<HTMLTextAreaElement>("dialog textarea");
    if (input === null || area === null) throw new Error("no fields");
    await typeInto(input, "Writer");
    await typeIntoArea(area, "Check refunds.");
    await act(async () => buttonNamed(document.body, "Create")?.click());

    expect(isFreshAgent("acme", "writer")).toBe(false);
  });

  it("opens New agent when Ctrl K asks for it, even before the page is drawn", async () => {
    requestNewAgent();
    await show(<AgentsView host={hostWith()} />);

    expect(document.querySelector("dialog")).not.toBeNull();
  });

  it("opens Ctrl K's New agent in a workspace with no hub, and only once", async () => {
    requestNewAgent();
    await show(<AgentsView host={hostWith([], [])} />);
    expect(document.querySelector("dialog")).not.toBeNull();

    unmount();
    await show(<AgentsView host={hostWith()} />);
    expect(document.querySelector("dialog")).toBeNull();
  });
});
