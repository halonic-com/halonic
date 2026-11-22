// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeAll, expect, it } from "vitest";
import type { AgentsHost } from "../api.ts";
import { configurationWords } from "../configuration/configuration-words.ts";
import { PlacementProvider } from "../configuration/use-placement.ts";
import { WhereItRuns } from "../configuration/where-it-runs.tsx";
import { memoryAgentsHost } from "../memory-host.ts";
import { buttonNamed, openDialogsInJsdom, show, unmount } from "../test-support.tsx";
import { AgentScreen } from "./agent-page.tsx";
import { FullAccessChip } from "./full-access-chip.tsx";

beforeAll(openDialogsInJsdom);
afterEach(unmount);

const words = configurationWords.whereItRuns;
const ref = { hubId: "acme", id: "writer" };

function agentsHost(options: { placement?: boolean } = {}): AgentsHost {
  return memoryAgentsHost({
    hubs: [{ id: "acme", name: "Acme" }],
    agents: [{ ...ref, name: "Writer" }],
    ...options,
  });
}

const open = (host: AgentsHost) => show(<AgentScreen host={host} hubId="acme" id="writer" />);

/** The header's chip, or `undefined`. */
function chipIn(page: HTMLElement) {
  return [...page.querySelectorAll("header span")].find(
    (span) => span.textContent?.includes(words.fullAccess) && span.querySelector("svg") !== null,
  );
}

/** What a screen reader hears of the chip: exact, so the on-hold line can't pass for the other. */
function spokenOf(chip: Element | undefined) {
  return chip?.querySelector(".sr-only")?.textContent;
}

function radioNamed(page: HTMLElement, name: string) {
  return [...page.querySelectorAll<HTMLInputElement>("input[type=radio]")].find(
    (input) =>
      document.getElementById(input.getAttribute("aria-labelledby") ?? "")?.textContent === name,
  );
}

async function press(control: HTMLElement | undefined) {
  if (control === undefined) throw new Error("no such control");
  await act(async () => control.click());
}

/** Chooses On this computer for Writer, for the file as it is now. */
async function chooseThisComputer(host: AgentsHost) {
  const placement = await host.placement(ref);
  if (placement === undefined) throw new Error("this host can't choose");
  await act(async () => {
    await host.chooseThisComputer(ref, placement.fingerprint);
  });
}

verifies("agents.page.full-access-chip", () => {
  it("has no chip while the agent runs in its sandbox", async () => {
    expect(chipIn(await open(agentsHost()))).toBeUndefined();
  });

  it("shows Full access with the shield once On this computer is chosen", async () => {
    const host = agentsHost();
    await chooseThisComputer(host);
    const chip = chipIn(await open(host));
    expect(spokenOf(chip)).toBe(words.fullAccessSpoken);
    // Running without the sandbox is "have a look" (amber), not "Needs you" (violet).
    expect(chip?.className).toContain("bg-attention-soft");
  });

  it("keeps the chip while the choice is on hold after the file changed", async () => {
    const host = agentsHost();
    await chooseThisComputer(host);
    const page = await open(host);
    await act(async () => host.update(ref, { instructions: "Reply to everyone." }));
    expect(spokenOf(chipIn(page))).toBe(words.fullAccessOnHoldSpoken);
  });

  it("follows a choice made in Where it runs at once, though no file changed", async () => {
    const host = agentsHost();
    const page = await show(
      <PlacementProvider host={host} hubId="acme" id="writer">
        <header>
          <FullAccessChip host={host} agent={ref} />
        </header>
        <WhereItRuns host={host} settings={await host.settings(ref)} />
      </PlacementProvider>,
    );
    expect(chipIn(page)).toBeUndefined();
    await press(radioNamed(page, words.onThisComputer));
    await press(buttonNamed(document.body, words.confirm));
    expect(spokenOf(chipIn(page))).toBe(words.fullAccessSpoken);
    await press(radioNamed(page, words.inSandbox));
    expect(chipIn(page)).toBeUndefined();
  });

  it("has no chip where the host can't say or the read fails", async () => {
    expect(chipIn(await open(agentsHost({ placement: false })))).toBeUndefined();
    unmount();
    const failing: AgentsHost = {
      ...agentsHost(),
      placement: async () => {
        throw new Error("the store isn't answering");
      },
    };
    expect(chipIn(await open(failing))).toBeUndefined();
  });
});
