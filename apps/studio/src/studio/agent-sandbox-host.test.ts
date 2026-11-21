import type {
  AgentHostAnswer,
  AgentHostRequestRoute,
  AgentHostTransport,
} from "@halonicjs/adapter-agent-host-client";
import { sandboxStartWords } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { AgentHostSandboxFacts } from "./agent-sandbox-host.ts";
import type { ShellElevation } from "./sandbox-elevate-shell.ts";
import { agentSandboxOffered } from "./start-studio.ts";

/** A host that answers each route with what the test gives it, and keeps the routes it was asked. */
function host(answers: Partial<Record<AgentHostRequestRoute, AgentHostAnswer>>) {
  const asked: string[] = [];
  const transport: AgentHostTransport = {
    request: async (route) => {
      asked.push(route);
      return answers[route] ?? { status: 404, body: { kind: "unknown_route", message: "No." } };
    },
    stream: async () => {
      throw new Error("no streams here");
    },
  };
  return { transport, asked };
}

const capabilities = { status: 200, body: { files: "shared", strength: "os" } };
const failing = (reason: string, missing: string[] = []) => ({
  status: 200,
  body: { ok: false, reason, missing },
});

verifies("studio.agent-sandbox-host", () => {
  it("reads a passing check as Ready", async () => {
    const { transport } = host({
      "GET /v1/sandbox/capabilities": capabilities,
      "GET /v1/sandbox/check": { status: 200, body: { ok: true, reason: null, missing: [] } },
    });
    const facts = new AgentHostSandboxFacts(transport, undefined, () => new Date(0));
    expect(await facts.check()).toEqual({ state: "ready", checkedAt: "1970-01-01T00:00:00.000Z" });
  });

  it("says Docker Desktop shows when a passing check names it, and only then", async () => {
    const passing = (residuals: string[]) =>
      host({
        "GET /v1/sandbox/capabilities": capabilities,
        "GET /v1/sandbox/check": {
          status: 200,
          body: { ok: true, reason: null, missing: [], residuals },
        },
      }).transport;
    const now = () => new Date(0);
    expect(
      await new AgentHostSandboxFacts(passing(["docker-desktop-visible"]), undefined, now).check(),
    ).toEqual({
      state: "ready",
      checkedAt: "1970-01-01T00:00:00.000Z",
      dockerDesktopVisible: true,
    });
    expect(
      await new AgentHostSandboxFacts(passing(["kept-roots-readable"]), undefined, now).check(),
    ).toEqual({ state: "ready", checkedAt: "1970-01-01T00:00:00.000Z" });
  });

  it.each([
    ["setup-needed", "needs-setup"],
    ["setup-conflict", "needs-repair"],
    ["distro-missing", "needs-repair"],
    ["restart-needed", "restart-needed"],
    ["virtualisation-off", "unavailable"],
  ])("reads the reason %s as %s", async (reason, state) => {
    const { transport } = host({
      "GET /v1/sandbox/capabilities": capabilities,
      "GET /v1/sandbox/check": failing(reason),
    });
    expect((await new AgentHostSandboxFacts(transport).check()).state).toBe(state);
  });

  it("hands the section the reason's code, for the catalogue's words", async () => {
    const { transport } = host({
      "GET /v1/sandbox/capabilities": capabilities,
      "GET /v1/sandbox/check": failing("bubblewrap-missing"),
    });
    expect(await new AgentHostSandboxFacts(transport).check()).toEqual({
      state: "unavailable",
      code: "bubblewrap-missing",
    });
  });

  it("never passes on the check's own sentence, also for `other`", async () => {
    const { transport } = host({
      "GET /v1/sandbox/capabilities": capabilities,
      "GET /v1/sandbox/check": failing("other", ["the helper is missing"]),
    });
    expect(await new AgentHostSandboxFacts(transport).check()).toEqual({
      state: "unavailable",
      code: "other",
    });
  });

  it("words a repair's reason with the catalogue's sentence, as the Inbox and the CLI do", async () => {
    const { transport } = host({
      "GET /v1/sandbox/capabilities": capabilities,
      "GET /v1/sandbox/check": failing("distro-missing"),
    });
    expect(await new AgentHostSandboxFacts(transport).check()).toEqual({
      state: "needs-repair",
      reason: sandboxStartWords("distro-missing").reason,
    });
  });

  it("answers nothing for a setup that worked, and the sentence why for one that didn't", async () => {
    const worked = host({
      "POST /v1/sandbox/setup": {
        status: 200,
        body: { running: null, last: { verb: "setup", result: { ok: true }, finishedAt: "t" } },
      },
    });
    expect(await new AgentHostSandboxFacts(worked.transport).setUp()).toBeNull();

    const refused = host({
      "POST /v1/sandbox/setup": {
        status: 200,
        body: {
          running: null,
          last: {
            verb: "setup",
            result: { ok: false, outcome: "cancelled", reason: "No." },
            finishedAt: "t",
          },
        },
      },
    });
    expect(await new AgentHostSandboxFacts(refused.transport).setUp()).toEqual({
      kind: "setup",
      how: "cancelled",
    });

    const failed = host({
      "POST /v1/sandbox/setup": {
        status: 200,
        body: {
          running: null,
          last: {
            verb: "setup",
            result: { ok: false, outcome: "failed", reason: "Windows refused the rules." },
            finishedAt: "t",
          },
        },
      },
    });
    expect(await new AgentHostSandboxFacts(failed.transport).setUp()).toEqual({
      kind: "setup",
      how: "failed",
      reason: "Windows refused the rules.",
    });
  });

  it("ignores an older result of the other verb when nothing was started", async () => {
    const old = {
      running: null,
      last: {
        verb: "remove",
        result: { ok: false, outcome: "failed", reason: "Old." },
        finishedAt: "t",
      },
    };
    const setup = host({ "POST /v1/sandbox/setup": { status: 200, body: old } });
    expect(await new AgentHostSandboxFacts(setup.transport).setUp()).toBeNull();
    const remove = host({
      "POST /v1/sandbox/remove": {
        status: 200,
        body: { ...old, last: { ...old.last, verb: "setup" } },
      },
    });
    expect(await new AgentHostSandboxFacts(remove.transport).remove()).toBeNull();
  });

  it("answers how many runs use the sandbox when the host refuses the removal", async () => {
    const { transport, asked } = host({
      "POST /v1/sandbox/remove": { status: 409, body: { runs: 2 } },
    });
    expect(await new AgentHostSandboxFacts(transport).remove()).toEqual({
      kind: "remove",
      how: "in-use",
      runs: 2,
    });
    expect(asked).toEqual(["POST /v1/sandbox/remove"]);
  });

  it("says which command runs in the host now", async () => {
    const status = (running: string | null) =>
      host({ "GET /v1/sandbox/setup": { status: 200, body: { running, last: null } } });
    expect(await new AgentHostSandboxFacts(status("setup").transport).running()).toBe("setup");
    expect(await new AgentHostSandboxFacts(status(null).transport).running()).toBeNull();
    // The WSL removal has its own dialog, so the srt section does not follow it.
    expect(await new AgentHostSandboxFacts(status("remove-wsl").transport).running()).toBeNull();
  });

  it("stops following a setup when the signal aborts", async () => {
    const running = { status: 200, body: { running: "setup", last: null } };
    const { transport } = host({
      "POST /v1/sandbox/setup": running,
      "GET /v1/sandbox/setup": running,
    });
    const stop = new AbortController();
    stop.abort();
    const outcome = await new AgentHostSandboxFacts(transport).setUp({ signal: stop.signal });
    expect(outcome).toMatchObject({ kind: "setup", how: "failed" });
  });

  it("follows a running command with GETs only, and answers nothing when the signal aborts", async () => {
    const running = { status: 200, body: { running: "setup", last: null } };
    const done = {
      status: 200,
      body: { running: null, last: { verb: "setup", result: { ok: true }, finishedAt: "t" } },
    };
    const { transport, asked } = host({ "GET /v1/sandbox/setup": done });
    expect(await new AgentHostSandboxFacts(transport).follow("setup")).toBeNull();
    const stop = new AbortController();
    stop.abort();
    const stopped = host({ "GET /v1/sandbox/setup": running });
    expect(
      await new AgentHostSandboxFacts(stopped.transport).follow("setup", { signal: stop.signal }),
    ).toBeUndefined();
    expect([...asked, ...stopped.asked].filter((route) => !route.startsWith("GET"))).toEqual([]);
  });

  it("starts nothing when it is only made and checked", async () => {
    const { transport, asked } = host({
      "GET /v1/sandbox/capabilities": capabilities,
      "GET /v1/sandbox/check": failing("setup-needed"),
    });
    await new AgentHostSandboxFacts(transport).check();
    expect(asked.filter((route) => route.startsWith("POST"))).toEqual([]);
  });

  describe("the build", () => {
    it("doesn't offer the sandbox until the board decides D44 (a)", () => {
      expect(agentSandboxOffered).toBe(false);
    });
  });
});

verifies("studio.sandbox-setup-through-shell", () => {
  const elevating = (elevation: ShellElevation) => async () => elevation;

  it("sends only the helper's exit code to the host and takes the host's answer", async () => {
    const { transport, asked } = host({
      "POST /v1/sandbox/setup/elevated": { status: 200, body: { ok: true } },
    });
    const facts = new AgentHostSandboxFacts(
      transport,
      undefined,
      undefined,
      undefined,
      undefined,
      elevating({ outcome: "exited", exitCode: 0 }),
    );
    expect(await facts.setUp()).toBeNull();
    expect(asked).toEqual(["POST /v1/sandbox/setup/elevated"]);
  });

  it("reads a check that fails after the helper as a failed check", async () => {
    const { transport } = host({
      "POST /v1/sandbox/setup/elevated": {
        status: 200,
        body: { ok: false, outcome: "check_failed", reason: "the sandbox account is missing" },
      },
    });
    const facts = new AgentHostSandboxFacts(
      transport,
      undefined,
      undefined,
      undefined,
      undefined,
      elevating({ outcome: "exited", exitCode: 0 }),
    );
    expect(await facts.setUp()).toEqual({
      kind: "setup",
      how: "check_failed",
      reason: "the sandbox account is missing.",
    });
  });

  it.each([
    [{ outcome: "cancelled" } as const, { kind: "setup", how: "cancelled" }],
    [{ outcome: "timed_out" } as const, { kind: "setup", how: "timed-out", repairing: false }],
    [{ outcome: "still_running" } as const, { kind: "setup", how: "timed-out", repairing: false }],
    [
      { outcome: "failed", reason: "The system cannot find the file specified." } as const,
      {
        kind: "setup",
        how: "failed",
        reason:
          "Windows couldn't start the sandbox helper: The system cannot find the file specified.",
      },
    ],
  ])("ends the shell's %o without asking the host", async (elevation, outcome) => {
    const { transport, asked } = host({});
    const facts = new AgentHostSandboxFacts(
      transport,
      undefined,
      undefined,
      undefined,
      undefined,
      elevating(elevation),
    );
    expect(await facts.setUp()).toEqual(outcome);
    expect(asked).toEqual([]);
  });
});

verifies("settings.wsl-remove-dialog", () => {
  const shell = { choose: async () => "halonic.tar", reveal: async () => undefined };
  const ended = (result: unknown) => ({
    status: 200,
    body: {
      running: null,
      last: { verb: "remove-wsl", result, finishedAt: "2026-11-16T10:00:00Z" },
    },
  });

  it("offers the removal only when the shell does", () => {
    const { transport } = host({});
    expect(new AgentHostSandboxFacts(transport).removeWslSetup).toBeUndefined();
    expect(new AgentHostSandboxFacts(transport).chooseBackupFile).toBeUndefined();
    const facts = new AgentHostSandboxFacts(transport, undefined, undefined, undefined, shell);
    expect(facts.removeWslSetup).toBeTypeOf("function");
  });

  it("sends the choice and answers how the host says it ended", async () => {
    const { transport, asked } = host({
      "POST /v1/sandbox/remove-wsl": ended({ outcome: "removed", exportedTo: "halonic.tar" }),
    });
    const facts = new AgentHostSandboxFacts(transport, undefined, undefined, undefined, shell);
    const result = await facts.removeWslSetup?.({
      choice: "export-then-remove",
      file: "halonic.tar",
    });
    expect(result).toEqual({ outcome: "removed", exportedTo: "halonic.tar" });
    expect(asked).toEqual(["POST /v1/sandbox/remove-wsl"]);
  });

  it("throws when the host is busy or stops without an answer", async () => {
    const busy = host({ "POST /v1/sandbox/remove-wsl": { status: 409, body: { runs: 1 } } });
    const facts = new AgentHostSandboxFacts(busy.transport, undefined, undefined, undefined, shell);
    await expect(facts.removeWslSetup?.({ choice: "remove-only" })).rejects.toThrow(/still using/);
    const silent = host({
      "POST /v1/sandbox/remove-wsl": { status: 200, body: { running: null, last: null } },
    });
    const none = new AgentHostSandboxFacts(
      silent.transport,
      undefined,
      undefined,
      undefined,
      shell,
    );
    await expect(none.removeWslSetup?.({ choice: "remove-only" })).rejects.toThrow(/did not say/);
  });
});
