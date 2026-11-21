// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentsHost, NewAgent } from "../api.ts";
import { AgentsView } from "../list/agents-page.tsx";
import { memoryAgentsHost } from "../memory-host.ts";
import { buttonNamed, openDialogsInJsdom, show, typeInto, unmount } from "../test-support.tsx";

beforeEach(openDialogsInJsdom);
afterEach(unmount);

/** A workspace with no hub, whose `create` records what it was asked to make. */
function hubless(): { host: AgentsHost; created: NewAgent[] } {
  const created: NewAgent[] = [];
  const host: AgentsHost = {
    ...memoryAgentsHost({ hubs: [], agents: [] }),
    create: async (newAgent) => {
      created.push(newAgent);
      return { hubId: newAgent.hubId, id: "greeter" };
    },
  };
  return { host, created };
}

async function openNewAgent(host: AgentsHost, open = vi.fn()): Promise<HTMLInputElement> {
  const page = await show(<AgentsView host={host} open={open} />);
  await act(async () => buttonNamed(page, "New agent")?.click());
  const input = document.querySelector<HTMLInputElement>("dialog input");
  if (input === null) throw new Error("no name field");
  return input;
}

verifies("agents.new.first-hub", () => {
  it("shows the Default hub's folder and file, with no Hub field", async () => {
    const input = await openNewAgent(hubless().host);
    const dialog = document.querySelector("dialog");

    expect(dialog?.textContent).toContain("Folder: hubs/default/agents/");
    expect(dialog?.textContent).not.toContain("Hub");
    await typeInto(input, "Greeter");
    expect(dialog?.textContent).toContain("File: hubs/default/agents/greeter.agent.yaml");
  });

  it("creates the agent in the Default hub and opens it", async () => {
    const { host, created } = hubless();
    const open = vi.fn();
    const input = await openNewAgent(host, open);

    await typeInto(input, "Greeter");
    await act(async () => buttonNamed(document.body, "Create")?.click());

    expect(created).toEqual([expect.objectContaining({ name: "Greeter", hubId: "default" })]);
    expect(open).toHaveBeenCalledWith({ hubId: "default", id: "greeter" });
  });
});
