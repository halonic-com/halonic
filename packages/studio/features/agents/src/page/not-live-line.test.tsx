// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { AgentLiveState, AgentsHost } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { show, unmount } from "../test-support.tsx";
import { AgentScreen } from "./agent-page.tsx";

afterEach(unmount);

const line = "Changes not live yet";

function hostIn(state?: AgentLiveState): AgentsHost {
  return memoryAgentsHost({
    hubs: [{ id: "acme", name: "acme" }],
    agents: [{ hubId: "acme", id: "sorter", name: "Sorter" }],
    ...(state === undefined ? {} : { liveStates: { "acme/sorter": state } }),
  });
}

const open = (host: AgentsHost) => show(<AgentScreen host={host} hubId="acme" id="sorter" />);

verifies("agents.page.not-live-line", () => {
  it("says the changes aren't live while the saved agent differs from the live one", async () => {
    expect((await open(hostIn("not-live"))).textContent).toContain(line);
  });

  it("says so for an agent no version has yet", async () => {
    expect((await open(hostIn("never-versioned"))).textContent).toContain(line);
  });

  it("has no line while the agent is live, or where the host can't tell", async () => {
    expect((await open(hostIn("live"))).textContent).not.toContain(line);
    unmount();
    const { liveState: _liveState, ...withoutLiveState } = hostIn("not-live");
    expect((await open(withoutLiveState)).textContent).not.toContain(line);
  });

  it("has no line when the live state can't be read", async () => {
    const host: AgentsHost = {
      ...hostIn("not-live"),
      liveState: async () => {
        throw new Error("git isn't answering");
      },
    };
    expect((await open(host)).textContent).not.toContain(line);
  });

  it("reads the live state again when a file changes", async () => {
    let state: AgentLiveState = "live";
    const base = hostIn();
    const host: AgentsHost = { ...base, liveState: async () => state };
    const page = await open(host);
    expect(page.textContent).not.toContain(line);

    state = "not-live";
    await act(async () => base.update({ hubId: "acme", id: "sorter" }, { instructions: "Sort." }));
    expect(page.textContent).toContain(line);
  });
});
