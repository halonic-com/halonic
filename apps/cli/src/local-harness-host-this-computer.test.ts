import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { FileAgentPlacementStore } from "@halonicjs/adapter-fs-node";
import { AgentPlacement, agentFingerprint } from "@halonicjs/app";
import type { SandboxNetwork, SandboxSession } from "@halonicjs/ports";
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
  reported,
  runChange,
  setUpRig,
  tearDownRig,
} from "./test/local-harness-host-kit.ts";
import { webCryptoDigest } from "./workspace-runs.ts";

// Where the CLI's harness host opens each run's bridge (HAL-13796), with
// the real launcher and the real Node bridge servers: a program started on
// this computer has no sandbox proxy, so a bridge on a Unix socket is out of
// its reach. Only the harness is a fake, which starts a real program in the
// session it is given.

beforeEach(setUpRig);
afterEach(tearDownRig);

/** The fakes, but with this computer's launcher and Node's bridge servers on Linux. */
function withRealBridges(fakes: Fakes): Fakes {
  const { launcher: _launcher, bridgeServer: _bridgeServer, ...parts } = fakes.parts;
  return { ...fakes, parts: { ...parts, platform: "linux" } };
}

/** A person chose "On this computer" for the coder, for its file as it is now. */
async function chooseThisComputer(): Promise<void> {
  const placement = new AgentPlacement({
    store: new FileAgentPlacementStore(placementFolder(profileFolder(profile))),
    digest: webCryptoDigest,
    clock: fixedClock(Date.parse("2026-11-19T09:00:00.000Z")),
  });
  const file = new Uint8Array(await readFile(join(acme, "hubs/lab/agents/coder.agent.yaml")));
  const subject = { location: await realpath(acme), agent: "coder", file };
  const shown = await agentFingerprint(file, webCryptoDigest);
  expect((await placement.chooseThisComputer(subject, shown)).ok).toBe(true);
}

/**
 * Starts Node in the session and asks the bridge for its root, without the
 * run's token; gives the HTTP status it answered with, or the error text
 * when it couldn't be reached.
 */
async function askBridge(session: SandboxSession, bridge: SandboxNetwork["bridge"]) {
  if (bridge?.kind !== "loopback") throw new Error(`The bridge is on a ${bridge?.kind}.`);
  const url = `http://${bridge.host}:${bridge.port}/`;
  const script = `fetch(${JSON.stringify(url)}).then((r) => console.log(r.status), (e) => console.log(String(e.cause ?? e)))`;
  const program = await session.start({ program: process.execPath, args: ["-e", script] });
  const [answer] = await Promise.all([
    new Response(program.stdout).text(),
    program.exited,
    program.stdin.close(),
  ]);
  return answer.trim();
}

verifies("cli.local-harness-host-bridges", () => {
  it(
    "opens the bridge of an agent set to On this computer on a loopback port its program reaches",
    async () => {
      const version = await commitWorkspace();
      await chooseThisComputer();
      const answers: string[] = [];
      const fakes = fakesFor({
        onStart: async (given, session) => {
          answers.push(await askBridge(session, given.network.bridge));
        },
      });
      const engine = await openEngine(withRealBridges(fakes), contractGrant);

      const { summary } = await runChange(engine, version);

      expect(summary).toMatchObject({ status: "completed" });
      // The bridge answered, and refused a request without the run's token.
      expect(answers).toEqual(["401"]);
      expect(reported).toEqual([]);
    },
    gitTimeout,
  );
});
