// @vitest-environment jsdom
import type { SandboxStartResult } from "@halonicjs/app";
import type { AgentPlacementState, AgentsHost } from "@halonicjs/studio-feature-agents/api";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { WorkflowView } from "../api.ts";
import { buttonNamed, memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";
import { WorkflowScreen } from "./workflow-page.tsx";

afterEach(unmount);

const writer = { agent: "writer", agentName: "Writer", harness: "claude-code" } as const;

/** Acme's *Support reply*: `draft` and `polish` run *Writer* in Claude Code, `read` runs Sorter in Halonic. */
const reply: WorkflowView = {
  hubId: "acme",
  id: "reply",
  name: "Support reply",
  initial: "read",
  steps: [
    { id: "read", type: "task", agent: "sorter" },
    { id: "draft", type: "task", agent: "writer", program: writer },
    { id: "polish", type: "task", agent: "writer", program: writer },
    { id: "done", type: "final" },
  ],
  arrows: [],
  layout: {},
};

const placed = (runsOn: "on-hold" | "this-computer"): AgentPlacementState =>
  runsOn === "on-hold"
    ? { runsOn, fingerprint: "sha256:2", unsaved: false, studioStartsUnfenced: true }
    : {
        runsOn,
        fingerprint: "sha256:1",
        chosenAt: "2026-11-09T14:02:00.000Z",
        unsaved: false,
        studioStartsUnfenced: true,
      };

/** The agents host as the page reads it: only where each agent runs, and its changes. */
function agentsSaying(runsOn: "on-hold" | "this-computer"): AgentsHost {
  const reads: Pick<AgentsHost, "placement" | "subscribe"> = {
    placement: async () => placed(runsOn),
    subscribe: () => () => {},
  };
  return reads as AgentsHost;
}

const confirmLine =
  "Writer runs in the sandbox until you confirm again: its file changed since you chose On this computer.";
const cantRunLine = "Support reply can't run: the sandbox can't start on this computer.";

async function open(options: {
  readonly runsOn: "on-hold" | "this-computer";
  readonly check?: SandboxStartResult;
  readonly reviewAndConfirm?: (agentId: string) => void;
}) {
  const { host } = memoryHost([], [], [reply], [], {
    startRun: async () => ({ runId: "run_mfx3k2a1_01jd8q" }),
  });
  const check = async () => options.check ?? { ok: true as const };
  const page = await show(
    <WorkflowScreen
      host={host}
      runs={memoryRuns().source}
      hubId="acme"
      id="reply"
      sandboxStartCheck={{ check }}
      agents={agentsSaying(options.runsOn)}
      {...(options.reviewAndConfirm && { reviewAndConfirm: options.reviewAndConfirm })}
    />,
  );
  await act(async () => {});
  return page;
}

const runOf = (page: HTMLElement) =>
  [...page.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Run");

const count = (text: string, part: string) => text.split(part).length - 1;

verifies("workflows.page.confirm-again", () => {
  it("shows one Callout for an agent on hold, however many steps run it, and Run stays available", async () => {
    const page = await open({ runsOn: "on-hold" });
    expect(count(page.textContent ?? "", confirmLine)).toBe(1);
    expect(runOf(page)?.hasAttribute("aria-disabled")).toBe(false);
  });

  it("comes after the can't-run Callout when the sandbox can't start too", async () => {
    const page = await open({
      runsOn: "on-hold",
      check: { ok: false, reason: "bubblewrap-missing" },
    });
    const text = page.textContent ?? "";
    expect(text.indexOf(cantRunLine)).toBeGreaterThanOrEqual(0);
    expect(text.indexOf(confirmLine)).toBeGreaterThan(text.indexOf(cantRunLine));
  });

  it("opens the agent at Where it runs from Review and confirm", async () => {
    const reviewAndConfirm = vi.fn();
    const page = await open({ runsOn: "on-hold", reviewAndConfirm });
    await act(async () => buttonNamed(page, "Review and confirm")?.click());
    expect(reviewAndConfirm).toHaveBeenCalledWith("writer");
  });

  it("shows no such Callout while the agent's choice isn't on hold", async () => {
    const page = await open({ runsOn: "this-computer" });
    expect(page.textContent).not.toContain("confirm again");
  });
});
