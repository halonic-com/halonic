// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { createCloseStack } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentsHost } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen, type AgentScreenProps } from "../page/agent-page.tsx";
import { buttonNamed, openDialogsInJsdom, show, unmount } from "../test-support.tsx";

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
      "acme/triage": [{ hubId: "acme", id: "support-reply", name: "Support reply", steps: 2 }],
    },
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
      "Workflow Support reply2 steps",
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

  it("names a workflow's card with how many of its steps run the agent", async () => {
    const page = await openFlow({ openWorkflow: () => undefined });
    expect(
      page.querySelector("[aria-label='Workflow Support reply, uses Mail triage in 2 steps']"),
    ).not.toBeNull();
  });

  it("shows a change to the agent's file without a skeleton", async () => {
    const agents = host();
    const page = await openFlow({ agents });
    await act(async () => agents.update({ hubId: "acme", id: "triage" }, { subagents: [] }));
    expect(side(page, "Who it hands work to")).toEqual(["+ Add subagent"]);
    expect(page.querySelector("[role=status]")).toBeNull();
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

  it("ends the left side in Add trigger once Triggers is added, which opens it", async () => {
    const Sections = ({ only }: { readonly only?: string }) => <p>Section {only}</p>;
    const page = await openFlow({ sections: [{ id: "triggers", title: "Triggers" }], Sections });
    expect(side(page, "What brings it work").at(-1)).toBe("+ Add trigger");
    await act(async () => buttonNamed(page, "+ Add trigger")?.click());
    expect(tabNamed(page, "Configuration")?.getAttribute("aria-selected")).toBe("true");
    expect(page.textContent).toContain("Section triggers");
  });

  it("opens Configuration › Tools from Add a tool", async () => {
    const page = await openFlow();
    await act(async () => buttonNamed(page, "+ Add a tool")?.click());
    expect(tabNamed(page, "Tools")?.getAttribute("aria-selected")).toBe("true");
  });

  it("opens Subagents with its dialog from Add subagent", async () => {
    const page = await openFlow({ id: "refunds" });
    await act(async () => buttonNamed(page, "+ Add subagent")?.click());
    expect(tabNamed(page, "Subagents")?.getAttribute("aria-selected")).toBe("true");
    expect(page.querySelector("dialog[open]")?.textContent).toContain(
      "Add a subagent to Refund checker",
    );
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

  it("opens a workflow, an agent that hands it work and a tool in their own places", async () => {
    const openWorkflow = vi.fn();
    const openAgent = vi.fn();
    const openLibrary = vi.fn();
    const page = await openFlow({ openWorkflow, openAgent, openLibrary });
    await act(async () =>
      page
        .querySelector<HTMLElement>(
          "[aria-label='Workflow Support reply, uses Mail triage in 2 steps']",
        )
        ?.click(),
    );
    expect(openWorkflow).toHaveBeenCalledWith(expect.objectContaining({ id: "support-reply" }));
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
  });
});
