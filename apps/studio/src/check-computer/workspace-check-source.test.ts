import type { HostDoctorReport } from "@halonicjs/adapter-agent-host-client";
import type { SetupRecord, SetupService } from "@halonicjs/google-setup";
import type { CheckFact } from "@halonicjs/studio-feature-check-computer/api";
import type { GoogleSetupAccount } from "@halonicjs/studio-feature-google-setup/api";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { googleSetupFacts } from "./google-setups.ts";
import { type CheckSourceParts, WorkspaceCheckSource } from "./workspace-check-source.ts";

const anthropic = {
  provider: "anthropic",
  name: "Anthropic",
  runs: "with-a-key",
  secret: "anthropic",
} as const;

/** What the agent host answers for the demo on a Mac: everything fine. */
const hostReport: HostDoctorReport = {
  checks: [
    { check: "workspace", status: "ok", name: "Acme", trust: "trusted", actions: [] },
    {
      check: "sandbox",
      status: "ok",
      capabilities: { files: "shared", strength: "os" },
      actions: [],
    },
    { check: "harnesses", status: "ok", installed: [], problems: [], actions: [] },
    {
      check: "disk",
      status: "ok",
      freeBytes: 5e10,
      data: { bytes: 1e6, runLogBytes: 1e5, complete: true },
      problem: null,
      actions: [],
    },
  ],
  summary: { problems: 0, warnings: 0, needsFixing: false },
};

/** The parts of the demo with a stored Anthropic key for `default`, changed by `changes`. */
function demoParts(changes: Partial<CheckSourceParts> = {}): CheckSourceParts {
  return {
    about: "Halonic 0.1.0 · macOS",
    sandboxKind: "Seatbelt",
    isDemo: () => true,
    engineAnswers: async () => true,
    hostDoctor: async () => hostReport,
    readModels: async () => ({
      aliases: [{ alias: "default", provider: "anthropic" }],
      providers: [anthropic],
      localOnly: false,
    }),
    keyStored: async () => true,
    lastFailedRun: async () => undefined,
    googleSetups: async () => [],
    tests: () => [],
    ...changes,
  };
}

async function linesOf(parts: CheckSourceParts): Promise<CheckFact[]> {
  const facts: CheckFact[] = [];
  for await (const fact of new WorkspaceCheckSource(parts).check(new AbortController().signal)) {
    facts.push(fact);
  }
  return facts;
}

afterEach(() => {
  vi.restoreAllMocks();
});

verifies("studio.check-computer.source", () => {
  it("gives the demo's lines: the sandbox and harnesses as Not checked, Disk only when low", async () => {
    const facts = await linesOf(demoParts());

    expect(facts.map((fact) => fact.check)).toEqual([
      "engine",
      "workspace",
      "not-checked",
      "models",
      "default-model",
    ]);
    expect(facts.find((fact) => fact.check === "models")).toEqual({
      check: "models",
      servers: undefined,
      keys: [{ provider: "Anthropic", keyStored: true }],
      sampleAnswers: false,
      tests: [],
    });
    expect(facts.find((fact) => fact.check === "default-model")).toMatchObject({
      target: { uses: "provider", name: "Anthropic", local: false },
    });
  });

  it("shows the host's lines and no Default model outside the demo", async () => {
    const facts = await linesOf(demoParts({ isDemo: () => false }));

    expect(facts.map((fact) => fact.check)).toEqual([
      "engine",
      "workspace",
      "sandbox",
      "harnesses",
      "disk",
      "models",
    ]);
    expect(facts.find((fact) => fact.check === "workspace")).not.toHaveProperty("actions");
  });

  it("calls a key the key store can't be asked about unreadable", async () => {
    const facts = await linesOf(
      demoParts({ keyStored: () => Promise.reject(new Error("locked")) }),
    );

    expect(facts.find((fact) => fact.check === "models")).toMatchObject({
      keys: [{ provider: "Anthropic", keyStored: "unreadable" }],
    });
  });

  it("leaves out the host's lines when the host fails, and says so on the console", async () => {
    const said = vi.spyOn(console, "error").mockImplementation(() => {});
    const facts = await linesOf(demoParts({ hostDoctor: () => Promise.reject(new Error("busy")) }));

    expect(facts.map((fact) => fact.check)).toEqual([
      "engine",
      "not-checked",
      "models",
      "default-model",
    ]);
    expect(said).toHaveBeenCalledWith(
      "Check this computer couldn't read this computer.",
      expect.any(Error),
    );
  });

  it("points the last failed run at the Models line that shows its cause, with its hub", async () => {
    const facts = await linesOf(
      demoParts({
        keyStored: async () => false,
        lastFailedRun: async () => ({
          runId: "r1",
          hub: "support",
          step: 2,
          steps: 3,
          stepName: "Draft a reply",
          durationMs: 6800,
          failure: {
            reason: "no-key",
            provider: "Anthropic",
            secret: "anthropic",
            model: "m",
            alias: "default",
          },
        }),
        // The host gives the Models line only for servers on this computer; this one names the missing key.
        hostDoctor: async () => ({
          ...hostReport,
          checks: [
            ...hostReport.checks,
            {
              check: "models",
              status: "failed",
              ready: [],
              problems: [
                { problem: "no-key", alias: "default", provider: "anthropic", name: "Anthropic" },
              ],
              actions: ["test-again", "open-models"],
            },
          ],
        }),
      }),
    );

    expect(facts.at(-1)).toMatchObject({
      check: "last-run",
      step: 2,
      steps: 3,
      cause: "models.no-key",
      causeShownOn: "models",
      hub: "support",
    });
  });

  it("stops giving lines once the dialog aborts", async () => {
    const controller = new AbortController();
    const facts: CheckFact[] = [];
    for await (const fact of new WorkspaceCheckSource(demoParts()).check(controller.signal)) {
      facts.push(fact);
      controller.abort();
    }

    expect(facts.map((fact) => fact.check)).toEqual(["engine"]);
  });

  describe("the Google setups", () => {
    const ledger: SetupService = {
      id: "ledger",
      label: "Ledger",
      googleApis: [{ api: "ledger.googleapis.com", name: "Ledger API" }],
      googleScopes: [
        { scope: "https://www.googleapis.com/auth/ledger", reason: "Reads your ledger" },
      ],
    };
    const started = "2026-11-08T09:00:00.000Z";
    const record = (done: readonly string[]): SetupRecord => ({
      accountRef: "gaccount_1",
      route: { app: "own", runsOn: "this-computer" },
      accountType: "personal",
      startedAt: started,
      connector: { workspace: "0123456789abcdef0123456789abcdef", id: "gmail" },
      projectId: null,
      stepsDone: Object.fromEntries(done.map((id) => [id, started])),
      inProductionTickedAt: null,
      clientId: null,
      clientSecret: null,
      signInStartedAt: null,
      lastSignInAt: null,
      wrongAccountAt: null,
      lastSignInEnded: null,
      services: {},
      refreshRefused: null,
    });
    const account = (setup: SetupRecord, services = [ledger]): GoogleSetupAccount => ({
      email: "x@example.com",
      record: setup,
      services,
      adding: [],
      routinesOnHold: 0,
      changedAt: started,
      askAccountType: false,
      clientSharedWith: [],
    });

    it("gives a setup that was started its first step not done, of how many, and when it started", () => {
      const [fact] = googleSetupFacts([account(record([]))]);

      expect(fact).toMatchObject({
        check: "google",
        step: 1,
        startedAt: new Date(started),
        email: "x@example.com",
      });
      expect(fact?.steps).toBeGreaterThan(1);
    });

    it("gives none for an account with nothing to set up", () => {
      expect(googleSetupFacts([account(record([]), [])])).toEqual([]);
    });
  });
});
