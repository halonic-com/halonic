// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { AgentsHost } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen } from "../page/agent-page.tsx";
import { buttonNamed, installFakePopover, show, unmount } from "../test-support.tsx";

let restorePopover: () => void = () => undefined;
beforeEach(() => {
  restorePopover = installFakePopover();
});
afterEach(() => {
  unmount();
  restorePopover();
});

const ref = { hubId: "support", id: "refund-helper" };

const host = (agent: { skills?: string[]; knowledge?: string[] } = {}) =>
  memoryAgentsHost({
    hubs: [{ id: "support", name: "Support" }],
    agents: [{ ...ref, name: "Refund helper", ...agent }],
    toolOptions: {
      skills: [
        { id: "refunds", name: "Refund policy" },
        { id: "tone", name: "Friendly tone" },
      ],
      knowledge: [{ id: "handbook", name: "Handbook" }],
    },
  });

async function openTools(agents: AgentsHost = host()) {
  const page = await show(<AgentScreen host={agents} hubId={ref.hubId} id={ref.id} />);
  await act(async () => buttonNamed(page, "Configuration")?.click());
  await act(async () =>
    [...page.querySelectorAll<HTMLElement>("[role=tab]")]
      .find((tab) => tab.textContent === "Tools")
      ?.click(),
  );
  return page;
}

/** The section of one list, by its heading. */
const listNamed = (page: HTMLElement, heading: string) =>
  [...page.querySelectorAll("section")].find(
    (section) => section.querySelector("h3")?.textContent === heading,
  ) as HTMLElement;

const chips = (section: HTMLElement) =>
  [...section.querySelectorAll("li")].map((chip) => chip.textContent);

verifies("agents.configuration.tools", () => {
  it("lists Tools after Harness, with Skills, Knowledge and Connectors", async () => {
    const page = await openTools();
    const pages = page.querySelector('[aria-label="Configuration pages"]') as HTMLElement;
    expect([...pages.querySelectorAll("[role=tab]")].map((tab) => tab.textContent)).toEqual([
      "Behaviour",
      "Model",
      "Harness",
      "Tools",
    ]);
    expect([...page.querySelectorAll("section h3")].map((h) => h.textContent)).toEqual([
      "Skills",
      "Knowledge",
      "Connectors",
    ]);
    expect(listNamed(page, "Skills").textContent).toContain("It uses no skills yet.");
  });

  it("adds a skill from the picker and saves it at once", async () => {
    const agents = host();
    const page = await openTools(agents);
    const skills = listNamed(page, "Skills");
    await act(async () => buttonNamed(skills, "Add skill")?.click());
    const items = [...skills.querySelectorAll<HTMLElement>("[role=menuitem]")];
    expect(items.map((item) => item.textContent)).toEqual(["Refund policy", "Friendly tone"]);

    await act(async () => items[0]?.click());
    expect((await agents.settings(ref)).skills).toEqual(["refunds"]);
    expect(chips(listNamed(page, "Skills"))).toEqual(["Refund policy"]);
  });

  it("removes a skill with its ✕ and says the list is empty", async () => {
    const agents = host({ skills: ["refunds"] });
    const page = await openTools(agents);
    const remove = page.querySelector<HTMLButtonElement>('[aria-label="Remove Refund policy"]');
    await act(async () => remove?.click());

    expect((await agents.settings(ref)).skills).toEqual([]);
    expect(listNamed(page, "Skills").textContent).toContain("It uses no skills yet.");
  });

  it("shows an item the hub can't use by its id, so it can be removed", async () => {
    const page = await openTools(host({ knowledge: ["old-notes"] }));
    expect(chips(listNamed(page, "Knowledge"))).toEqual(["old-notes"]);
    expect(page.querySelector('[aria-label="Remove old-notes"]')).not.toBeNull();
  });

  it("says where to make one when there is nothing to add", async () => {
    const page = await openTools(host({ knowledge: ["handbook"] }));
    const connectors = listNamed(page, "Connectors");
    expect(connectors.textContent).toContain("Make a connector in Library to add it here.");
    expect(buttonNamed(connectors, "Add connector")).toBeUndefined();
    expect(buttonNamed(listNamed(page, "Knowledge"), "Add knowledge")).toBeUndefined();
  });

  it("says it couldn't load the Library, and shows the lists on Try again", async () => {
    const memory = host();
    let works = false;
    const page = await openTools({
      ...memory,
      toolOptions: async (agent) => {
        if (!works) throw new Error("The workspace didn't answer.");
        return memory.toolOptions(agent);
      },
    });
    expect(page.textContent).toContain("Couldn't load the Library");

    works = true;
    await act(async () => buttonNamed(page, "Try again")?.click());
    expect(listNamed(page, "Skills")).toBeDefined();
  });
});
