// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { createCloseStack, type SectionsProps } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentsHost } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen, type AgentScreenProps } from "../page/agent-page.tsx";
import { buttonNamed, openDialogsInJsdom, show, unmount, viewPanel } from "../test-support.tsx";

beforeEach(openDialogsInJsdom);
afterEach(unmount);

const mailTriage = {
  hubId: "acme",
  id: "triage",
  name: "Mail triage",
  agentSteps: [{ id: "classify", instructions: "Sort it." }],
  subagents: ["writer"],
  skills: ["tone"],
  connectors: ["acme-mail"],
};

const host = () =>
  memoryAgentsHost({
    hubs: [{ id: "acme", name: "Acme Mail" }],
    agents: [
      mailTriage,
      { hubId: "acme", id: "writer", name: "Writer" },
      { hubId: "acme", id: "sorter", name: "Sorter", subagents: ["triage"] },
      { hubId: "acme", id: "refunds", name: "Refund checker" },
    ],
    toolOptions: {
      skills: [{ id: "tone", name: "Tone" }],
      connectors: [{ id: "acme-mail", name: "Acme mail" }],
    },
    users: {
      "acme/triage": [
        { hubId: "acme", id: "support-reply", name: "Support reply", stepIds: ["sort", "reply"] },
      ],
    },
    routines: { "acme/triage": [{ hubId: "acme", id: "morning-sort", name: "Morning sort" }] },
  });

/** Opens the agent's page on Flow. */
async function openFlow(props: Partial<AgentScreenProps> & { readonly agents?: AgentsHost } = {}) {
  const { agents = host(), ...rest } = props;
  const page = await show(
    <ToastStoreProvider store={createToastStore()}>
      <AgentScreen
        host={agents}
        hubId="acme"
        id="triage"
        closeStack={createCloseStack()}
        {...rest}
      />
    </ToastStoreProvider>,
  );
  await act(async () => tabNamed(page, "Flow")?.click());
  return page;
}

const tabNamed = (page: HTMLElement, name: string) =>
  [...page.querySelectorAll<HTMLElement>("[role=tab]")].find((tab) =>
    tab.textContent?.startsWith(name),
  );

/** The texts of a side's cards and buttons, by its heading. */
function side(page: HTMLElement, heading: string): readonly string[] {
  const group = [...page.querySelectorAll<HTMLElement>("[role=group]")].find(
    (each) => each.querySelector("h2")?.textContent === heading,
  );
  if (group === undefined) return [];
  return [...group.querySelectorAll<HTMLElement>(":scope > div > *")].map((card) =>
    (card.textContent ?? "").trim(),
  );
}

const topCardTitle = (page: HTMLElement) =>
  page.querySelector("[data-top-card-title]")?.textContent?.trim();

verifies("agents.map.layout-by-side", () => {
  it("puts work in on the left, the agent in the centre, tools below and subagents on the right", async () => {
    const page = await openFlow();
    expect(side(page, "What brings it work")).toEqual([
      "Routine Morning sort",
      "Workflow Support replysort, reply",
      "Agent Sorter",
    ]);
    expect(side(page, "What it can use")).toEqual([
      "Skill Tone",
      "Connector Acme mail",
      "+ Add a tool",
    ]);
    expect(side(page, "Who it hands work to")).toEqual(["Agent Writer", "+ Add subagent"]);
    const map = page.querySelector("[aria-label='How Mail triage fits in']") as HTMLElement;
    expect(map.textContent).toContain("classify ›");
    // The reading order is the DOM order: left, centre, below, right.
    const headings = [...map.querySelectorAll("h2")].map((heading) => heading.textContent);
    expect(headings).toEqual(["What brings it work", "What it can use", "Who it hands work to"]);
    expect(map.textContent?.indexOf("Mail triage")).toBeLessThan(
      map.textContent?.indexOf("What it can use") ?? 0,
    );
  });

  it("names a workflow's card with the steps that run the agent", async () => {
    const page = await openFlow({ openWorkflow: () => undefined });
    expect(
      page.querySelector(
        "[aria-label='Workflow Support reply, uses Mail triage in sort and reply']",
      ),
    ).not.toBeNull();
  });

  it("shows a change to the agent's file without a skeleton", async () => {
    const agents = host();
    const page = await openFlow({ agents });
    await act(async () => agents.update({ hubId: "acme", id: "triage" }, { subagents: [] }));
    expect(side(page, "Who it hands work to")).toEqual(["+ Add subagent"]);
    // The panel's own skeleton, not the Try it chat's lines.
    expect(viewPanel(page).querySelector("[role=status]")).toBeNull();
  });

  it("says why it can't draw the map, with Open as file", async () => {
    const agents = host();
    vi.spyOn(agents, "team").mockRejectedValue(
      new KindedError("unavailable", "The hub can't be read."),
    );
    const openFile = vi.fn();
    const page = await openFlow({ agents, openFile });
    expect(page.textContent).toContain("Couldn't show Mail triage's map");
    expect(page.textContent).toContain("The hub can't be read.");
    // The page's ⋮ menu has an Open as file too; the failure's own button comes after it.
    const buttons = [...page.querySelectorAll("button")];
    await act(async () =>
      buttons
        .filter((each) => each.textContent === "Open as file")
        .at(-1)
        ?.click(),
    );
    expect(openFile).toHaveBeenCalledWith(expect.stringContaining("triage"));
  });
});

verifies("agents.map.add-button-per-side", () => {
  it("shows an empty agent as the centre card and its add buttons only", async () => {
    const page = await openFlow({ id: "refunds" });
    const map = page.querySelector("[aria-label='How Refund checker fits in']") as HTMLElement;
    expect(side(page, "What brings it work")).toEqual([]);
    expect(side(page, "What it can use")).toEqual(["+ Add a tool"]);
    expect(side(page, "Who it hands work to")).toEqual(["+ Add subagent"]);
    expect(buttonNamed(map, "Add trigger")).toBeUndefined();
    expect(map.textContent).toBe(
      "RRefund checkerWhat it can use+ Add a toolWho it hands work to+ Add subagent",
    );
  });

  it("ends the left side in Add trigger once Triggers is added, which opens it on its add step", async () => {
    const Sections = ({ only, step }: SectionsProps) => (
      <p>
        Section {only} on {step ?? "nothing"}
      </p>
    );
    const page = await openFlow({ sections: [{ id: "triggers", title: "Triggers" }], Sections });
    expect(side(page, "What brings it work").at(-1)).toBe("+ Add trigger");
    await act(async () => buttonNamed(page, "+ Add trigger")?.click());
    expect(tabNamed(page, "Configuration")?.getAttribute("aria-selected")).toBe("true");
    // The section is asked to start adding, so Triggers shows its Prompt at once (C561 4.2).
    expect(page.textContent).toContain("Section triggers on add");
    // The section has no heading of its own, so its page's tab takes the focus the button had.
    expect(document.activeElement).toBe(tabNamed(page, "Triggers"));

    // Picked by hand, the page shows the section as it is.
    await act(async () => tabNamed(page, "Tools")?.click());
    await act(async () => tabNamed(page, "Triggers")?.click());
    expect(page.textContent).toContain("Section triggers on nothing");
  });

  it("opens Configuration › Tools from Add a tool, with the focus on its first heading", async () => {
    const page = await openFlow();
    await act(async () => buttonNamed(page, "+ Add a tool")?.click());
    expect(tabNamed(page, "Tools")?.getAttribute("aria-selected")).toBe("true");
    await vi.waitFor(() => expect(document.activeElement?.tagName).toBe("H2"));
    expect(document.activeElement?.textContent).toBe("Skills");
  });

  it("opens Subagents with its dialog from Add subagent", async () => {
    const page = await openFlow({ id: "refunds" });
    await act(async () => buttonNamed(page, "+ Add subagent")?.click());
    expect(tabNamed(page, "Subagents")?.getAttribute("aria-selected")).toBe("true");
    expect(page.querySelector("dialog[open]")?.textContent).toContain(
      "Add a subagent to Refund checker",
    );
  });

  it("opens the Add subagent dialog once per press, not again on coming back to Subagents", async () => {
    const page = await openFlow({ id: "refunds" });
    await act(async () => buttonNamed(page, "+ Add subagent")?.click());
    const dialog = page.querySelector<HTMLElement>("dialog[open]");
    await act(async () => (dialog && buttonNamed(dialog, "Cancel"))?.click());
    expect(page.querySelector("dialog[open]")).toBeNull();
    await act(async () => tabNamed(page, "Tools")?.click());
    await act(async () => tabNamed(page, "Subagents")?.click());
    expect(tabNamed(page, "Subagents")?.getAttribute("aria-selected")).toBe("true");
    expect(page.querySelector("dialog[open]")).toBeNull();
  });
});

verifies("agents.map.clicks", () => {
  it("opens an agent step as a card over the map", async () => {
    const page = await openFlow();
    await act(async () => buttonNamed(page, "classify ›")?.click());
    expect(topCardTitle(page)).toBe("classify");
  });

  it("opens a subagent as a card over the map, with its path", async () => {
    const page = await openFlow();
    await act(async () => buttonNamed(page, "Agent Writer")?.click());
    expect(topCardTitle(page)).toBe("Writer");
    const path = page.querySelector("nav[aria-label='Card path']")?.textContent ?? "";
    expect(path.replace(/\s|›/g, "")).toBe("AcmeMailMailtriageWriter");
  });

  it("opens a routine, a workflow, an agent that hands it work and a tool in their own places", async () => {
    const openRoutine = vi.fn();
    const openWorkflow = vi.fn();
    const openAgent = vi.fn();
    const openLibrary = vi.fn();
    const page = await openFlow({ openRoutine, openWorkflow, openAgent, openLibrary });
    await act(async () => buttonNamed(page, "Routine Morning sort")?.click());
    expect(openRoutine).toHaveBeenCalledWith(expect.objectContaining({ id: "morning-sort" }));
    await act(async () =>
      page
        .querySelector<HTMLElement>(
          "[aria-label='Workflow Support reply, uses Mail triage in sort and reply']",
        )
        ?.click(),
    );
    expect(openWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ id: "support-reply", stepIds: ["sort", "reply"] }),
    );
    await act(async () => buttonNamed(page, "Agent Sorter")?.click());
    expect(openAgent).toHaveBeenCalledWith(expect.objectContaining({ id: "sorter" }));
    await act(async () => buttonNamed(page, "Skill Tone")?.click());
    expect(openLibrary).toHaveBeenCalledWith("skills");
  });

  it("leaves the centre card's name and what the app can't open as text", async () => {
    const page = await openFlow();
    const map = page.querySelector("[aria-label='How Mail triage fits in']") as HTMLElement;
    expect(buttonNamed(map, "Mail triage")).toBeUndefined();
    expect(map.querySelector("[aria-label^='Workflow Support reply']")).toBeNull();
    expect(buttonNamed(map, "Skill Tone")).toBeUndefined();
    expect(buttonNamed(map, "Routine Morning sort")).toBeUndefined();
  });

  it("leaves a routine at the workspace's root as text, since it has no page", async () => {
    const openRoutine = vi.fn();
    const agents = memoryAgentsHost({
      hubs: [{ id: "acme", name: "Acme Mail" }],
      agents: [mailTriage],
      routines: { "acme/triage": [{ hubId: null, id: "weekly-digest", name: "Weekly digest" }] },
    });
    const page = await openFlow({ agents, openRoutine });
    expect(side(page, "What brings it work")).toEqual(["Routine Weekly digest"]);
    expect(buttonNamed(page, "Routine Weekly digest")).toBeUndefined();
  });
});

verifies("agents.map.workflow-card-steps", () => {
  /** Mail triage's map, run by Support reply in the given steps. */
  const runIn = (stepIds: readonly string[]) =>
    memoryAgentsHost({
      hubs: [{ id: "acme", name: "Acme Mail" }],
      agents: [mailTriage],
      users: {
        "acme/triage": [{ hubId: "acme", id: "support-reply", name: "Support reply", stepIds }],
      },
    });

  it("names the one step that runs the agent", async () => {
    const page = await openFlow({ agents: runIn(["draft"]), openWorkflow: () => undefined });
    expect(side(page, "What brings it work")).toEqual(["Workflow Support replydraft"]);
    expect(
      page.querySelector("[aria-label='Workflow Support reply, uses Mail triage in draft']"),
    ).not.toBeNull();
  });

  it("lists more steps in the workflow's order, the last two joined by and", async () => {
    const page = await openFlow({
      agents: runIn(["sort", "check", "reply"]),
      openWorkflow: () => undefined,
    });
    expect(side(page, "What brings it work")).toEqual(["Workflow Support replysort, check, reply"]);
    expect(
      page.querySelector(
        "[aria-label='Workflow Support reply, uses Mail triage in sort, check and reply']",
      ),
    ).not.toBeNull();
  });
});

verifies("agents.map.asks-first", () => {
  /** Mail triage's map, with how many of the connectors' tools run without asking as given. */
  const asking = (
    ...connectors: readonly { readonly id: string; readonly toolsWithoutAsking?: number }[]
  ) =>
    memoryAgentsHost({
      hubs: [{ id: "acme", name: "Acme Mail" }],
      agents: [{ ...mailTriage, subagents: [], connectors: connectors.map((each) => each.id) }],
      toolOptions: { connectors: connectors.map((each) => ({ name: each.id, ...each })) },
    });

  it("shows the hand with the read-only tools that don't ask, and says it in the card's name", async () => {
    const page = await openFlow({
      agents: asking(
        { id: "acme-mail", toolsWithoutAsking: 1 },
        { id: "big-mail", toolsWithoutAsking: 2 },
      ),
      openLibrary: () => undefined,
    });
    expect(side(page, "What it can use")).toEqual([
      "Skill tone",
      "Connector acme-mail✋ Asks first, except 1 read-only tool",
      "Connector big-mail✋ Asks first, except 2 read-only tools",
      "+ Add a tool",
    ]);
    expect(
      page.querySelector("[aria-label='Connector acme-mail, Asks first, except 1 read-only tool']"),
    ).not.toBeNull();
    // The hand is a picture; its words say it.
    const hand = [...page.querySelectorAll("[aria-hidden=true]")].find((each) =>
      each.textContent?.includes("✋"),
    );
    expect(hand).toBeDefined();
  });

  it("says every tool asks first when none runs without asking", async () => {
    const page = await openFlow({ agents: asking({ id: "notes-mcp", toolsWithoutAsking: 0 }) });
    expect(side(page, "What it can use")).toEqual([
      "Skill tone",
      "Connector notes-mcp✋ Every tool asks first",
      "+ Add a tool",
    ]);
  });
});
