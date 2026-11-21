// @vitest-environment jsdom

import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { createCloseStack } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { AgentRef } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { buttonNamed, openDialogsInJsdom, show, unmount } from "../test-support.tsx";
import { AgentScreen } from "./agent-page.tsx";

beforeEach(openDialogsInJsdom);
afterEach(unmount);

const agent = (id: string, name: string, subagents: string[] = []) => ({
  hubId: "acme",
  id,
  name,
  subagents,
});

const host = () =>
  memoryAgentsHost({
    hubs: [{ id: "acme", name: "Acme Mail" }],
    agents: [
      agent("triage", "Mail triage", ["writer"]),
      agent("writer", "Writer", ["checker"]),
      agent("checker", "Fact checker"),
    ],
  });

async function openSubagents(agents = host(), openAgent?: (agent: AgentRef) => void) {
  const closeStack = createCloseStack();
  const said: string[] = [];
  const page = await show(
    <ToastStoreProvider store={createToastStore()}>
      <AgentScreen
        host={agents}
        hubId="acme"
        id="triage"
        closeStack={closeStack}
        announce={(text) => said.push(text)}
        openAgent={openAgent}
      />
    </ToastStoreProvider>,
  );
  await act(async () => buttonNamed(page, "Configuration")?.click());
  await act(async () =>
    [...page.querySelectorAll<HTMLElement>("[role=tab]")]
      .find((tab) => tab.textContent === "Subagents")
      ?.click(),
  );
  return { page, agents, closeStack, said };
}

/** The top card, or `null` while the panel shows its view. */
const topCard = (page: HTMLElement) =>
  [...page.querySelectorAll<HTMLElement>("section[aria-labelledby]")].find(
    (section) => section.querySelector("[data-top-card-title]") !== null,
  ) ?? null;

const path = (page: HTMLElement) =>
  [...(topCard(page)?.querySelectorAll("nav[aria-label='Card path'] li") ?? [])].map((part) =>
    part.textContent?.replace("›", "").trim(),
  );

async function openCardOf(within: HTMLElement, name: string) {
  await act(async () => buttonNamed(within, name)?.click());
}

verifies("agents.page.cards", () => {
  it("opens a subagent as a card with its path and its own Configuration, narrow", async () => {
    const { page } = await openSubagents();
    await openCardOf(page, "Writer");
    expect(path(page)).toEqual(["Acme Mail", "Mail triage", "Writer"]);
    const card = topCard(page) as HTMLElement;
    expect(card.querySelector("[aria-label='Configuration pages']")?.tagName).toBe("SELECT");
    expect(card.textContent).toContain("Behaviour");
  });

  it("opens a subagent's subagent on top, and a part of the path goes back to it", async () => {
    const { page } = await openSubagents();
    await openCardOf(page, "Writer");
    const card = topCard(page) as HTMLElement;
    const pages = card.querySelector(
      "select[aria-label='Configuration pages']",
    ) as HTMLSelectElement;
    // The narrow page list is a Select; picking Subagents shows Writer's own.
    await act(async () => {
      pages.value = "subagents";
      pages.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await openCardOf(topCard(page) as HTMLElement, "Fact checker");
    expect(path(page)).toEqual(["Acme Mail", "Mail triage", "Writer", "Fact checker"]);

    await act(async () => buttonNamed(topCard(page) as HTMLElement, "Writer")?.click());
    expect(path(page)).toEqual(["Acme Mail", "Mail triage", "Writer"]);
  });

  it("closes the top card with Esc", async () => {
    const { page, closeStack } = await openSubagents();
    await openCardOf(page, "Writer");
    expect(topCard(page)).not.toBeNull();
    act(() => {
      closeStack.escape();
    });
    expect(topCard(page)).toBeNull();
  });

  it("closes the stack when another view is picked", async () => {
    const { page } = await openSubagents();
    await openCardOf(page, "Writer");
    await act(async () => buttonNamed(page, "Runs")?.click());
    await act(async () => buttonNamed(page, "Configuration")?.click());
    expect(topCard(page)).toBeNull();
  });

  it("drops the card of an agent that is gone, and says so", async () => {
    const { page, agents, said } = await openSubagents();
    await openCardOf(page, "Writer");
    await act(async () => {
      await agents.trash({ hubId: "acme", id: "writer" });
    });
    expect(topCard(page)).toBeNull();
    expect(said).toEqual(["Writer was removed."]);
  });

  it("shows the subagent's team chart in its card: who hands it work above, its subagents below", async () => {
    const opened: AgentRef[] = [];
    const { page } = await openSubagents(host(), (agent) => opened.push(agent));
    await openCardOf(page, "Writer");
    const chart = topCard(page)?.querySelector(
      "[aria-label='Who works with Writer']",
    ) as HTMLElement;
    const rows = [...chart.querySelectorAll("ul")].map((row) => row.textContent);
    expect(rows).toEqual(["Mail triage", "Fact checker"]);
    expect(chart.querySelector("[aria-current]")?.textContent).toBe("Writer");
    await act(async () => buttonNamed(chart, "Fact checker")?.click());
    expect(opened).toEqual([expect.objectContaining({ hubId: "acme", id: "checker" })]);
  });

  it("leads from the subagent's card to its own page with Open Writer ›", async () => {
    const opened: AgentRef[] = [];
    const { page } = await openSubagents(host(), (agent) => opened.push(agent));
    await openCardOf(page, "Writer");
    await act(async () => buttonNamed(topCard(page) as HTMLElement, "Open Writer ›")?.click());
    expect(opened).toEqual([{ hubId: "acme", id: "writer" }]);
  });

  it("has no Open Writer › where the app can't open pages", async () => {
    const { page } = await openSubagents();
    await openCardOf(page, "Writer");
    expect(buttonNamed(topCard(page) as HTMLElement, "Open Writer ›")).toBeUndefined();
  });

  it("shows no team chart once the agent works alone", async () => {
    const agents = memoryAgentsHost({
      hubs: [{ id: "acme", name: "Acme Mail" }],
      agents: [agent("triage", "Mail triage", ["writer"]), agent("writer", "Writer")],
    });
    const { page } = await openSubagents(agents);
    await openCardOf(page, "Writer");
    const chart = () => topCard(page)?.querySelector("[aria-label='Who works with Writer']");
    expect(chart()).not.toBeNull();
    await act(async () => {
      await agents.update({ hubId: "acme", id: "triage" }, { subagents: [] });
    });
    expect(topCard(page)).not.toBeNull();
    expect(chart()).toBeNull();
  });
});
