// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { AgentRef, AgentsHost, HarnessReadiness, HarnessSignIn } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen } from "../page/agent-page.tsx";
import { buttonNamed, show, unmount } from "../test-support.tsx";

afterEach(unmount);

const ref = { hubId: "acme", id: "sorter" };

/** An invented command, as the host would give it for the agent's own folder. */
const byHand = "CLAUDE_CONFIG_DIR='/data/agents/sorter' claude auth login";

const signedOut: HarnessReadiness = { status: "signed-out", version: "2.1.0" };

/** Sorter runs in Claude Code; `signIn` is what opening its sign-in does, and each ask is kept. */
function hostWith(
  readiness: HarnessReadiness,
  signIn: () => Promise<HarnessSignIn> = async () => ({ opened: true }),
) {
  const base = memoryAgentsHost({
    hubs: [{ id: "acme", name: "acme" }],
    agents: [{ ...ref, name: "Sorter", harness: "claude-code" }],
    readiness: { "claude-code": readiness },
  });
  const asked: Array<{ agent: AgentRef; harness: string }> = [];
  const host: AgentsHost = {
    ...base,
    openHarnessSignIn: (agent, harness) => {
      asked.push({ agent, harness });
      return signIn();
    },
  };
  return { host, asked };
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

verifies("agents.configuration.harness", () => {
  it("offers Sign in for this agent and Check again on the signed-out strip", async () => {
    const { host, asked } = hostWith(signedOut);
    const page = await openHarness(host);
    expect(page.textContent).toContain("Sorter can't run until it's signed in to Claude Code.");
    expect(buttonNamed(page, "Check again")).toBeDefined();

    await act(async () => buttonNamed(page, "Sign in for this agent")?.click());
    expect(asked).toEqual([{ agent: ref, harness: "claude-code" }]);
    // A terminal opened: the person signs in there, and nothing more is said here.
    expect(page.textContent).not.toContain("Couldn't open");
  });

  it("shows the command to run by hand when no terminal opened", async () => {
    const { host } = hostWith(signedOut, async () => ({
      opened: false,
      reason: "No terminal was found on this computer.",
      command: byHand,
    }));
    const page = await openHarness(host);
    await act(async () => buttonNamed(page, "Sign in for this agent")?.click());
    expect(page.textContent).toContain(
      "Couldn't open a terminal. Run this, then choose Check again:",
    );
    expect(page.textContent).toContain(byHand);
    expect(page.querySelector('button[aria-label="Copy command"]')).not.toBeNull();
  });

  it("says why when the host couldn't be asked to open the sign-in", async () => {
    const { host } = hostWith(signedOut, async () => {
      throw new Error("The agent host isn't running.");
    });
    const page = await openHarness(host);
    await act(async () => buttonNamed(page, "Sign in for this agent")?.click());
    expect(page.textContent).toContain("Couldn't open the sign-in: The agent host isn't running.");
  });

  it("shows no strip and no sign-in for an agent that is signed in", async () => {
    const { host } = hostWith({ status: "ready", version: "2.1.0" });
    const page = await openHarness(host);
    expect(page.textContent).not.toContain("can't run until");
    expect(buttonNamed(page, "Sign in for this agent")).toBeUndefined();
  });

  it("drops the strip once Check again finds the agent signed in", async () => {
    let readiness: HarnessReadiness = signedOut;
    const { host: base } = hostWith(signedOut);
    const host: AgentsHost = {
      ...base,
      harnessReadiness: async (_agent, harness) =>
        harness === "claude-code" ? readiness : { status: "missing" },
    };
    const page = await openHarness(host);
    expect(page.textContent).toContain("signed in to Claude Code");

    readiness = { status: "ready", version: "2.1.0" };
    await act(async () => buttonNamed(page, "Check again")?.click());
    expect(page.textContent).not.toContain("can't run until");
  });
});
