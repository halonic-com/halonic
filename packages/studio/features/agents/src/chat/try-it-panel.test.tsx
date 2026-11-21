// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import type { AgentSettings } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import type { Load } from "../page/use-load.ts";
import { show, unmount } from "../test-support.tsx";
import { TryItPanel } from "./try-it-panel.tsx";

afterEach(unmount);

const sorter = { hubId: "acme", id: "sorter" };
const host = memoryAgentsHost({
  hubs: [{ id: "acme", name: "Acme" }],
  agents: [{ ...sorter, name: "Sorter", description: "Sorts incoming mail by topic" }],
});
const ways = { goToKeyField: vi.fn(), openHarness: vi.fn() };

function panel(settings: Load<AgentSettings>) {
  return (
    <TryItPanel
      host={host}
      agent={sorter}
      settings={settings}
      waiting={<p>The page's own state</p>}
      ways={ways}
      announce={vi.fn()}
    />
  );
}

verifies("agents.chat.first-load", () => {
  it("shows what the page gives it while the agent is read or couldn't be", async () => {
    const loading = await show(panel({ kind: "loading", skeleton: true, slow: true }));
    expect(loading.textContent).toBe("The page's own state");
    unmount();
    const reason = "The engine isn't answering. It may still be starting.";
    const failed = await show(panel({ kind: "failed", reason, retrying: false }));
    expect(failed.textContent).toBe("The page's own state");
  });

  it("shows the chat once the agent is read", async () => {
    const settings = await host.settings(sorter);
    const page = await show(panel({ kind: "ready", value: settings }));
    expect(page.querySelector("h2")?.textContent).toBe("Chat with Sorter");
    expect(page.textContent).toContain("Sorts incoming mail by topic");
    expect(page.querySelector("textarea")?.getAttribute("placeholder")).toBe("Message Sorter…");
  });
});
