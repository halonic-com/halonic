import type {
  AgentHostAnswer,
  AgentHostRequestRoute,
  AgentHostTransport,
} from "@halonicjs/adapter-agent-host-client";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { AgentHostSandboxFacts } from "./agent-sandbox-host.ts";
import type { ElevateHelper, ShellElevation } from "./sandbox-elevate-shell.ts";

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

/** A shell that answers `elevation`, and keeps the verbs it was asked. */
function shell(elevation: ShellElevation) {
  const verbs: string[] = [];
  const elevate: ElevateHelper = async (verb) => {
    verbs.push(verb);
    return elevation;
  };
  return { elevate, verbs };
}

function facts(transport: AgentHostTransport, elevate: ElevateHelper): AgentHostSandboxFacts {
  return new AgentHostSandboxFacts(transport, undefined, undefined, undefined, undefined, elevate);
}

const beforeOk = { "POST /v1/sandbox/remove/before": { status: 200, body: { ok: true } } };

verifies("studio.sandbox-remove-through-shell", () => {
  it("does the host's half, then the shell's removal, and sends only the exit code", async () => {
    const { transport, asked } = host({
      ...beforeOk,
      "POST /v1/sandbox/remove/elevated": { status: 200, body: { ok: true } },
    });
    const { elevate, verbs } = shell({ outcome: "exited", exitCode: 0 });
    expect(await facts(transport, elevate).remove()).toBeNull();
    expect(asked).toEqual(["POST /v1/sandbox/remove/before", "POST /v1/sandbox/remove/elevated"]);
    expect(verbs).toEqual(["remove"]);
  });

  it("asks Windows nothing while runs use the sandbox", async () => {
    const { transport } = host({
      "POST /v1/sandbox/remove/before": {
        status: 409,
        body: {
          error: { kind: "sandbox_in_use", message: "1 run is using the sandbox." },
          runs: 1,
        },
      },
    });
    const { elevate, verbs } = shell({ outcome: "exited", exitCode: 0 });
    expect(await facts(transport, elevate).remove()).toEqual({
      kind: "remove",
      how: "in-use",
      runs: 1,
    });
    expect(verbs).toEqual([]);
  });

  it("asks Windows nothing when the host's half failed, and says why", async () => {
    const { transport } = host({
      "POST /v1/sandbox/remove/before": {
        status: 200,
        body: { ok: false, outcome: "failed", reason: "a kept grant stays" },
      },
    });
    const { elevate, verbs } = shell({ outcome: "exited", exitCode: 0 });
    expect(await facts(transport, elevate).remove()).toEqual({
      kind: "remove",
      how: "failed",
      reason: "a kept grant stays.",
    });
    expect(verbs).toEqual([]);
  });

  it.each([
    [{ outcome: "cancelled" } as const, { kind: "remove", how: "cancelled" }],
    [
      { outcome: "timed_out" } as const,
      {
        kind: "remove",
        how: "failed",
        reason: "Windows didn't finish removing it within 5 minutes.",
      },
    ],
    [
      { outcome: "still_running" } as const,
      {
        kind: "remove",
        how: "failed",
        reason: "the earlier removal is still running. Wait a minute, then try again.",
      },
    ],
    [
      { outcome: "failed", reason: "The system cannot find the file specified." } as const,
      {
        kind: "remove",
        how: "failed",
        reason:
          "Windows couldn't start the sandbox helper: The system cannot find the file specified.",
      },
    ],
  ])("ends the shell's %o without asking the host how", async (elevation, outcome) => {
    const { transport, asked } = host(beforeOk);
    expect(await facts(transport, shell(elevation).elevate).remove()).toEqual(outcome);
    expect(asked).toEqual(["POST /v1/sandbox/remove/before"]);
  });
});
