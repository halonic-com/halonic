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

async function openTools(
  agents: AgentsHost = host(),
  openLibrary?: (list: "skills" | "knowledge" | "connectors") => void,
) {
  const page = await show(
    <AgentScreen host={agents} hubId={ref.hubId} id={ref.id} openLibrary={openLibrary} />,
  );
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
    // An empty list shows only its Add button (microcopy 8.5).
    const skills = listNamed(page, "Skills");
    expect(chips(skills)).toEqual([]);
    expect(skills.querySelector("p")).toBeNull();
    expect(buttonNamed(skills, "Add skill")).toBeDefined();
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

  it("moves focus to Open Library › when the last skill is added and the Add button goes", async () => {
    const page = await openTools(host({ skills: ["refunds"] }), () => undefined);
    const skills = listNamed(page, "Skills");
    await act(async () => buttonNamed(skills, "Add skill")?.click());
    await act(async () => skills.querySelector<HTMLElement>("[role=menuitem]")?.click());

    expect(buttonNamed(skills, "Add skill")).toBeUndefined();
    expect(document.activeElement).toBe(buttonNamed(skills, "Open Library ›"));
  });

  it("moves focus to the added skill's ✕ when the last one is added and there's no Open Library", async () => {
    const page = await openTools(host({ skills: ["refunds"] }));
    const skills = listNamed(page, "Skills");
    await act(async () => buttonNamed(skills, "Add skill")?.click());
    await act(async () => skills.querySelector<HTMLElement>("[role=menuitem]")?.click());

    expect(document.activeElement?.getAttribute("aria-label")).toBe("Remove Friendly tone");
  });

  it("removes a skill with its ✕, leaving only the Add button", async () => {
    const agents = host({ skills: ["refunds"] });
    const page = await openTools(agents);
    const remove = page.querySelector<HTMLButtonElement>('[aria-label="Remove Refund policy"]');
    await act(async () => remove?.click());

    expect((await agents.settings(ref)).skills).toEqual([]);
    expect(chips(listNamed(page, "Skills"))).toEqual([]);
    expect(buttonNamed(listNamed(page, "Skills"), "Add skill")).toBeDefined();
  });

  it("shows an item the Library doesn't have by its id, says so, and lets ✕ remove it", async () => {
    const page = await openTools(host({ knowledge: ["old-notes"] }));
    const knowledge = listNamed(page, "Knowledge");
    expect(chips(knowledge)).toEqual(["old-notes"]);
    expect(knowledge.querySelector("li")?.className).toContain("border-danger");
    expect(knowledge.textContent).toContain(
      "This hub can't use a knowledge source called old-notes.",
    );
    const remove = page.querySelector('[aria-label="Remove old-notes"]');
    const line = document.getElementById(remove?.getAttribute("aria-describedby") ?? "");
    expect(line?.textContent).toBe("This hub can't use a knowledge source called old-notes.");
  });

  it("says when the Library has none, or all are added, with Open Library", async () => {
    const opened: string[] = [];
    const page = await openTools(host({ knowledge: ["handbook"] }), (list) => opened.push(list));
    const connectors = listNamed(page, "Connectors");
    expect(connectors.textContent).toContain("No connectors this hub can use yet. Open Library ›");
    expect(buttonNamed(connectors, "Add connector")).toBeUndefined();
    const knowledge = listNamed(page, "Knowledge");
    expect(knowledge.textContent).toContain("No more knowledge to add. Open Library ›");
    expect(buttonNamed(knowledge, "Add knowledge")).toBeUndefined();

    await act(async () => buttonNamed(connectors, "Open Library ›")?.click());
    await act(async () => buttonNamed(knowledge, "Open Library ›")?.click());
    expect(opened).toEqual(["connectors", "knowledge"]);
  });

  it("leaves out Open Library where the app can't open it", async () => {
    const page = await openTools(host());
    const connectors = listNamed(page, "Connectors");
    expect(connectors.textContent).toContain("No connectors this hub can use yet.");
    expect(buttonNamed(connectors, "Open Library ›")).toBeUndefined();
  });

  it("says it couldn't load the Library above the lists, keeping the chips and their ✕", async () => {
    const memory = host({ skills: ["refunds", "gone"] });
    let works = false;
    const page = await openTools({
      ...memory,
      toolOptions: async (agent) => {
        if (!works) throw new Error("The workspace didn't answer.");
        return memory.toolOptions(agent);
      },
    });
    expect(page.textContent).toContain("Couldn't load the Library");
    const skills = listNamed(page, "Skills");
    expect(chips(skills)).toEqual(["refunds", "gone"]);
    expect(buttonNamed(skills, "Add skill")).toBeUndefined();
    expect(skills.textContent).not.toContain("This hub can't use a skill called");

    await act(async () =>
      page.querySelector<HTMLButtonElement>('[aria-label="Remove gone"]')?.click(),
    );
    expect((await memory.settings(ref)).skills).toEqual(["refunds"]);

    works = true;
    await act(async () => buttonNamed(page, "Try again")?.click());
    expect(page.textContent).not.toContain("Couldn't load the Library");
    expect(document.activeElement).toBe(listNamed(page, "Skills").querySelector("h3"));
    expect(chips(listNamed(page, "Skills"))).toEqual(["Refund policy"]);
    expect(buttonNamed(listNamed(page, "Skills"), "Add skill")).toBeDefined();
  });
});
