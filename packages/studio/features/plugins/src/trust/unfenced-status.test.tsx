// @vitest-environment jsdom

import type { RunnerUnfencedReason } from "@halonicjs/app";
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReviewPluginDialog } from "../page/review-plugin-dialog.tsx";
import { UpdatePluginDialog } from "../page/update-plugin-dialog.tsx";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { weather } from "../test-support/plugins.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { TRUST_CHECK_LAST_LINE } from "./trust-text.ts";
import {
  type PluginUnfencedRuns,
  trustStatusOf,
  type UnfencedRunStatus,
} from "./unfenced-status.ts";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const now = new Date(2026, 10, 19);
const checkbox = "I understand plugins and integrations run without the sandbox on this computer";

/** A host that answers each status read with the next answer, and records every yes. */
function host(...answers: (UnfencedRunStatus | Error)[]) {
  const allowed: RunnerUnfencedReason[] = [];
  let reads = 0;
  let allowAnswer: { reason: string; allowedAt: string } | null | Error = {
    reason: "windows",
    allowedAt: "2026-11-19T10:00:00Z",
  };
  const unfencedRuns: PluginUnfencedRuns = {
    status: async () => {
      const answer = answers[Math.min(reads, answers.length - 1)];
      reads += 1;
      if (answer === undefined || answer instanceof Error) throw answer ?? new Error("no answer");
      return answer;
    },
    allow: async (reason) => {
      allowed.push(reason);
      if (allowAnswer instanceof Error) throw allowAnswer;
      return allowAnswer;
    },
  };
  return {
    unfencedRuns,
    allowed,
    reads: () => reads,
    answerAllow: (answer: typeof allowAnswer) => {
      allowAnswer = answer;
    },
  };
}

async function review(unfencedRuns: PluginUnfencedRuns | undefined, trusted: string[]) {
  const plugin = weather("not-trusted");
  if (plugin.manifest === undefined) throw new Error("Weather has no manifest");
  const closed: boolean[] = [];
  render(
    <ReviewPluginDialog
      plugin={plugin}
      manifest={plugin.manifest}
      trust={async (name) => {
        trusted.push(name);
      }}
      unfencedRuns={unfencedRuns}
      onClose={() => closed.push(true)}
    />,
  );
  await act(async () => {});
  return closed;
}

function dialog(): HTMLDialogElement {
  const found = document.querySelector("dialog");
  if (found === null) throw new Error("No dialog");
  return found;
}

function button(start: string): HTMLButtonElement {
  const found = [...dialog().querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.startsWith(start),
  );
  if (found === undefined) throw new Error(`No button ${start}`);
  return found;
}

function box(): HTMLInputElement | null {
  return dialog().querySelector('input[type="checkbox"]');
}

async function tick() {
  const found = box();
  if (found === null) throw new Error("No checkbox");
  await act(async () => found.click());
}

async function press(start: string) {
  const found = button(start);
  await act(async () => found.click());
}

/** The dialog's alert; the kit fills it a frame after the error arrives. */
async function alertText(): Promise<string> {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  return dialog().querySelector('[role="alert"]')?.textContent ?? "";
}

const windows = { run: "needs-yes", reason: "windows" } as const;

verifies("plugins.plugin-trust-yes", () => {
  describe("trustStatusOf", () => {
    it("words the host's answer as the trust check's fence and saved yes", () => {
      expect(trustStatusOf({ run: "fenced" }, now)).toEqual({
        fence: { state: "fenced" },
        yes: undefined,
      });
      expect(trustStatusOf(windows, now)).toEqual({
        fence: { state: "not-fenced", reason: "windows" },
        yes: undefined,
      });
      expect(
        trustStatusOf(
          { run: "allowed", reason: "windows", allowedAt: "2026-11-09T10:00:00Z" },
          now,
        ),
      ).toEqual({
        fence: { state: "not-fenced", reason: "windows" },
        yes: { reason: "windows", on: "9 Nov" },
      });
      expect(trustStatusOf({ run: "stopped" }, now).fence).toEqual({ state: "stopped" });
    });

    it("keeps T9 for a reason Studio has no words for, or a yes with no readable day", () => {
      const unsaid = { fence: undefined, yes: undefined };
      expect(trustStatusOf({ run: "needs-yes", reason: "from-a-newer-host" }, now)).toEqual(unsaid);
      expect(
        trustStatusOf({ run: "allowed", reason: "windows", allowedAt: "not a date" }, now),
      ).toEqual(unsaid);
    });
  });

  it("says Checking while the host reads the status, then shows the reason", async () => {
    let answer: (status: UnfencedRunStatus) => void = () => {};
    const slow: PluginUnfencedRuns = {
      status: () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
      allow: async () => null,
    };
    await review(slow, []);
    expect(dialog().textContent).toContain("Checking the sandbox on this computer…");
    expect(button("Trust").getAttribute("aria-disabled")).toBe("true");

    await act(async () => answer(windows));
    expect(dialog().textContent).not.toContain("Checking the sandbox on this computer…");
    expect(dialog().textContent).toContain(checkbox);
  });

  it("saves the yes for the reason shown, then trusts the plugin", async () => {
    const { unfencedRuns, allowed } = host(windows);
    const trusted: string[] = [];
    const closed = await review(unfencedRuns, trusted);

    await tick();
    await press("Trust");

    expect(allowed).toEqual(["windows"]);
    expect(trusted).toEqual(["weather"]);
    expect(closed).toEqual([true]);
  });

  it("sends no yes again when the yes for this reason is already saved", async () => {
    const { unfencedRuns, allowed } = host({
      run: "allowed",
      reason: "windows",
      allowedAt: "2026-11-09T10:00:00Z",
    });
    const trusted: string[] = [];
    await review(unfencedRuns, trusted);

    expect(box()).toBeNull();
    expect(dialog().textContent).toContain(
      "You allowed plugins and integrations to run without the sandbox on this computer on 9 Nov, for this reason.",
    );
    await press("Trust");

    expect(allowed).toEqual([]);
    expect(trusted).toEqual(["weather"]);
  });

  it("trusts nothing when the reason changed, and asks again for the reason that holds now", async () => {
    const { unfencedRuns, allowed, answerAllow, reads } = host(windows, {
      run: "needs-yes",
      reason: "container",
    });
    answerAllow(null);
    const trusted: string[] = [];
    const closed = await review(unfencedRuns, trusted);

    await tick();
    await press("Trust");

    expect(allowed).toEqual(["windows"]);
    expect(trusted).toEqual([]);
    expect(closed).toEqual([]);
    expect(reads()).toBe(2);
    expect(dialog().textContent).toContain(
      "Run Halonic on the computer itself, not in a container.",
    );
    expect(box()?.checked).toBe(false);
    expect(button("Trust").getAttribute("aria-disabled")).toBe("true");
  });

  it("trusts nothing when the yes can't be saved, and says why", async () => {
    const { unfencedRuns, answerAllow } = host(windows);
    answerAllow(new KindedError("unavailable", "The agent host isn't answering."));
    const trusted: string[] = [];
    const closed = await review(unfencedRuns, trusted);

    await tick();
    await press("Trust");

    expect(trusted).toEqual([]);
    expect(closed).toEqual([]);
    expect(await alertText()).toContain(
      "Couldn't save trust: The agent host isn't answering. Nothing was started.",
    );
  });

  it("shows the saved yes after it was saved, so a second Trust doesn't save it again", async () => {
    const { unfencedRuns, allowed } = host(windows);
    const plugin = weather("not-trusted");
    if (plugin.manifest === undefined) throw new Error("Weather has no manifest");
    let fail = true;
    render(
      <ReviewPluginDialog
        plugin={plugin}
        manifest={plugin.manifest}
        trust={async () => {
          if (fail) throw new KindedError("unavailable", "The store is locked.");
        }}
        unfencedRuns={unfencedRuns}
        onClose={() => undefined}
      />,
    );
    await act(async () => {});

    await tick();
    await press("Trust");
    expect(await alertText()).toContain("The store is locked.");
    expect(box()).toBeNull();
    expect(dialog().textContent).toContain("You allowed plugins and integrations");

    fail = false;
    await press("Trust");
    expect(allowed).toEqual(["windows"]);
  });

  it("keeps T9 when the host can't say, and with no host to ask", async () => {
    await review(host(new Error("no answer")).unfencedRuns, []);
    expect(dialog().textContent).toContain(TRUST_CHECK_LAST_LINE);
    expect(box()).toBeNull();
    unmountAll();

    await review(undefined, []);
    expect(dialog().textContent).toContain(TRUST_CHECK_LAST_LINE);
    expect(dialog().textContent).not.toContain("Checking the sandbox on this computer…");
  });

  it("saves the yes before Trust and update puts the newer version in place", async () => {
    const { unfencedRuns, allowed } = host(windows);
    const plugin = weather("on");
    if (plugin.manifest === undefined) throw new Error("Weather has no manifest");
    const steps: string[] = [];
    render(
      <UpdatePluginDialog
        plugin={plugin}
        found={{ kind: "available", manifest: { ...plugin.manifest, version: "1.3.0" } }}
        applyUpdate={async (_name, approved) => {
          steps.push(`update ${approved.version} after ${allowed.join(",")}`);
        }}
        unfencedRuns={unfencedRuns}
        onUpdated={() => steps.push("updated")}
        onKeep={() => undefined}
      />,
    );
    await act(async () => {});

    await tick();
    await press("Trust and update");

    expect(steps).toEqual(["update 1.3.0 after windows", "updated"]);
  });
});
