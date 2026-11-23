// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { AgentRef, AgentsHost } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen } from "../page/agent-page.tsx";
import { buttonNamed, redraw, show, unmount } from "../test-support.tsx";
import { ConfirmAgainCallouts } from "./confirm-again-callouts.tsx";

afterEach(unmount);

const writer = { hubId: "acme", id: "writer" };
const sorter = { hubId: "acme", id: "sorter" };
const runAgents = [
  { id: "writer", name: "Writer" },
  { id: "sorter", name: "Sorter" },
];
const writerLine =
  "Writer runs in the sandbox until you confirm again: its file changed since you chose On this computer.";
const sorterLine =
  "Sorter runs in the sandbox until you confirm again: its file changed since you chose On this computer.";

function agentsHost(options: { readonly placement?: boolean } = {}) {
  return memoryAgentsHost({
    hubs: [{ id: "acme", name: "Acme" }],
    agents: [
      { ...writer, name: "Writer", harness: "claude-code" },
      { ...sorter, name: "Sorter", harness: "codex" },
    ],
    ...options,
  });
}

/** Chooses On this computer for the agent, then saves a change to its file, as a person does. */
async function putOnHold(host: AgentsHost, agent: AgentRef) {
  const shown = await host.placement(agent);
  if (shown === undefined) throw new Error("no placement");
  await host.chooseThisComputer(agent, shown.fingerprint);
  await host.update(agent, { instructions: "Reply to everyone." });
}

async function open(host: AgentsHost | undefined, reviewAndConfirm?: (id: string) => void) {
  const page = await show(
    <ConfirmAgainCallouts
      host={host}
      hubId="acme"
      agents={runAgents}
      reviewAndConfirm={reviewAndConfirm}
    />,
  );
  await act(async () => {});
  return page;
}

verifies("agents.confirm-again.run-controls", () => {
  it("says an agent on hold runs in the sandbox, and Review and confirm opens it", async () => {
    const host = agentsHost();
    await putOnHold(host, writer);
    const reviewAndConfirm = vi.fn();
    const page = await open(host, reviewAndConfirm);
    expect(page.textContent).toContain(writerLine);
    expect(page.textContent).not.toContain("Sorter");
    await act(async () => buttonNamed(page, "Review and confirm")?.click());
    expect(reviewAndConfirm).toHaveBeenCalledWith("writer");
  });

  it("disables nothing: the page's other controls stay as they are", async () => {
    const host = agentsHost();
    await putOnHold(host, writer);
    const page = await open(host, () => {});
    const controls = [...page.querySelectorAll("button")];
    expect(controls.map((control) => control.textContent)).toEqual(["Review and confirm"]);
    expect(controls.some((control) => control.hasAttribute("aria-disabled"))).toBe(false);
  });

  it("shows one Callout per agent on hold, in the page's order", async () => {
    const host = agentsHost();
    await putOnHold(host, sorter);
    await putOnHold(host, writer);
    const page = await open(host, () => {});
    const text = page.textContent ?? "";
    expect(text.indexOf(writerLine)).toBeGreaterThanOrEqual(0);
    expect(text.indexOf(sorterLine)).toBeGreaterThan(text.indexOf(writerLine));
  });

  it("goes once the choice is confirmed again elsewhere, or set back to the sandbox", async () => {
    const host = agentsHost();
    await putOnHold(host, writer);
    await putOnHold(host, sorter);
    const page = await open(host, () => {});
    const held = await host.placement(writer);
    await act(async () => {
      await host.chooseThisComputer(writer, held?.fingerprint ?? "");
    });
    expect(page.textContent).not.toContain(writerLine);
    await act(async () => host.chooseSandbox(sorter));
    expect(page.textContent).toBe("");
  });

  it("shows nothing for an agent not on hold, one it can't read, or where Studio can't choose", async () => {
    const host = agentsHost();
    const shown = await host.placement(writer);
    await host.chooseThisComputer(writer, shown?.fingerprint ?? "");
    expect((await open(host)).textContent).toBe("");
    const failing: AgentsHost = {
      ...agentsHost(),
      placement: async () => Promise.reject(new Error("host gone")),
    };
    expect((await open(failing)).textContent).toBe("");
    expect((await open(agentsHost({ placement: false }))).textContent).toBe("");
    expect((await open(undefined)).textContent).toBe("");
  });

  it("has no button where the page can't open an agent", async () => {
    const host = agentsHost();
    await putOnHold(host, writer);
    const page = await open(host);
    expect(page.textContent).toContain(writerLine);
    expect(page.querySelector("button")).toBeNull();
  });

  it("opens an agent's page at Configuration › Harness when asked, and again when asked again", async () => {
    const host = agentsHost();
    const screen = (harnessRequest?: string) => (
      <AgentScreen host={host} hubId="acme" id="writer" harnessRequest={harnessRequest} />
    );
    const shownPage = (page: HTMLElement) =>
      page.querySelector('[aria-label="Configuration pages"] [role=tab][aria-selected=true]')
        ?.textContent;
    const page = await show(screen("writer/1"));
    await act(async () => {});
    expect(shownPage(page)).toBe("Harness");
    await act(async () => buttonNamed(page, "Runs")?.click());
    await redraw(screen("writer/2"));
    await act(async () => {});
    expect(shownPage(page)).toBe("Harness");
  });
});
