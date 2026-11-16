import type {
  SandboxBackendId,
  SandboxCheck,
  SandboxProfile,
  SandboxSession,
  SandboxSetting,
} from "@halonicjs/ports";
import { FakeSandboxSession, idleProgram } from "@halonicjs/testing-contracts";
import {
  type LimitCode,
  type SandboxBackend,
  SandboxChoiceService,
  type SecurityUpdatesState,
} from "./sandbox-choice.ts";
import type { CanaryFindings } from "./sandbox-trust-check.ts";

export const profile: SandboxProfile = {
  workingFolder: "/acme/project",
  tempFolder: "/local-app-data/Halonic/tmp/canary",
  settingsFolder: null,
  readOnlyPaths: [],
  deniedPaths: [],
  env: {},
  network: { bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 }, allowedSites: [] },
  timeLimitMs: 30_000,
};

export const ok: SandboxCheck = { ok: true, reason: null, missing: [] };
export const needsSetup: SandboxCheck = {
  ok: false,
  reason: "setup-needed",
  missing: ["not set up"],
};
export const inContainer: SandboxCheck = {
  ok: false,
  reason: "container",
  missing: ["in a container"],
};

export const clean: CanaryFindings = {
  started: true,
  leaks: [],
  controls: { readOnlyFileRead: true, workFolderScriptLoaded: true, networkBlockProven: true },
  nameLookupsLeave: true,
  missing: [],
};

export const tooStrict: CanaryFindings = {
  ...clean,
  controls: { readOnlyFileRead: false, workFolderScriptLoaded: true, networkBlockProven: true },
  missing: ["the read-only file couldn't be read"],
};

export const chosenAt = "2026-11-14T09:00:00.000Z";
export const choose = (backend: SandboxBackendId): SandboxSetting => ({ backend, chosenAt });

interface FakeBackend {
  check?: SandboxCheck;
  offered?: boolean;
  limits?: LimitCode[];
  /** Where its security updates stand; the call throws when it is an Error. */
  securityUpdates?: SecurityUpdatesState | Error;
  /** What each canary run finds, in turn; the last one repeats. Without it every run finds nothing. */
  canary?: CanaryFindings[];
  /** Each canary probe waits for this before it reports. */
  probeGate?: () => Promise<void>;
  /** The backend needs its one-time download; each try answers `downloads` in turn (the last repeats), and a `done` one ends the need. */
  needsDownload?: boolean;
  downloads?: Array<{ done: true } | { done: false; problem: string }>;
}

export interface Machine {
  platform?: string;
  setting?: SandboxSetting | null;
  backends?: Partial<Record<SandboxBackendId, FakeBackend>>;
}

/** A choice over fake backends, how many trust checks each ran, and the most that ran at once. */
export function machine(setup: Machine = {}) {
  let setting = setup.setting ?? null;
  const checks: Partial<Record<SandboxBackendId, number>> = {};
  const downloadNeeded: Partial<Record<SandboxBackendId, boolean>> = {};
  const downloadTries: Partial<Record<SandboxBackendId, number>> = {};
  const sandboxChecks: Partial<Record<SandboxBackendId, number>> = {};
  let running = 0;
  let mostAtOnce = 0;
  const given = setup.backends ?? { srt: { check: ok }, mxc: { check: ok, canary: [clean] } };
  const backends = (Object.keys(given) as SandboxBackendId[]).map((id): SandboxBackend => {
    const fake = given[id] ?? {};
    const findings = fake.canary ?? [clean];
    downloadNeeded[id] = fake.needsDownload ?? false;
    return {
      id,
      offered: async () => fake.offered ?? true,
      limits: fake.limits ?? [],
      ...(fake.securityUpdates === undefined
        ? {}
        : {
            securityUpdates: async () => {
              if (fake.securityUpdates instanceof Error) throw fake.securityUpdates;
              return fake.securityUpdates ?? { overdue: false };
            },
          }),
      sandbox: {
        check: async () => {
          sandboxChecks[id] = (sandboxChecks[id] ?? 0) + 1;
          return fake.check ?? ok;
        },
        open: async (opened): Promise<SandboxSession> =>
          new FakeSandboxSession({ profile: opened, program: idleProgram }),
      },
      ...(fake.needsDownload === undefined
        ? {}
        : {
            setup: {
              downloadNeeded: async () => downloadNeeded[id] ?? false,
              download: async () => {
                const answers = fake.downloads ?? [{ done: true }];
                const tries = downloadTries[id] ?? 0;
                downloadTries[id] = tries + 1;
                const answer = answers[Math.min(tries, answers.length - 1)] ?? { done: true };
                if (answer.done) downloadNeeded[id] = false;
                return answer;
              },
            },
          }),
      canary: {
        profile: async () => profile,
        probe: async () => {
          checks[id] = (checks[id] ?? 0) + 1;
          running += 1;
          mostAtOnce = Math.max(mostAtOnce, running);
          try {
            await fake.probeGate?.();
            return findings[Math.min(checks[id] ?? 1, findings.length) - 1] ?? clean;
          } finally {
            running -= 1;
          }
        },
      },
    };
  });
  const choice = new SandboxChoiceService({
    platform: setup.platform ?? "linux",
    backends,
    settings: { get: async () => setting },
  });
  return {
    choice,
    trustChecks: (id: SandboxBackendId) => checks[id] ?? 0,
    ownChecks: (id: SandboxBackendId) => sandboxChecks[id] ?? 0,
    downloadTries: (id: SandboxBackendId) => downloadTries[id] ?? 0,
    mostAtOnce: () => mostAtOnce,
    saves: (next: SandboxSetting | null) => {
      setting = next;
    },
  };
}

export const statusOf = (
  choice: { backends: { id: SandboxBackendId }[] } | null,
  id: SandboxBackendId,
) => choice?.backends.find((backend) => backend.id === id);
