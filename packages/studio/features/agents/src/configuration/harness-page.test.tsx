// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, expect, it } from "vitest";
import type { HarnessReadiness } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen } from "../page/agent-page.tsx";
import { buttonNamed, show, unmount } from "../test-support.tsx";
import { HarnessPage } from "./harness-page.tsx";
import { harnessSetupPages, harnessStrip } from "./harness-strip.ts";

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

function tabNamed(page: HTMLElement, name: string) {
  return [...page.querySelectorAll<HTMLElement>("[role=tab]")].find(
    (tab) => tab.textContent === name,
  );
}

function radioNamed(page: HTMLElement, name: string) {
  return [...page.querySelectorAll<HTMLInputElement>("input[type=radio]")].find(
    (input) =>
      document.getElementById(input.getAttribute("aria-labelledby") ?? "")?.textContent === name,
  );
}

function noteOf(page: HTMLElement, name: string) {
  const note = radioNamed(page, name)?.getAttribute("aria-describedby") ?? "";
  return document.getElementById(note)?.textContent;
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
    subagents: [],
  } as const;
  return (
    <>
      <button type="button" onClick={() => setId("filer")}>
        Switch agent
      </button>
      <HarnessPage host={host} settings={settings} save={async () => true} />
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
    expect(page.textContent).toContain("Couldn't check Codex: The host didn't answer.");
    expect(buttonNamed(page, "Check again")?.getAttribute("aria-busy")).not.toBe("true");
  });

  it("shows no strip for an agent that runs in Halonic", async () => {
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

  it("puts the choice back to the saved harness when the save fails", async () => {
    const base = memoryAgentsHost({
      hubs: [{ id: "acme", name: "acme" }],
      agents: [{ ...ref, name: "Sorter", harness: "claude-code" }],
      readiness: { codex: { status: "missing" } },
    });
    const host = {
      ...base,
      update: async () => {
        throw new Error("The disk is full.");
      },
    };
    const page = await show(<AgentScreen host={host} hubId="acme" id="sorter" />);
    await act(async () => buttonNamed(page, "Configuration")?.click());
    await act(async () => tabNamed(page, "Harness")?.click());
    await act(async () => radioNamed(page, "Codex")?.click());
    expect(page.textContent).toContain("Couldn't save: The disk is full.");
    expect(radioNamed(page, "Claude Code")?.checked).toBe(true);
    expect(radioNamed(page, "Codex")?.checked).toBe(false);
    expect(page.textContent).not.toContain("can't run until Codex");
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
    expect(page.textContent).toContain("Found Codex, but couldn't ask its version: No answer.");
    expect(page.textContent).not.toContain("can't run until");
    expect(buttonNamed(page, "Check again")).toBeDefined();
  });

  it("says Checking… under the programs until the first answer arrives", async () => {
    const base = memoryAgentsHost({
      hubs: [{ id: "acme", name: "acme" }],
      agents: [{ ...ref, name: "Sorter", harness: "halonic" }],
    });
    const answers: Array<(found: HarnessReadiness) => void> = [];
    const host = {
      ...base,
      harnessReadiness: () => new Promise<HarnessReadiness>((resolve) => answers.push(resolve)),
    };
    const page = await show(<AgentScreen host={host} hubId="acme" id="sorter" />);
    await act(async () => buttonNamed(page, "Configuration")?.click());
    await act(async () => tabNamed(page, "Harness")?.click());
    expect(noteOf(page, "Claude Code")).toBe("Checking…");
    expect(noteOf(page, "Codex")).toBe("Checking…");
    await act(async () => {
      for (const answer of answers) answer({ status: "missing" });
    });
    expect(noteOf(page, "Codex")).toContain("Codex isn't installed.");
    expect(noteOf(page, "Claude Code")).not.toContain("Checking…");
  });

  it("shows the last answer at once on the next visit, and checks again behind it", async () => {
    const base = memoryAgentsHost({
      hubs: [{ id: "acme", name: "acme" }],
      agents: [{ ...ref, name: "Sorter", harness: "halonic" }],
      readiness: { codex: { status: "missing" } },
    });
    let asked = 0;
    let hold = false;
    const host = {
      ...base,
      harnessReadiness: (to: typeof ref, harness: "halonic" | "claude-code" | "codex") => {
        asked += 1;
        return hold ? new Promise<HarnessReadiness>(() => {}) : base.harnessReadiness(to, harness);
      },
    };
    const first = await show(<AgentScreen host={host} hubId="acme" id="sorter" />);
    await act(async () => buttonNamed(first, "Configuration")?.click());
    await act(async () => tabNamed(first, "Harness")?.click());
    expect(first.textContent).toContain("Codex isn't installed.");
    unmount();

    hold = true;
    const before = asked;
    const again = await show(<AgentScreen host={host} hubId="acme" id="sorter" />);
    await act(async () => buttonNamed(again, "Configuration")?.click());
    await act(async () => tabNamed(again, "Harness")?.click());
    expect(asked).toBeGreaterThan(before);
    expect(again.textContent).toContain("Codex isn't installed.");
    expect(again.textContent).toContain("Found Claude Code 1.0.0");
  });

  it("writes what each option needs, under the group's hint", async () => {
    const { page } = await openHarness("halonic");
    expect(page.textContent).toContain("What drives this agent");
    expect(page.textContent).toContain("Built in. Needs nothing installed.");
    expect(page.textContent).toContain("Found Claude Code 1.0.0");
    expect(page.textContent).toContain("Found Codex 1.0.0");
  });

  it("links How to install and How to update to the program's own page", async () => {
    const { page } = await openHarness("codex", {
      "claude-code": { status: "unsupported", version: "0.9.1", supported: ">=1.0.0" },
      codex: { status: "missing" },
    });
    const links = [...page.querySelectorAll<HTMLAnchorElement>("a")];
    const install = links.filter((link) => link.textContent?.startsWith("How to install"));
    const update = links.filter((link) => link.textContent?.startsWith("How to update"));
    // One under the option, one in the strip.
    expect(install).toHaveLength(2);
    expect(install.every((link) => link.href === harnessSetupPages.codex)).toBe(true);
    expect(update).toHaveLength(1);
    expect(update[0]?.href).toBe(harnessSetupPages["claude-code"]);
  });

  it("offers Check again when nothing failed and no strip shows", async () => {
    const { page } = await openHarness("halonic");
    expect(page.textContent).not.toContain("can't run until");
    expect(buttonNamed(page, "Check again")).toBeDefined();
  });

  it("shows one Check again: the strip's when there is a strip, else the group's", async () => {
    const { page } = await openHarness("codex", { codex: { status: "missing" } });
    const checkAgain = () =>
      [...page.querySelectorAll("button")].filter((button) =>
        button.textContent?.trim().startsWith("Check again"),
      );
    expect(page.textContent).toContain("Sorter can't run until Codex is installed.");
    expect(checkAgain()).toHaveLength(1);
    expect(checkAgain()[0]?.closest("[role=status]")).not.toBeNull();
    await act(async () => radioNamed(page, "Halonic")?.click());
    expect(page.textContent).not.toContain("can't run until");
    expect(checkAgain()).toHaveLength(1);
    expect(checkAgain()[0]?.closest("[role=status]")).toBeNull();
  });

  it("keeps focus on Check again when the check makes the pressed one go", async () => {
    const base = memoryAgentsHost({
      hubs: [{ id: "acme", name: "acme" }],
      agents: [{ ...ref, name: "Sorter", harness: "codex" }],
    });
    let codex: HarnessReadiness = { status: "ready", version: "1.0.0" };
    const host = {
      ...base,
      harnessReadiness: async (to: typeof ref, harness: "halonic" | "claude-code" | "codex") =>
        harness === "codex" ? codex : base.harnessReadiness(to, harness),
    };
    const page = await show(<AgentScreen host={host} hubId="acme" id="sorter" />);
    await act(async () => buttonNamed(page, "Configuration")?.click());
    await act(async () => tabNamed(page, "Harness")?.click());
    const checkAgain = () => buttonNamed(page, "Check again");

    // The group's Check again, and Codex is now missing: the strip's takes over.
    checkAgain()?.focus();
    codex = { status: "missing" };
    await act(async () => checkAgain()?.click());
    expect(page.textContent).toContain("Sorter can't run until Codex is installed.");
    expect(document.activeElement).toBe(checkAgain());
    expect(document.activeElement?.closest("[role=status]")).not.toBeNull();

    // The strip's Check again, and Codex is now installed: the group's takes over.
    codex = { status: "ready", version: "1.0.0" };
    await act(async () => checkAgain()?.click());
    expect(page.textContent).not.toContain("can't run until");
    expect(document.activeElement).toBe(checkAgain());
    expect(document.activeElement?.closest("[role=status]")).toBeNull();
  });

  it("leaves focus alone when the check doesn't change the strip", async () => {
    const { page } = await openHarness("codex", { codex: { status: "missing" } });
    const checkAgain = buttonNamed(page, "Check again");
    checkAgain?.focus();
    await act(async () => checkAgain?.click());
    expect(document.activeElement).toBe(checkAgain);
  });

  it("puts the strip in a polite live region that is there before it", async () => {
    const { page } = await openHarness("halonic", { codex: { status: "missing" } });
    const region = page.querySelector("[role=status]");
    expect(region?.textContent).toBe("");
    await act(async () => radioNamed(page, "Codex")?.click());
    expect(page.querySelector("[role=status]")).toBe(region);
    expect(region?.textContent).toContain("Sorter can't run until Codex is installed.");
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
