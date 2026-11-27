// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentListing, AgentRoutine, AgentsHost, AgentUser } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { show, typeInto, unmount } from "../test-support.tsx";
import { AgentScreen } from "./agent-page.tsx";
import { pageWords } from "./page-words.ts";
import { renamePlaces } from "./use-rename-places.ts";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const sorter: AgentListing = { hubId: "acme", id: "sorter", name: "Sorter" };
const inboxFlow: AgentUser = {
  hubId: "acme",
  id: "inbox-flow",
  name: "Inbox flow",
  stepIds: ["sort"],
  stepNames: ["Sort mail"],
};
const weeklyReport: AgentUser = {
  hubId: "acme",
  id: "weekly-report",
  name: "Weekly report",
  stepIds: ["draft"],
};
const morningDigest: AgentRoutine = { hubId: "acme", id: "morning-digest", name: "Morning digest" };

const hostWith = (users: readonly AgentUser[], routines: readonly AgentRoutine[]): AgentsHost =>
  memoryAgentsHost({
    hubs: [{ id: "acme", name: "acme" }],
    agents: [sorter],
    users: { "acme/sorter": users },
    routines: { "acme/sorter": routines },
  });

const nameInput = (page: HTMLElement) =>
  page.querySelector('input[aria-label="Agent name"]') as HTMLInputElement;
const described = (input: HTMLInputElement) =>
  document.getElementById(input.getAttribute("aria-describedby") ?? "")?.textContent;

verifies("agents.page.rename-places", () => {
  it("says under the name field the three places that use the agent while a new name is typed", async () => {
    const page = await show(
      <AgentScreen
        host={hostWith([inboxFlow, weeklyReport], [morningDigest])}
        hubId="acme"
        id="sorter"
      />,
    );
    expect(page.textContent).not.toContain("Also updates");

    await typeInto(nameInput(page), "Mail sorter");
    const line =
      "Also updates 3 places: Inbox flow (Sort mail), Weekly report (draft), Morning digest (routine)";
    expect(page.textContent).toContain(line);
    expect(described(nameInput(page))).toBe(line);
  });

  it("shows no line when nothing uses the agent", async () => {
    const page = await show(<AgentScreen host={hostWith([], [])} hubId="acme" id="sorter" />);
    await typeInto(nameInput(page), "Mail sorter");
    expect(page.textContent).not.toContain("Also updates");
    expect(nameInput(page).hasAttribute("aria-describedby")).toBe(false);
  });

  it("names each step that runs the agent, and more than 5 places as 4 and the rest", () => {
    const steps: AgentUser = { ...inboxFlow, stepIds: ["a", "b"], stepNames: ["Sort", "Reply"] };
    expect(renamePlaces([steps], [])).toEqual(["Inbox flow (Sort)", "Inbox flow (Reply)"]);

    const routines = ["A", "B", "C", "D", "E", "F"].map((name) => ({ ...morningDigest, name }));
    expect(pageWords.alsoUpdates(renamePlaces([], routines))).toBe(
      "Also updates 6 places: A (routine), B (routine), C (routine), D (routine) and 2 more",
    );
    expect(pageWords.alsoUpdates(["Morning digest (routine)"])).toBe(
      "Also updates 1 place: Morning digest (routine)",
    );
  });
});
