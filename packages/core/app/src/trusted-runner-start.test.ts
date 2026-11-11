import type { Clock, Digest, Sandbox, SandboxCheck, SandboxFence } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import type { LocalIntegrationInput } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { readIntegrationFolder } from "./integration-folder.ts";
import { type GatedRunner, RunnerStartGate } from "./runner-start-gate.ts";
import { TestFolderReader } from "./testing/test-folder-reader.ts";
import { TestTrustStore } from "./testing/test-trust-store.ts";
import { TestUnfencedRunConsentStore } from "./testing/test-unfenced-run-consent-store.ts";
import { type TrustCheck, TrustService, type TrustSubject } from "./trust-service.ts";
import {
  IntegrationNotTrustedError,
  TrustedRunnerStart,
  type TrustedRunnerSubject,
} from "./trusted-runner-start.ts";
import { UnfencedRuns } from "./unfenced-runs.ts";

/** SHA-256 from Web Crypto, as the platforms' `Digest` adapters give it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const clock: Clock = { now: () => new Date("2026-11-11T07:00:00.000Z") };
const location = "/work/acme";
const folder = "integrations/radar";

const passes: SandboxCheck = { ok: true, reason: null, missing: [] };
const inContainer: SandboxCheck = { ok: false, reason: "container", missing: [] };

const radarSheet = `id: radar
version: 0.3.0
kit: 1
provides: [connector]
hosts: [radar.example.com, { fromSetting: url, class: private }]
tools:
  - { name: radar-map, description: The rain radar., risk: read, untrusted: true }
`;

/** A sandbox the gate only checks and hands on; the start itself is faked. */
function sandbox(name: string, check: SandboxCheck = passes): Sandbox & { name: string } {
  return {
    name,
    check: async () => check,
    capabilities: () => ({ files: "shared", strength: name === "launcher" ? "none" : "os" }),
    open: async () => {
      throw new Error("the gate never opens a session itself");
    },
  };
}

class FakeRunner implements GatedRunner {
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
const trustedSettings = { url: "http://192.168.1.20:8123" };

/** The radar's start, with the settings it was trusted with. */
function radar(trust: TrustCheck): TrustedRunnerSubject {
  return { trust, folder, settings: trustedSettings };
}

async function setup(
  check: SandboxCheck = passes,
  settings: Record<string, unknown> = trustedSettings,
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
  const runs = new UnfencedRuns({ store: new TestUnfencedRunConsentStore(), clock });
  const gate = new RunnerStartGate({
    platform: "linux",
    fenced: sandbox("fenced", check),
    launcher: sandbox("launcher"),
    runs,
  });
  const starts = new TrustedRunnerStart({ workspace, digest, gate });
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
      agents: [],
      integrations: [radar],
      providers: [],
    };
  };

  /** Trusts the workspace as a person would, and gives the check that follows. */
  const trusted = async (): Promise<TrustCheck> => {
    const shown = await trust.check(await subject());
    expect((await trust.grant(await subject(), shown.fingerprint, "cli")).ok).toBe(true);
    const check = await trust.check(await subject());
    expect(check.status).toBe("trusted");
    return check;
  };

  return { workspace, trust, runs, starts, started, startIn, subject, trusted };
}

async function refusal(promise: Promise<unknown>): Promise<IntegrationNotTrustedError> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(IntegrationNotTrustedError);
  return error as IntegrationNotTrustedError;
}

verifies("app.trusted-runner-start", () => {
  describe("TrustedRunnerStart", () => {
    it("starts the runner through the gate when the trust covers the folder as it is", async () => {
      const { starts, started, startIn, trusted } = await setup();
      const start = await starts.start(radar(await trusted()), startIn);
      expect(start.run).toBe("fenced");
      expect(started.map((runner) => runner.startedIn)).toEqual(["fenced"]);
    });

    it("starts no process in a workspace that was never trusted (8a)", async () => {
      const { trust, starts, started, startIn, subject } = await setup();
      const check = await trust.check(await subject());
      expect(check.status).toBe("new");
      const error = await refusal(starts.start(radar(check), startIn));
      expect(error.reason).toBe("workspace-not-trusted");
      expect(started).toEqual([]);
    });

    it("starts nothing for a folder the trusted content doesn't name", async () => {
      const { starts, started, startIn, trusted } = await setup();
      const error = await refusal(
        starts.start(
          { trust: await trusted(), folder: "integrations/other", settings: trustedSettings },
          startIn,
        ),
      );
      expect(error.reason).toBe("not-in-trust");
      expect(started).toEqual([]);
    });

    it("starts nothing when one byte changed since the trust, even with the earlier check in hand", async () => {
      const { workspace, starts, started, startIn, trusted } = await setup();
      const check = await trusted();
      workspace.putFiles({ [`${folder}/src/index.js`]: "export default {};\r" });
      const error = await refusal(starts.start(radar(check), startIn));
      expect(error.reason).toBe("code-changed");
      expect(started).toEqual([]);
    });

    it("starts nothing when a link appeared in the folder since the trust (A12)", async () => {
      const { workspace, starts, started, startIn, trusted } = await setup();
      const check = await trusted();
      workspace.putLink(`${folder}/src/keys`);
      const error = await refusal(starts.start(radar(check), startIn));
      expect(error.reason).toBe("folder-refused");
      expect(error.problems).toEqual([expect.objectContaining({ code: "link", file: "src/keys" })]);
      expect(started).toEqual([]);
    });

    it("checks the folder again at every start, such as the restart after an idle stop", async () => {
      const { workspace, starts, started, startIn, trusted } = await setup();
      const check = await trusted();
      expect((await starts.start(radar(check), startIn)).run).toBe("fenced");
      workspace.putFiles({ [`${folder}/src/extra.js`]: "" });
      const error = await refusal(starts.start(radar(check), startIn));
      expect(error.reason).toBe("code-changed");
      expect(started).toHaveLength(1);
    });

    it("names the folder as the trust content does, a trailing slash or not", async () => {
      const { starts, startIn, trusted } = await setup();
      const start = await starts.start(
        { trust: await trusted(), folder: `${folder}/`, settings: trustedSettings },
        startIn,
      );
      expect(start.run).toBe("fenced");
    });

    it("starts nothing when a setting's address changed since the trust, even with the earlier check in hand", async () => {
      const { starts, started, startIn, trusted } = await setup();
      const check = await trusted();
      const error = await refusal(
        starts.start(
          { trust: check, folder, settings: { url: "http://192.168.1.99:8123" } },
          startIn,
        ),
      );
      expect(error.reason).toBe("settings-changed");
      expect(started).toEqual([]);
    });

    it("starts with a setting still unset as trusted, and refuses it once set without a new trust", async () => {
      const { starts, started, startIn, trusted } = await setup(passes, {});
      const check = await trusted();
      if (check.status !== "trusted") throw new Error("expected a trusted check");
      expect(check.content.integrations?.[0]?.addresses).toEqual({ url: null });
      expect((await starts.start({ trust: check, folder, settings: {} }, startIn)).run).toBe(
        "fenced",
      );
      const error = await refusal(starts.start(radar(check), startIn));
      expect(error.reason).toBe("settings-changed");
      expect(started).toHaveLength(1);
    });

    it("takes the same trust whether the run is fenced or not: the fence status isn't in it", async () => {
      const { runs, starts, started, startIn, trusted } = await setup(inContainer);
      const check = await trusted();
      expect(await starts.start(radar(check), startIn)).toEqual({
        run: "needs-yes",
        reason: "container",
      });
      await runs.allow("container");
      expect((await starts.start(radar(check), startIn)).run).toBe("unfenced");
      expect(started.map((runner) => runner.startedIn)).toEqual(["launcher"]);
    });
  });
});
