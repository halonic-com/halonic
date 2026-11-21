import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { FileAgentPlacementStore } from "@halonicjs/adapter-fs-node";
import { AgentPlacement, agentFingerprint } from "@halonicjs/app";
import type { SandboxProfile } from "@halonicjs/ports";
import { placementFolder, profileFolder } from "@halonicjs/profile";
import { fixedClock } from "@halonicjs/std";
import { contractGrant } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  acme,
  commitWorkspace,
  type Fakes,
  fakesFor,
  gitTimeout,
  openEngine,
  profile,
  runChange,
  setUpRig,
  tearDownRig,
} from "./test/local-harness-host-kit.ts";
import { webCryptoDigest } from "./workspace-runs.ts";

// The bridge's place by the run's placement (HAL-13090), with this
// computer's own launcher and Node bridge servers: only the sandbox and the
// program stay fakes. With one socket server for every run, the launcher
// refused each run a person set to "On this computer" on Linux and macOS.

beforeEach(setUpRig);
afterEach(tearDownRig);

const coderFile = "hubs/lab/agents/coder.agent.yaml";
// Windows serves every bridge on loopback, and the CLI can't find a harness there yet.
const onWindows = process.platform === "win32";

/** A person chose "On this computer" for the coder, for its file as it is now. */
async function chooseThisComputerForCoder(): Promise<void> {
  const placement = new AgentPlacement({
    store: new FileAgentPlacementStore(placementFolder(profileFolder(profile))),
    digest: webCryptoDigest,
    clock: fixedClock(Date.parse("2026-11-19T10:00:00.000Z")),
  });
  const file = new Uint8Array(await readFile(join(acme, coderFile)));
  const subject = { location: await realpath(acme), hub: "lab", agent: "coder", file };
  const shown = await agentFingerprint(file, webCryptoDigest);
  expect((await placement.chooseThisComputer(subject, shown)).ok).toBe(true);
}

/** The fakes with this computer's launcher and bridge servers in place of theirs. */
function withRealLauncherAndBridges(fakes: Fakes): Fakes {
  const { launcher: _launcher, bridgeServer: _bridgeServer, ...parts } = fakes.parts;
  return { ...fakes, parts: { ...parts, platform: process.platform } };
}

verifies("cli.local-harness-bridge-place", () => {
  it.skipIf(onWindows)(
    "[platform:win32] the CLI serves bridges on sockets only on Linux and macOS: starts a run on this computer through the launcher, with its bridge on loopback",
    async () => {
      await chooseThisComputerForCoder();
      const version = await commitWorkspace();
      const bridges: SandboxProfile["network"]["bridge"][] = [];
      const fakes = withRealLauncherAndBridges(
        fakesFor({ onStart: async (given) => void bridges.push(given.network.bridge) }),
      );
      const engine = await openEngine(fakes, contractGrant);

      const { summary } = await runChange(engine, version);

      expect(summary).toMatchObject({ status: "completed" });
      expect(bridges).toEqual([{ kind: "loopback", host: "127.0.0.1", port: expect.any(Number) }]);
      // The launcher ran it: the fenced sandbox never opened.
      expect(fakes.profiles).toEqual([]);
    },
    gitTimeout,
  );

  it.skipIf(onWindows)(
    "[platform:win32] the CLI serves bridges on sockets only on Linux and macOS: keeps a fenced run's bridge on a Unix socket",
    async () => {
      const version = await commitWorkspace();
      const fakes = withRealLauncherAndBridges(fakesFor({ onStart: async () => {} }));
      const engine = await openEngine(fakes, contractGrant);

      const { summary } = await runChange(engine, version);

      expect(summary).toMatchObject({ status: "completed" });
      expect(fakes.profiles.map((given) => given.network.bridge?.kind)).toEqual(["socket"]);
    },
    gitTimeout,
  );
});
