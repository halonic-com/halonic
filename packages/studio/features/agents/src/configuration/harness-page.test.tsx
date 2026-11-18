// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, expect, it } from "vitest";
import type { HarnessReadiness } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen } from "../page/agent-page.tsx";
import { buttonNamed, show, unmount } from "../test-support.tsx";
import { HarnessPage } from "./harness-page.tsx";
import { harnessStrip } from "./harness-strip.ts";

afterEach(unmount);

const ref = { hubId: "acme", id: "sorter" };

async function openHarness(
  harness: "halonic" | "claude-code" | "codex",
  readiness: Partial<Record<"claude-code" | "codex", HarnessReadiness>> = {},
) {
  const agents = memoryAgentsHost({
    hubs: [{ id: "acme", name: "acme" }],
    agents: [{ ...ref, name: "Sorter", harness }],
    readiness,
  });
  const page = await show(<AgentScreen host={agents} hubId="acme" id="sorter" />);
  await act(async () => buttonNamed(page, "Configuration")?.click());
  await act(async () =>
    [...page.querySelectorAll<HTMLElement>("[role=tab]")]
      .find((tab) => tab.textContent === "Harness")
      ?.click(),
  );
  return { page, agents };
}

/** The Harness page for the agent `sorter`, with a button that moves it to the agent `filer`. */
function Switchable({ host }: { host: Parameters<typeof HarnessPage>[0]["host"] }) {
  const [id, setId] = useState("sorter");
  const settings = {
    hubId: "acme",
    id,
    name: id,
    harness: "codex",
    instructions: "",
    maxSteps: 6,
    skills: [],
    knowledge: [],
    connectors: [],
  } as const;
  return (
    <>
      <button type="button" onClick={() => setId("filer")}>
        Switch agent
      </button>
      <HarnessPage host={host} settings={settings} save={async () => {}} />
    </>
  );
}

verifies("agents.configuration.harness", () => {
  it("keeps the answer of the newest check when a slow one for another agent arrives late", async () => {
    const base = memoryAgentsHost({
      hubs: [{ id: "acme", name: "acme" }],
      agents: [],
    });
    const slow: Array<(found: HarnessReadiness) => void> = [];
    const host = {
      ...base,
      harnessReadiness: (to: typeof ref) =>
        to.id === "sorter"
          ? new Promise<HarnessReadiness>((resolve) => slow.push(resolve))
          : Promise.resolve<HarnessReadiness>({ status: "signed-out", version: "1.0.0" }),
    };
    const page = await show(<Switchable host={host} />);
    await act(async () => buttonNamed(page, "Switch agent")?.click());
    expect(page.textContent).toContain("not signed in");

    await act(async () => {
      for (const answer of slow) answer({ status: "missing" });
    });
    expect(page.textContent).toContain("not signed in");
    expect(page.textContent).not.toContain("isn't installed");
  });

  it("stops checking and offers Check again when the check throws", async () => {
    const base = memoryAgentsHost({
      hubs: [{ id: "acme", name: "acme" }],
      agents: [{ ...ref, name: "Sorter", harness: "codex" }],
    });
    const host = {
      ...base,
      harnessReadiness: async () => {
        throw new Error("The host didn't answer.");
      },
    };
    const page = await show(<AgentScreen host={host} hubId="acme" id="sorter" />);
    await act(async () => buttonNamed(page, "Configuration")?.click());
    await act(async () =>
      [...page.querySelectorAll<HTMLElement>("[role=tab]")]
        .find((tab) => tab.textContent === "Harness")
        ?.click(),
    );
    expect(page.textContent).toContain("Couldn't check Codex.");
    expect(buttonNamed(page, "Check again")?.getAttribute("aria-busy")).not.toBe("true");
  });

  it("shows no strip and no lines for an agent that runs in Halonic", async () => {
    const { page } = await openHarness("halonic");
    expect(page.textContent).not.toContain("can't run until");
    expect(page.querySelector("[role=tabpanel]")?.textContent).toContain("Claude Code");
  });

  it("saves the choice at once", async () => {
    const { page, agents } = await openHarness("halonic");
    const codex = [...page.querySelectorAll<HTMLInputElement>("input[type=radio]")].find((input) =>
      input.closest("label")?.textContent?.includes("Codex"),
    );
    await act(async () => codex?.click());
    expect((await agents.settings(ref)).harness).toBe("codex");
  });

  it("says why a chosen program isn't installed, in one strip", async () => {
    const { page } = await openHarness("claude-code", {
      "claude-code": { status: "missing" },
      codex: { status: "unsupported", version: "0.9.1", supported: ">=1.0.0" },
    });
    expect(page.textContent).toContain("Sorter can't run until Claude Code is installed.");
    expect(page.textContent).not.toContain("can't run until Codex");
    expect(page.textContent).toContain("Claude Code isn't installed.");
    expect(page.textContent).toContain(
      "Codex 0.9.1 isn't supported. Halonic needs 1.0.0 or newer.",
    );
  });

  it("asks the host again when Check again is pressed", async () => {
    const base = memoryAgentsHost({
      hubs: [{ id: "acme", name: "acme" }],
      agents: [{ ...ref, name: "Sorter", harness: "codex" }],
      readiness: { codex: { status: "missing" } },
    });
    let asked = 0;
    const host = {
      ...base,
      harnessReadiness: (to: typeof ref, harness: "halonic" | "claude-code" | "codex") => {
        asked += 1;
        return base.harnessReadiness(to, harness);
      },
    };
    const page = await show(<AgentScreen host={host} hubId="acme" id="sorter" />);
    await act(async () => buttonNamed(page, "Configuration")?.click());
    await act(async () =>
      [...page.querySelectorAll<HTMLElement>("[role=tab]")]
        .find((tab) => tab.textContent === "Harness")
        ?.click(),
    );
    const before = asked;
    await act(async () => buttonNamed(page, "Check again")?.click());
    expect(asked).toBeGreaterThan(before);
    expect(page.textContent).toContain("Sorter can't run until Codex is installed.");
  });

  it("shows only the option's line, with no strip, when the check failed", async () => {
    const { page } = await openHarness("codex", {
      codex: { status: "failed", error: "No answer." },
    });
    expect(page.textContent).toContain("Couldn't check Codex.");
    expect(page.textContent).not.toContain("can't run until");
    expect(buttonNamed(page, "Check again")).toBeDefined();
  });

  it("chooses the strip by the chosen program only", () => {
    expect(harnessStrip("halonic", { status: "missing" })).toBeNull();
    expect(harnessStrip("codex", { status: "missing" })).toBe("not-installed");
    expect(
      harnessStrip("codex", { status: "unsupported", version: "0.1.0", supported: ">=1.0.0" }),
    ).toBe("too-old");
    expect(harnessStrip("codex", { status: "signed-out", version: "1.2.0" })).toBeNull();
    expect(harnessStrip("codex", { status: "failed", error: "x" })).toBeNull();
    expect(harnessStrip("codex", undefined)).toBeNull();
  });
});
