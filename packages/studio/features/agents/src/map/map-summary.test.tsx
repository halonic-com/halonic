// @vitest-environment jsdom

import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { type CloseStack, createCloseStack } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen } from "../page/agent-page.tsx";
import { buttonNamed, openDialogsInJsdom, show, unmount } from "../test-support.tsx";

beforeEach(openDialogsInJsdom);
afterEach(unmount);

const workflow = (id: string, name: string) => ({ hubId: "acme", id, name, steps: 1 });

/** "Mail triage" with four subagents, four tools and three workflows, and "Small" with three of each. */
const host = () =>
  memoryAgentsHost({
    hubs: [{ id: "acme", name: "Acme Mail" }],
    agents: [
      {
        hubId: "acme",
        id: "triage",
        name: "Mail triage",
        subagents: ["writer", "checker", "translator", "filer"],
        skills: ["tone", "brief"],
        knowledge: ["faq"],
        connectors: ["acme-mail"],
      },
      {
        hubId: "acme",
        id: "small",
        name: "Small",
        subagents: ["writer", "checker", "translator"],
        skills: ["tone", "brief"],
        connectors: ["acme-mail"],
      },
      { hubId: "acme", id: "writer", name: "Writer" },
      { hubId: "acme", id: "checker", name: "Checker" },
      { hubId: "acme", id: "translator", name: "Translator" },
      { hubId: "acme", id: "filer", name: "Filer" },
      { hubId: "acme", id: "sorter", name: "Sorter", subagents: ["triage"] },
    ],
    toolOptions: {
      skills: [
        { id: "tone", name: "Tone" },
        { id: "brief", name: "Brief" },
      ],
      knowledge: [{ id: "faq", name: "FAQ" }],
      connectors: [{ id: "acme-mail", name: "Acme mail" }],
    },
    users: {
      "acme/triage": [
        workflow("support-reply", "Support reply"),
        workflow("refunds", "Refunds"),
        workflow("digest", "Digest"),
      ],
      "acme/small": [workflow("support-reply", "Support reply")],
    },
  });

/** Opens the agent's page, which opens on Flow. */
async function openFlow(id: string, closeStack: CloseStack = createCloseStack()) {
  return show(
    <ToastStoreProvider store={createToastStore()}>
      <AgentScreen host={host()} hubId="acme" id={id} closeStack={closeStack} />
    </ToastStoreProvider>,
  );
}

/** The texts of a side's cards and buttons, by its heading. */
function side(page: HTMLElement, heading: string): readonly string[] {
  const group = [...page.querySelectorAll<HTMLElement>("[role=group]")].find(
    (each) => each.querySelector("h2")?.textContent === heading,
  );
  return [...(group?.querySelectorAll<HTMLElement>(":scope > div > *") ?? [])].map((card) =>
    (card.textContent ?? "").trim(),
  );
}

const drawer = (page: HTMLElement) => page.querySelector<HTMLElement>("[data-map-drawer]");

/** The drawer's name, from the title it's labelled by. */
const drawerName = (page: HTMLElement) => {
  const id = drawer(page)?.getAttribute("aria-labelledby") ?? "";
  return document.getElementById(id)?.textContent;
};

verifies("agents.map.side-summary-card", () => {
  it("stands one summary card for a side with more than three items", async () => {
    const page = await openFlow("triage");
    expect(side(page, "What brings it work")).toEqual(["3 workflows · 1 agentwhat brings it work"]);
    expect(side(page, "What it can use")).toEqual([
      "2 skills · 1 knowledge · 1 connectorwhat it can use",
      "+ Add a tool",
    ]);
    expect(side(page, "Who it hands work to")).toEqual([
      "4 subagentswho it hands work to",
      "+ Add subagent",
    ]);
    // Like the cards it stands for, it's on its side's line.
    const summary = buttonNamed(page, "4 subagents");
    expect(summary?.hasAttribute("data-map-card")).toBe(true);
    expect(summary?.getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("keeps the cards of a side with three", async () => {
    const page = await openFlow("small");
    expect(side(page, "Who it hands work to")).toEqual([
      "Agent Writer",
      "Agent Checker",
      "Agent Translator",
      "+ Add subagent",
    ]);
    expect(side(page, "What it can use")).toEqual([
      "Skill Tone",
      "Skill Brief",
      "Connector Acme mail",
      "+ Add a tool",
    ]);
  });
});

verifies("agents.map.summary-drawer", () => {
  it("opens a drawer titled by its side, with every item and the add button last", async () => {
    const page = await openFlow("triage");
    const summary = buttonNamed(page, "4 subagents");
    await act(async () => summary?.click());
    expect(drawerName(page)).toBe("Who it hands work to");
    expect(drawer(page)?.getAttribute("role")).toBe("dialog");
    expect(document.activeElement?.textContent).toBe("Who it hands work to");
    expect(summary?.getAttribute("aria-expanded")).toBe("true");
    const items = [...(drawer(page)?.querySelectorAll("button") ?? [])].map((b) => b.textContent);
    expect(items).toEqual([
      "Agent Writer",
      "Agent Checker",
      "Agent Translator",
      "Agent Filer",
      "+ Add subagent",
    ]);
  });

  it("closes on Esc and gives the focus back to its summary card", async () => {
    const closeStack = createCloseStack();
    const page = await openFlow("triage", closeStack);
    const summary = buttonNamed(page, "2 skills");
    await act(async () => summary?.click());
    expect(drawerName(page)).toBe("What it can use");
    await act(async () => void closeStack.escape());
    expect(drawer(page)).toBeNull();
    expect(document.activeElement).toBe(summary);
    expect(summary?.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on a press on the empty canvas, not on a card", async () => {
    const page = await openFlow("triage");
    await act(async () => buttonNamed(page, "3 workflows")?.click());
    await act(async () => buttonNamed(page, "2 skills")?.click());
    expect(drawerName(page)).toBe("What it can use");
    await act(async () => page.querySelector<HTMLElement>("[data-map-panel]")?.click());
    expect(drawer(page)).toBeNull();
  });

  it("opens a subagent from the drawer as a card, which Esc closes before the drawer", async () => {
    const closeStack = createCloseStack();
    const page = await openFlow("triage", closeStack);
    await act(async () => buttonNamed(page, "4 subagents")?.click());
    const open = drawer(page);
    await act(async () => (open && buttonNamed(open, "Agent Filer"))?.click());
    expect(page.querySelector("[data-top-card-title]")?.textContent?.trim()).toBe("Filer");
    await act(async () => void closeStack.escape());
    expect(page.querySelector("[data-top-card-title]")).toBeNull();
    expect(drawerName(page)).toBe("Who it hands work to");
    await act(async () => void closeStack.escape());
    expect(drawer(page)).toBeNull();
  });
});
