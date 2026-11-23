import {
  AgentHostError,
  type AgentHostRequestRoute,
  type AgentHostTransport,
} from "@halonicjs/adapter-agent-host-client";
import { sandboxStartWords } from "@halonicjs/app";
import { AgentHostNotAnswering } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { AgentHostSandboxFacts } from "./agent-sandbox-host.ts";
import type { ShellWslSetup } from "./sandbox-wsl-setup-shell.ts";

/**
 * A shell that can't start the host, for `reason` as it gives it (`distro-missing`), and keeps
 * the routes it was asked.
 */
function refusing(reason?: string) {
  const asked: AgentHostRequestRoute[] = [];
  const transport: AgentHostTransport = {
    request: async (route) => {
      asked.push(route);
      throw new AgentHostNotAnswering(
        new AgentHostError(0, "host_unavailable", "the distro isn't installed", reason),
      );
    },
    stream: async () => {
      throw new Error("no streams here");
    },
  };
  return { transport, asked };
}

/** The section's facts with the shell's WSL setup, which answers `answer` and counts its calls. */
function withWslSetup(transport: AgentHostTransport, answer: ShellWslSetup) {
  const setUp = vi.fn(async () => answer);
  const facts = new AgentHostSandboxFacts(
    transport,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    false,
    setUp,
  );
  return { facts, setUp };
}

afterEach(() => {
  vi.restoreAllMocks();
});

verifies("studio.agent-sandbox-host", () => {
  it("reads a host the shell couldn't start for a sandbox reason as that reason's code", async () => {
    for (const reason of ["distro-missing", "wsl-missing", "runtime-missing"]) {
      const { transport } = refusing(reason);
      expect(await new AgentHostSandboxFacts(transport).check()).toEqual({
        state: "unavailable",
        code: reason,
      });
    }
  });

  it("reads a missing distro as Needs setting up where the shell runs the WSL setup", async () => {
    const { facts } = withWslSetup(refusing("distro-missing").transport, { outcome: "done" });
    expect(await facts.check()).toEqual({ state: "needs-setup", withoutAdmin: true });
    const other = withWslSetup(refusing("runtime-missing").transport, { outcome: "done" });
    expect(await other.facts.check()).toEqual({ state: "unavailable", code: "runtime-missing" });
  });

  it("still fails a check the shell gave no reason for", async () => {
    const { facts } = withWslSetup(refusing().transport, { outcome: "done" });
    await expect(facts.check()).rejects.toBeInstanceOf(AgentHostNotAnswering);
  });
});

verifies("studio.sandbox-wsl-setup-through-shell", () => {
  it("sets up through the shell, not the host, and leaves no outcome when it is done", async () => {
    const { transport, asked } = refusing("distro-missing");
    const { facts, setUp } = withWslSetup(transport, { outcome: "done" });
    expect(await facts.setUp()).toBeNull();
    expect(setUp).toHaveBeenCalledTimes(1);
    expect(asked).toEqual([]);
  });

  it("says Restart needed after a setup that asked for one, while the host can't start", async () => {
    const { facts } = withWslSetup(refusing("distro-missing").transport, {
      outcome: "restart_needed",
    });
    expect(await facts.setUp()).toBeNull();
    expect(await facts.check()).toEqual({ state: "restart-needed" });
  });

  it("reads nothing running when there is no host to ask", async () => {
    const { facts } = withWslSetup(refusing("distro-missing").transport, { outcome: "done" });
    expect(await facts.running()).toBeNull();
  });

  it.each([
    [{ outcome: "cancelled" }, { kind: "setup", how: "cancelled" }],
    [{ outcome: "timed_out" }, { kind: "setup", how: "timed-out", repairing: false }],
    [{ outcome: "still_running" }, { kind: "setup", how: "still-running", repairing: false }],
  ] as const)("ends %o as the section's %o", async (answer, outcome) => {
    const { facts } = withWslSetup(refusing("distro-missing").transport, answer);
    expect(await facts.setUp()).toEqual(outcome);
  });

  it("words a failure from the catalogue, keeping the setup's own words out of the screen", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { facts } = withWslSetup(refusing("distro-missing").transport, {
      outcome: "failed",
      reason: "virtualisation-off",
      details: "Please enable the Virtual Machine Platform",
    });
    expect(await facts.setUp()).toEqual({
      kind: "setup",
      how: "failed",
      reason: sandboxStartWords("virtualisation-off").reason,
    });
  });

  it.each([
    ["distro-not-ours", "a WSL distribution called halonic is already on this computer"],
    ["kernel-too-old", "WSL needs an update first"],
    ["kernel-unreadable", "WSL needs an update first"],
  ])(
    "words the setup's code %s with its own line, not the catalogue's other",
    async (code, line) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { facts } = withWslSetup(refusing("distro-missing").transport, {
        outcome: "failed",
        reason: "other",
        code,
        details: "d",
      });
      const outcome = await facts.setUp();
      expect(outcome).toMatchObject({ kind: "setup", how: "failed" });
      const reason = outcome !== null && "reason" in outcome ? outcome.reason : "";
      expect(reason).toContain(line);
      expect(reason).not.toBe(sandboxStartWords("other").reason);
    },
  );

  it("says when this copy of Halonic has no image for the distro", async () => {
    const { facts } = withWslSetup(refusing("distro-missing").transport, {
      outcome: "image_missing",
    });
    expect(await facts.setUp()).toEqual({
      kind: "setup",
      how: "failed",
      reason:
        "this copy of Halonic is missing the files the sandbox is built from. Install the latest Halonic desktop app, then try again.",
    });
  });

  it("keeps why the shell couldn't run the setup for Copy details only", async () => {
    const notStarted = withWslSetup(refusing("distro-missing").transport, {
      outcome: "not_started",
      details: "Access is denied. (os error 5)",
    });
    expect(await notStarted.facts.setUp()).toEqual({
      kind: "setup",
      how: "failed",
      reason: "Windows couldn't start Halonic's sandbox helper.",
      details: "Access is denied. (os error 5)",
    });
    const unanswered = withWslSetup(refusing("distro-missing").transport, {
      outcome: "unanswered",
      exitCode: 3,
    });
    expect(await unanswered.facts.setUp()).toEqual({
      kind: "setup",
      how: "failed",
      reason: "the host stopped before it said how it ended.",
      details: "the host stopped before it said how it ended. Exit code 3.",
    });
  });

  it.each([
    ["error", "wsl.exe didn't start"],
    ["bad-flags", "--wsl-image must be an absolute path on a drive"],
  ])("offers Copy details for a setup that broke with %s", async (code, details) => {
    const { facts } = withWslSetup(refusing("distro-missing").transport, {
      outcome: "failed",
      reason: "other",
      code,
      details,
    });
    expect(await facts.setUp()).toEqual({
      kind: "setup",
      how: "failed",
      reason: sandboxStartWords("other").reason,
      details: `${code}: ${details}`,
    });
  });
});
