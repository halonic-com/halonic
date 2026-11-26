/**
 * The trusted runner start's test setup: the radar integration in a
 * workspace, its trust, a start gate over fake sandboxes and the paused
 * connectors (`app.trusted-runner-start`, `app.connector-pause`).
 */
import type {
  Clock,
  Digest,
  RecordStore,
  Sandbox,
  SandboxCheck,
  SandboxFence,
} from "@halonicjs/ports";
import type { LocalIntegrationInput } from "@halonicjs/workspace";
import { ConnectorPauses } from "./connector-pauses.ts";
import { readIntegrationFolder } from "./integration-folder.ts";
import { type GatedRunner, RunnerStartGate } from "./runner-start-gate.ts";
import { TestFolderReader } from "./testing/test-folder-reader.ts";
import { TestRecordStore } from "./testing/test-record-store.ts";
import { TestTrustStore } from "./testing/test-trust-store.ts";
import { TestUnfencedRunConsentStore } from "./testing/test-unfenced-run-consent-store.ts";
import { type TrustCheck, TrustService, type TrustSubject } from "./trust-service.ts";
import { TrustedRunnerStart, type TrustedRunnerSubject } from "./trusted-runner-start.ts";
import { UnfencedRuns } from "./unfenced-runs.ts";

/** These tests never take a yes back in another process and no start hangs, so no timer goes off. */
export const idleTimers = { set: () => undefined, clear: () => undefined };

/** SHA-256 from Web Crypto, as the platforms' `Digest` adapters give it. */
export const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

export const clock: Clock = { now: () => new Date("2026-11-11T07:00:00.000Z") };
export const location = "/work/acme";
export const folder = "integrations/radar";

export const passes: SandboxCheck = { ok: true, reason: null, missing: [] };
export const inContainer: SandboxCheck = { ok: false, reason: "container", missing: [] };

export const radarSheet = `id: radar
version: 0.3.0
kit: 1
provides: [connector]
hosts: [radar.example.com, { fromSetting: url, class: private }]
tools:
  - { name: radar-map, description: The rain radar., risk: read, untrusted: true }
`;

/** A sandbox the gate only checks and hands on; the start itself is faked. */
export function sandbox(name: string, check: SandboxCheck = passes): Sandbox & { name: string } {
  return {
    name,
    check: async () => check,
    capabilities: () => ({ files: "shared", strength: name === "launcher" ? "none" : "os" }),
    open: async () => {
      throw new Error("the gate never opens a session itself");
    },
  };
}

export class FakeRunner implements GatedRunner {
  readonly stopped = new Promise<void>(() => {});
  readonly startedIn: string;
  readonly fence: SandboxFence;

  constructor(startedIn: string) {
    this.startedIn = startedIn;
    this.fence = startedIn === "fenced" ? { state: "fenced" } : { state: "off" };
  }

  async close(): Promise<void> {}
}

/** The radar's settings when the person trusted the workspace. */
export const trustedSettings = { url: "http://192.168.1.20:8123" };

/** The radar's start, with the settings it was trusted with. */
export function radar(trust: TrustCheck, connector = "radar"): TrustedRunnerSubject {
  return { trust, folder, connector, settings: trustedSettings };
}

export async function setup(
  check: SandboxCheck = passes,
  settings: Record<string, unknown> = trustedSettings,
  records: RecordStore = new TestRecordStore(),
) {
  const workspace = new TestFolderReader().putFiles({
    [`${folder}/integration.yaml`]: radarSheet,
    [`${folder}/src/index.js`]: "export default {};\n",
  });
  const trust = new TrustService({
    store: new TestTrustStore(),
    digest,
    clock,
    appVersion: "0.1.0",
  });
  const runs = new UnfencedRuns({
    store: new TestUnfencedRunConsentStore(),
    clock,
    timers: idleTimers,
  });
  const gate = new RunnerStartGate({
    platform: "linux",
    fenced: sandbox("fenced", check),
    launcher: sandbox("launcher"),
    runs,
    timers: idleTimers,
  });
  const pauses = new ConnectorPauses({ records, place: "/profile/connector-pauses", clock });
  const starts = new TrustedRunnerStart({ workspace, digest, gate, pauses });
  const started: FakeRunner[] = [];
  const startIn = async (picked: Sandbox) => {
    const runner = new FakeRunner((picked as Sandbox & { name: string }).name);
    started.push(runner);
    return runner;
  };

  /** The workspace as the trust check reads it now: the radar integration as it is on disk. */
  const subject = async (): Promise<TrustSubject> => {
    const read = await readIntegrationFolder(workspace, digest, folder);
    if (!read.ok) throw new Error(JSON.stringify(read.error));
    const radar: LocalIntegrationInput = {
      sheet: read.value.sheet,
      settings,
      folder,
      code: read.value.code,
    };
    return {
      location,
      connectors: [],
      commandPaths: new Map(),
      connectorFiles: new Map(),
      agents: [],
      integrations: [radar],
      providers: [],
    };
  };

  /** Trusts the workspace as a person would, and gives the check that follows. */
  const trusted = async (): Promise<TrustCheck> => {
    const shown = await trust.check(await subject());
    if (shown.status === "refused") {
      throw new Error("The radar integration has nothing to refuse.");
    }
    if (!(await trust.grant(await subject(), shown.fingerprint, "cli")).ok) {
      throw new Error("The person's trust wasn't saved.");
    }
    const check = await trust.check(await subject());
    if (check.status !== "trusted")
      throw new Error(`The check after the trust is ${check.status}.`);
    return check;
  };

  return { workspace, trust, runs, records, pauses, starts, started, startIn, subject, trusted };
}
