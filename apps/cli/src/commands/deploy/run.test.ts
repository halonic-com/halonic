import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDeployService } from "@halonicjs/app";
import type {
  DeployEvent,
  DeployedVersion,
  DeployPlan,
  DeployRequest,
  DeployResult,
  DeployTarget,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DeploySetup } from "../../deploy-host.ts";
import { exitCode } from "../../exit-code.ts";
import type { StopSignal } from "../../output/stop.ts";
import { runCli, type Terminal } from "../../run-cli.ts";
import type { OpenWorkspaceHistory } from "../../run-workspace.ts";
import { captureIo } from "../../test/capture-io.ts";
import { fakeSignals } from "../../test/fake-signals.ts";
import { deployCommandWith } from "./command.ts";

const account = { id: "9a7806061c88ada191ed06f989cc3dac", name: "sam@example.com's Account" };
const commit = "8d1a04b6c0e9f2a3b4c5d6e7f8091a2b3c4d5e6f";
const url = "https://acme.sam-example.workers.dev";
const v1: DeployedVersion = {
  number: 1,
  id: "v-1",
  commit: "3f9c2e1",
  halonicVersion: undefined,
  liveSince: undefined,
};
const v2: DeployedVersion = { ...v1, number: 2, id: "v-2", commit: "8d1a04b" };

const livePlan: DeployPlan = {
  account,
  url,
  creates: [],
  adopts: [],
  databaseChanges: [],
  deletesData: false,
  live: v1,
  liveReaches: [],
  lockedBy: undefined,
  unchanged: false,
  files: ["deployments.yaml", "workspace.yaml"],
};
const firstPlan: DeployPlan = {
  ...livePlan,
  creates: [{ kind: "service", name: "acme" }],
  live: undefined,
  liveReaches: undefined,
};

const upload2 = { step: "upload", version: 2, files: 2, secrets: 0 } as const;
const deployed: DeployResult = {
  outcome: "deployed",
  url,
  version: v2,
  previous: v1,
  warnings: [],
};

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-deploy-run-"));
  await writeFile(join(folder, "workspace.yaml"), "id: acme\nname: Acme\n");
  await writeFile(
    join(folder, "deployments.yaml"),
    [
      "deployments:",
      "  web:",
      "    name: Web",
      "    host: cloudflare",
      "    cloudflare:",
      `      account: ${account.id}`,
      "      worker: acme",
      "",
    ].join("\n"),
  );
});

afterEach(() => rm(folder, { recursive: true, force: true }));

/** The workspace's history: one commit, with the two files. */
const oneCommit: OpenWorkspaceHistory = async () => {
  const files: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "deployments.yaml": "deployments: {}\n",
  };
  return {
    vcs: {
      status: async () => ({
        isRepo: true,
        branch: "main",
        upstream: null,
        ahead: 0,
        behind: 0,
        changes: [],
      }),
      log: async () => [
        {
          hash: commit,
          author: "Sam",
          date: "2026-11-24T14:00:00Z",
          message: "Add the Friday routine",
        },
      ],
      readAt: async (_version, path) => files[path] ?? null,
      listAt: async () => Object.keys(files).sort(),
    },
    close: async () => {},
  };
};

/**
 * A target whose deploy sends `events`, then ends as `end` says: with a
 * result, or once it's stopped, with the port's `stopped` failure.
 * `waiting` settles when the deploy waits to be stopped, so a test sends its
 * signal then, not after a guessed delay.
 */
function targetWith(plan: DeployPlan, events: DeployEvent[], end: DeployResult | "until-stopped") {
  const asked: DeployRequest[] = [];
  let reached = () => {};
  const waiting = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const target = {
    accounts: async () => [account],
    plan: async () => plan,
    deploy: async (request: DeployRequest, onEvent: (event: DeployEvent) => void) => {
      asked.push(request);
      for (const event of events) onEvent(event);
      if (end !== "until-stopped") return end;
      await new Promise((resolve) => {
        request.signal?.addEventListener("abort", resolve);
        reached();
      });
      throw Object.assign(new Error("The deploy was interrupted."), {
        kind: "conflict",
        code: "stopped",
        fix: undefined,
        live: plan.live ?? "none",
        stoppedAfter: upload2,
      });
    },
  } as Partial<DeployTarget> as DeployTarget;
  const setup: DeploySetup = {
    deploys: createDeployService({
      loadTarget: async () => target,
      clock: { now: () => new Date("2026-11-24T14:34:00.000Z") },
    }),
    clock: { now: () => new Date("2026-11-24T14:34:00.000Z") },
    openHistory: oneCommit,
  };
  return { setup, asked, waiting };
}

const plainTerminal: Terminal = {
  env: { LANG: "en_US.UTF-8", NO_COLOR: "1", TERM: "dumb" },
  platform: "linux",
  stdoutIsTerminal: true,
  stderrIsTerminal: true,
};

/** A terminal where the person answers `Deploy? [y/N]` with `answer`. */
function answering(answer: string, written: string[]): Terminal {
  return {
    ...plainTerminal,
    questions: { write: (text) => written.push(text), readLine: async () => answer },
  };
}

const uploadAndGoLive: DeployEvent[] = [
  { ...upload2, phase: "started" },
  { ...upload2, phase: "done" },
  { step: "self-test", version: 2, phase: "started" },
  { step: "self-test", version: 2, phase: "done" },
  { step: "switch", version: 2, phase: "started" },
  { step: "switch", version: 2, phase: "done" },
];

verifies("cli.commands.deploy.run", () => {
  it("deploys the last commit, says each step and ends with the live line", async () => {
    const { setup, asked } = targetWith(livePlan, uploadAndGoLive, deployed);
    const io = captureIo(folder);
    const code = await runCli(["deploy", "web"], io, [deployCommandWith(setup)]);
    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      "✓ Uploaded version 2.",
      "✓ Self-test of version 2 passed.",
      `✓ Acme is live on web: ${url}`,
      "  Deployed commit 8d1a04b as version 2 in 1 s. Version 1 is kept: halonic deploy rollback web",
    ]);
    const [request] = asked;
    expect(request?.deployment).toEqual({
      name: "web",
      accountId: account.id,
      service: "acme",
      environment: "development",
    });
    expect(request?.snapshot.commit).toBe(commit);
    expect(await request?.snapshot.files.list()).toEqual(["deployments.yaml", "workspace.yaml"]);
  });

  it("deploys the one Cloudflare deployment when none is named", async () => {
    const { setup } = targetWith(livePlan, uploadAndGoLive, deployed);
    expect(await runCli(["deploy"], captureIo(folder), [deployCommandWith(setup)])).toBe(
      exitCode.ok,
    );
  });

  it("says the workspace has no deployments and how to add one, with exit 2", async () => {
    await rm(join(folder, "deployments.yaml"));
    const { setup, asked } = targetWith(livePlan, uploadAndGoLive, deployed);
    const io = captureIo(folder);
    const code = await runCli(["deploy"], io, [deployCommandWith(setup)]);
    expect(code).toBe(exitCode.usage);
    expect(io.stderr).toEqual([
      "✕ Acme has no deployments yet.",
      "  Add one to deployments.yaml in the workspace folder, then run halonic deploy again.",
    ]);
    expect(asked).toEqual([]);
  });

  it("shows the summary and asks Deploy? [y/N] on a first deploy", async () => {
    const { setup, asked } = targetWith(firstPlan, uploadAndGoLive, deployed);
    const io = captureIo(folder);
    const written: string[] = [];
    const code = await runCli(["deploy", "web"], io, [deployCommandWith(setup)], {
      terminal: answering("y", written),
    });
    expect(code).toBe(exitCode.ok);
    expect(written.join("")).toContain("Deploy? [y/N] ");
    expect(written.join("")).toContain(
      [
        "Deploy Acme to Cloudflare?",
        "  Account     sam@example.com's Account",
        `  Address     ${url}`,
        '  Files       2 from commit 8d1a04b "Add the Friday routine"',
        "  Creates     the Worker acme",
        "Deploy? [y/N] ",
      ].join("\n"),
    );
    expect(asked).toHaveLength(1);
  });

  it("changes nothing when the answer is no, with exit 1", async () => {
    const { setup, asked } = targetWith(firstPlan, uploadAndGoLive, deployed);
    const io = captureIo(folder);
    const code = await runCli(["deploy", "web"], io, [deployCommandWith(setup)], {
      terminal: answering("n", []),
    });
    expect(code).toBe(exitCode.failed);
    expect(io.stdout).toEqual(["Nothing changed on Cloudflare."]);
    expect(asked).toEqual([]);
  });

  it("without a terminal, names --yes for the deploy question instead of asking", async () => {
    const { setup, asked } = targetWith(firstPlan, uploadAndGoLive, deployed);
    const io = captureIo(folder);
    const code = await runCli(["deploy", "web"], io, [deployCommandWith(setup)]);
    expect(code).toBe(exitCode.usage);
    expect(io.stderr.join("\n")).toContain(
      "1 answer is missing, and there's no terminal to ask you.",
    );
    expect(io.stderr.join("\n")).toContain("Pass it: --yes for the deploy question.");
    expect(asked).toEqual([]);
  });

  it("refuses a workspace that isn't in a git repository, with exit 2", async () => {
    const { setup } = targetWith(livePlan, uploadAndGoLive, deployed);
    const io = captureIo(folder);
    const code = await runCli(["deploy", "web"], io, [
      deployCommandWith({ ...setup, openHistory: async () => null }),
    ]);
    expect(code).toBe(exitCode.usage);
    expect(io.stderr).toEqual([
      "✕ Couldn't deploy web: Acme isn't in a git repository, and a deploy takes its files from a commit.",
      '  Make one and commit: git init && git add . && git commit -m "First version"',
    ]);
  });

  it("says which version is still live when the self-test fails, with exit 1", async () => {
    const failed: DeployResult = {
      outcome: "self-test-failed",
      version: v2,
      failedChecks: ["scheduler"],
      stillLive: v1,
      restoreFailed: false,
    };
    const { setup } = targetWith(livePlan, uploadAndGoLive.slice(0, 3), failed);
    const io = captureIo(folder);
    const code = await runCli(["deploy", "web"], io, [deployCommandWith(setup)]);
    expect(code).toBe(exitCode.failed);
    expect(io.stdout).toEqual([
      "✓ Uploaded version 2.",
      "✕ Couldn't deploy web: version 2 failed its self-test. Version 1 is still live.",
      "  Run again. If it fails again, run it with --debug and report it: https://github.com/halonic-com/halonic/issues",
    ]);
  });

  describe("a stop prints the 3.7 lines and exits with the signal's code (C787 row 1)", () => {
    it.each([
      ["SIGINT", 130],
      ["SIGTERM", 143],
      ["SIGHUP", 129],
    ] as const)("after %s, exits with %i", async (signal: StopSignal, code) => {
      const target = targetWith(livePlan, uploadAndGoLive.slice(0, 2), "until-stopped");
      const io = captureIo(folder);
      const signals = fakeSignals();
      const running = runCli(["deploy", "web"], io, [deployCommandWith(target.setup)], {
        stop: { signals, exitNow: () => {} },
      });
      await target.waiting;
      signals.send(signal);
      expect(await running).toBe(code);
      expect(io.stderr).toEqual([
        "Stopped after uploading version 2. Version 1 is still live.",
        "  Run halonic deploy web again to finish. It picks up what's already there.",
      ]);
    });
  });
});
