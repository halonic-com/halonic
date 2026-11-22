// @vitest-environment jsdom

import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { createCloseStack } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen } from "../page/agent-page.tsx";
import { buttonNamed, show, unmount } from "../test-support.tsx";

// A panel 390 px wide at 16-pixel text, narrower than 36 rem, so the map is stacked.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.hasAttribute("data-map-panel") ? 390 : 0;
  });
});
afterEach(() => {
  unmount();
  vi.restoreAllMocks();
});

/** "Mail triage" with four subagents, so its right side has a summary row. */
const host = () =>
  memoryAgentsHost({
    hubs: [{ id: "acme", name: "Acme Mail" }],
    agents: [
      {
        hubId: "acme",
        id: "triage",
        name: "Mail triage",
        agentSteps: [{ id: "classify", instructions: "Sort it." }],
        subagents: ["writer", "checker", "translator", "filer"],
        connectors: ["acme-mail"],
      },
      { hubId: "acme", id: "writer", name: "Writer" },
      { hubId: "acme", id: "checker", name: "Checker" },
      { hubId: "acme", id: "translator", name: "Translator" },
      { hubId: "acme", id: "filer", name: "Filer" },
    ],
    toolOptions: {
      connectors: [{ id: "acme-mail", name: "Acme mail", toolsWithoutAsking: 0 }],
    },
    users: {
      "acme/triage": [
        { hubId: "acme", id: "support-reply", name: "Support reply", stepIds: ["sort", "reply"] },
      ],
    },
  });

const openMap = () =>
  show(
    <ToastStoreProvider store={createToastStore()}>
      <AgentScreen host={host()} hubId="acme" id="triage" closeStack={createCloseStack()} />
    </ToastStoreProvider>,
  );

const sideOf = (page: HTMLElement, side: "in" | "use" | "out") =>
  page.querySelector<HTMLElement>(`[data-map-side="${side}"]`);

verifies("agents.map.stacked", () => {
  it("shows each item as a 56 px row, its name over its kind and detail", async () => {
    const page = await openMap();
    expect(page.querySelector("[data-map-stacked]")).not.toBeNull();
    // Text here, as this page can't open a workflow, so with no chevron.
    const workflow = sideOf(page, "in")?.querySelector("[data-map-card]");
    expect(workflow?.className).toContain("min-h-14");
    expect(workflow?.textContent).toBe("Support replyWorkflow · sort, reply");
    expect(workflow?.querySelector("svg")).toBeNull();
    const connector = sideOf(page, "use")?.querySelector("[data-map-card]");
    expect(connector?.textContent).toBe("Acme mailConnector · Every tool asks first");
  });

  it("names each group with the kit's List heading, over one flush list of rows", async () => {
    const page = await openMap();
    const heading = sideOf(page, "in")?.querySelector("h2");
    expect(heading?.textContent).toBe("What brings it work");
    expect(heading?.className).toContain("px-4 pt-4 pb-1 text-label uppercase");
    expect(heading?.nextElementSibling?.className).toContain("divide-y");
  });

  it("ends a group in a 48 px add row, after its summary row, which stands for more than three", async () => {
    const page = await openMap();
    const rows = [...(sideOf(page, "out")?.querySelectorAll("button") ?? [])];
    expect(rows.map((row) => row.textContent)).toEqual([
      "4 subagentswho it hands work to",
      "Add subagent",
    ]);
    expect(rows[0]?.className).toContain("min-h-14");
    expect(rows[0]?.querySelector("svg")).not.toBeNull();
    expect(rows[0]?.getAttribute("aria-haspopup")).toBe("dialog");
    expect(rows[1]?.className).toContain("min-h-touch");
    expect(rows[1]?.className).toContain("text-accent-text");
  });

  it("shows the agent as a card inset 16 px, its agent steps as 48 px rows", async () => {
    const page = await openMap();
    const centre = page.querySelector<HTMLElement>("[data-map-centre]");
    expect(centre?.className).toContain("mx-4 px-4 py-3");
    expect(centre?.querySelector("p")?.className).toContain("text-section");
    expect(buttonNamed(page, "classify ›")?.className).toContain("min-h-touch");
  });
});
