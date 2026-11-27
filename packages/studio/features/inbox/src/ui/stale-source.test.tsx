// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import type { InboxRuns } from "../inbox-runs.ts";
import type { InboxSetupSource } from "../setup-source.ts";
import { waitingRun } from "../test-runs.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

afterEach(unmountAll);

const now = () => new Date(2026, 10, 26, 12, 0);

/** The host's own refusal for a host it can't reach, shaped as `AgentHostNotAnswering` is. */
class HostUnavailable extends KindedError {
  readonly code = "host_unavailable";
  constructor() {
    super("unavailable", "The engine isn't answering.");
  }
}

async function openInbox(runs: InboxRuns) {
  const inbox = new Inbox(runs, now);
  const root = render(<InboxView inbox={inbox} now={now} />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { root, inbox };
}

function failedOf(root: HTMLElement): string | null {
  return root.querySelector("[data-failed]")?.getAttribute("data-failed") ?? null;
}

verifies("inbox.stale-source", () => {
  it("names the proposals and the host's code when only the proposals fail", async () => {
    // HAL-19190: the installed Inbox said the engine isn't answering, and nothing said which load.
    let proposalsFail = true;
    const fake = fakeRuns([waitingRun("r1")]);
    const runs: InboxRuns = {
      ...fake.runs,
      proposals: async () => {
        if (proposalsFail) throw new HostUnavailable();
        return [];
      },
    };
    const { root, inbox } = await openInbox(runs);
    expect(failedOf(root)).toBe("proposals host_unavailable");
    expect(root.textContent).not.toContain("host_unavailable");
    proposalsFail = false;
    await act(() => inbox.refresh());
    expect(failedOf(root)).toBeNull();
  });

  it("names the runs and a kinded error's kind when the runs fail", async () => {
    const fake = fakeRuns([waitingRun("r1")]);
    const { root, inbox } = await openInbox(fake.runs);
    fake.fail(new KindedError("unavailable", "The engine isn't answering."));
    await act(() => inbox.refresh());
    expect(failedOf(root)).toBe("runs unavailable");
  });

  it("names a setup source's provider and a plain error's name, never its message", async () => {
    const fake = fakeRuns([waitingRun("r1")]);
    const { root, inbox } = await openInbox(fake.runs);
    const google: InboxSetupSource = {
      provider: "google",
      name: "Google",
      view: { view: "GoogleSetupView", load: async () => ({}) },
      list: async () => {
        throw new Error("token abc123 expired");
      },
      subscribe: () => () => {},
    };
    await act(async () => {
      inbox.addSetupSource(google);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(failedOf(root)).toBe("setup:google Error");
  });
});
