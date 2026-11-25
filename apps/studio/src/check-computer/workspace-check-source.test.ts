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
      sandboxKind: "seatbelt",
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

/** The source's lines as the dialog asks for them, one at a time. */
function linesOneByOne(parts: CheckSourceParts): AsyncIterator<CheckFact> {
  return new WorkspaceCheckSource(parts)
    .check(new AbortController().signal)
    [Symbol.asyncIterator]();
}

async function takeLines(lines: AsyncIterator<CheckFact>, count: number): Promise<CheckFact[]> {
  const taken: CheckFact[] = [];
  while (taken.length < count) {
    const next = await lines.next();
    if (next.done === true) break;
    taken.push(next.value);
  }
  return taken;
}

/** Which lines came, in any order: the dialog puts them in its own (`use-check.ts`). */
function checksOf(facts: readonly CheckFact[]): string[] {
  return facts.map((fact) => fact.check).sort();
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

verifies("studio.check-computer.source", () => {
  it("gives the demo's lines: the sandbox and harnesses as Not checked, Disk only when low", async () => {
    const facts = await linesOf(demoParts());

    expect(checksOf(facts)).toEqual([
      "default-model",
      "engine",
      "models",
      "not-checked",
      "workspace",
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

  it("shows the host's lines with the sandbox's kind, and no Default model outside the demo", async () => {
    const facts = await linesOf(demoParts({ isDemo: () => false }));

    expect(checksOf(facts)).toEqual([
      "disk",
      "engine",
      "harnesses",
      "models",
      "sandbox",
      "workspace",
    ]);
    expect(facts.find((fact) => fact.check === "workspace")).not.toHaveProperty("actions");
    expect(facts.find((fact) => fact.check === "sandbox")).toMatchObject({
      sandboxKind: "seatbelt",
    });
  });

  it("calls a key the key store can't be asked about unreadable", async () => {
    const said = vi.spyOn(console, "error").mockImplementation(() => {});
    const facts = await linesOf(
      demoParts({ keyStored: () => Promise.reject(new Error("locked")) }),
    );

    expect(facts.find((fact) => fact.check === "models")).toMatchObject({
      keys: [{ provider: "Anthropic", keyStored: "unreadable" }],
    });
    expect(said).toHaveBeenCalledWith(
      "Check this computer couldn't read Anthropic's key.",
      expect.any(Error),
    );
  });

  it("says the host's lines didn't answer when the host fails, and says why on the console", async () => {
    const said = vi.spyOn(console, "error").mockImplementation(() => {});
    const facts = await linesOf(demoParts({ hostDoctor: () => Promise.reject(new Error("busy")) }));

    expect(facts).toEqual(
      expect.arrayContaining([
        { check: "workspace", status: "warning", timedOut: true },
        { check: "disk", status: "warning", timedOut: true },
        { check: "not-checked", parts: ["sandbox", "harnesses"] },
      ]),
    );
    expect(checksOf(facts)).toEqual([
      "default-model",
      "disk",
      "engine",
      "models",
      "not-checked",
      "workspace",
    ]);
    expect(said).toHaveBeenCalledWith(
      "Check this computer couldn't read this computer.",
      expect.any(Error),
    );
  });

  it("gives the other lines while the Google setups are still being read, and gives up after 5 seconds", async () => {
    vi.useFakeTimers();
    const said = vi.spyOn(console, "error").mockImplementation(() => {});
    const lines = linesOneByOne(demoParts({ googleSetups: () => new Promise(() => {}) }));

    const first = await takeLines(lines, 5);
    expect(checksOf(first)).toEqual([
      "default-model",
      "engine",
      "models",
      "not-checked",
      "workspace",
    ]);

    const end = lines.next();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await end).toEqual({ done: true, value: undefined });
    expect(said).toHaveBeenCalledWith(
      "Check this computer gave up on the Google setups after 5 seconds.",
    );
  });

  it("gives the Engine line while the host hangs, then the host's lines as not answering after 10 seconds", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const lines = linesOneByOne(demoParts({ hostDoctor: () => new Promise(() => {}) }));

    expect(checksOf(await takeLines(lines, 1))).toEqual(["engine"]);

    const rest = takeLines(lines, 5);
    await vi.advanceTimersByTimeAsync(10_000);
    const answered = await rest;
    expect(checksOf(answered)).toEqual([
      "default-model",
      "disk",
      "models",
      "not-checked",
      "workspace",
    ]);
    expect(answered).toContainEqual({ check: "workspace", status: "warning", timedOut: true });
    expect(await lines.next()).toEqual({ done: true, value: undefined });
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

    expect(facts).toHaveLength(1);
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
      personalApp: null,
      clientId: null,
      clientSecret: null,
      signInStartedAt: null,
      lastSignInAt: null,
      reminderClosedAt: null,
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
