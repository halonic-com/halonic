// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { AgentChange, AgentRef, AgentsHost } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen } from "../page/agent-page.tsx";
import { buttonNamed, show, typeInto, unmount } from "../test-support.tsx";

afterEach(unmount);

const ref = { hubId: "acme", id: "sorter" };

function hostWith(sandbox: { workingFolder?: string; allowedSites?: readonly string[] }) {
  return memoryAgentsHost({
    hubs: [{ id: "acme", name: "acme" }],
    agents: [{ ...ref, name: "Sorter", harness: "claude-code", ...sandbox }],
  });
}

async function openHarness(host: AgentsHost) {
  const page = await show(<AgentScreen host={host} hubId="acme" id="sorter" />);
  await act(async () => buttonNamed(page, "Configuration")?.click());
  await act(async () =>
    [...page.querySelectorAll<HTMLElement>("[role=tab]")]
      .find((tab) => tab.textContent === "Harness")
      ?.click(),
  );
  return page;
}

const named = (page: HTMLElement, name: string) =>
  page.querySelector<HTMLElement>(`[aria-label="${name}"]`);

const chipsOf = (page: HTMLElement) =>
  [...(page.querySelector('ul[aria-label="Allowed sites"]')?.querySelectorAll("li") ?? [])].map(
    (chip) => chip.textContent,
  );

async function press(box: HTMLElement, key: "Enter" | "Escape") {
  await act(async () => {
    box.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

/** Chooses Change…, types `folder` in the box and presses `key`. */
async function changeFolder(page: HTMLElement, folder: string, key: "Enter" | "Escape") {
  await act(async () => buttonNamed(page, "Change…")?.click());
  const box = named(page, "Working folder") as HTMLInputElement;
  expect(document.activeElement).toBe(box);
  await typeInto(box, folder);
  await press(box, key);
}

/** Opens Add site, types `site`, presses Enter, then Esc to close the box. */
async function addSite(page: HTMLElement, site: string) {
  await act(async () => named(page, "Add site")?.click());
  const box = named(page, "New site") as HTMLInputElement;
  await typeInto(box, site);
  await press(box, "Enter");
  await press(box, "Escape");
}

verifies("agents.configuration.sandbox-fields", () => {
  it("shows the working folder and allowed sites from the agent's file", async () => {
    const page = await openHarness(
      hostWith({ workingFolder: "hubs/acme/work/sorter", allowedSites: ["registry.npmjs.org"] }),
    );
    expect(page.textContent).toContain("Working folder");
    expect(page.textContent).toContain("hubs/acme/work/sorter");
    expect(buttonNamed(page, "Change…")).toBeDefined();
    expect(page.textContent).toContain("Allowed sites");
    expect(chipsOf(page)).toEqual(["registry.npmjs.org"]);
    expect(named(page, "Remove registry.npmjs.org")).not.toBeNull();
    expect(named(page, "Add site")?.textContent).toBe("Add site");
  });

  it("shows the default working folder when the file names none", async () => {
    const page = await openHarness(hostWith({}));
    expect(page.textContent).toContain("files/agents/sorter");
    expect(chipsOf(page)).toEqual([]);
  });

  it("saves a changed working folder through the save model and puts Change… back", async () => {
    const host = hostWith({ workingFolder: "hubs/acme/work/sorter" });
    const page = await openHarness(host);
    await changeFolder(page, "hubs/acme/out", "Enter");
    expect((await host.settings(ref)).workingFolder).toBe("hubs/acme/out");
    expect(page.textContent).toContain("hubs/acme/out");
    expect(document.activeElement).toBe(buttonNamed(page, "Change…"));
  });

  it("closes the box without saving on Esc", async () => {
    const host = hostWith({ workingFolder: "hubs/acme/work/sorter" });
    const page = await openHarness(host);
    await changeFolder(page, "hubs/acme/out", "Escape");
    expect((await host.settings(ref)).workingFolder).toBe("hubs/acme/work/sorter");
    expect(page.textContent).toContain("hubs/acme/work/sorter");
    expect(named(page, "Working folder")).toBeNull();
  });

  it("saves the whole list of sites when one is added or removed", async () => {
    const host = hostWith({ allowedSites: ["registry.npmjs.org"] });
    const page = await openHarness(host);
    await addSite(page, "api.example.com");
    expect((await host.settings(ref)).allowedSites).toEqual([
      "registry.npmjs.org",
      "api.example.com",
    ]);
    await act(async () => named(page, "Remove registry.npmjs.org")?.click());
    expect((await host.settings(ref)).allowedSites).toEqual(["api.example.com"]);
    expect(chipsOf(page)).toEqual(["api.example.com"]);
  });

  it("puts the saved sites back and says why when the host refuses a site", async () => {
    const base = hostWith({ allowedSites: ["registry.npmjs.org"] });
    const host: AgentsHost = {
      ...base,
      update: async (to: AgentRef, change: AgentChange) => {
        if (change.allowedSites?.includes("localhost")) {
          throw new KindedError("invalid_input", "Enter a site like registry.npmjs.org.");
        }
        await base.update(to, change);
      },
    };
    const page = await openHarness(host);
    await addSite(page, "localhost");
    expect(chipsOf(page)).toEqual(["registry.npmjs.org"]);
    expect(page.textContent).toContain("Couldn't save: Enter a site like registry.npmjs.org.");
    expect((await host.settings(ref)).allowedSites).toEqual(["registry.npmjs.org"]);
  });
});
