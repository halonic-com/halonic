// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { PresentationProvider } from "@halonicjs/studio-kit";
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

/** A workspace with no hub whose Default hub file doesn't load, refused as the host does. */
function unreadableHub(): AgentsHost {
  return {
    ...memoryAgentsHost({ hubs: [], agents: [] }),
    create: async () => {
      const refusal = new KindedError(
        "invalid_input",
        "hubs/default/hub.yaml can't be read right now (line 3).",
        { fix: "Fix it in the file, then try again." },
      );
      throw Object.assign(refusal, { file: "hubs/default/hub.yaml", line: 3 });
    },
  };
}

async function openNewAgent(
  host: AgentsHost,
  open = vi.fn(),
  presentation: "desktop" | "phone" = "desktop",
): Promise<HTMLInputElement> {
  const page = await show(
    <PresentationProvider presentation={presentation}>
      <AgentsView host={host} open={open} />
    </PresentationProvider>,
  );
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

  it("says the Default hub's file can't be read, with its line, and keeps the dialog open", async () => {
    const open = vi.fn();
    const input = await openNewAgent(unreadableHub(), open);

    await typeInto(input, "Greeter");
    await act(async () => buttonNamed(document.body, "Create")?.click());
    // The dialog's alert slot fills a frame after the request ends.
    await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

    expect(document.body.textContent).toContain(
      "Couldn't create the agent: hubs/default/hub.yaml can't be read right now (line 3). Fix it in the file, then try again.",
    );
    expect(open).not.toHaveBeenCalled();
  });

  it("says it without the path on a phone", async () => {
    const input = await openNewAgent(unreadableHub(), vi.fn(), "phone");

    await typeInto(input, "Greeter");
    await act(async () => buttonNamed(document.body, "Create")?.click());
    await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

    const text = document.body.textContent;
    expect(text).toContain(
      "Couldn't create the agent: the Default hub's file can't be read right now. Fix it on a computer, then try again.",
    );
    expect(text).not.toContain("hub.yaml");
  });
});
