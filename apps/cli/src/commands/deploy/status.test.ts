import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDeployService } from "@halonicjs/app";
import type {
  DeployedVersion,
  DeploymentRef,
  DeploymentStatus,
  DeployTarget,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DeploySetup } from "../../deploy-host.ts";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { halonicVersion } from "../../version.ts";
import { deployCommandWith } from "./command.ts";

const account = { id: "9a7806061c88ada191ed06f989cc3dac", name: "sam@example.com's Account" };
const now = new Date("2026-11-24T14:34:00.000Z");

const v1: DeployedVersion = {
  number: 1,
  id: "v-1",
  commit: "3f9c2e1",
  halonicVersion,
  liveSince: "2026-11-12T10:00:00.000Z",
};
const v2: DeployedVersion = {
  ...v1,
  number: 2,
  id: "v-2",
  commit: "8d1a04b",
  liveSince: "2026-11-12T14:02:00.000Z",
};

const live: DeploymentStatus = {
  account,
  url: "https://acme.sam-example.workers.dev",
  live: v2,
  previous: v1,
  health: { answering: true, lastRoutineTick: "2026-11-24T14:30:00.000Z" },
  runs: { running: 1, waiting: 1, lastDay: 12 },
  lockedBy: undefined,
  unfinished: undefined,
};

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-deploy-status-"));
  await writeFile(join(folder, "workspace.yaml"), "id: acme\nname: Acme\n");
  await writeFile(
    join(folder, "deployments.yaml"),
    [
      "deployments:",
      "  home:",
      "    name: Home",
      "    host: local",
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

/** A target whose token reaches Sam's account and whose status is `status`. */
function targetWith(status: DeploymentStatus) {
  const asked: DeploymentRef[] = [];
  const target = {
    accounts: async () => [account],
    status: async (ref: DeploymentRef) => {
      asked.push(ref);
      return status;
    },
  } as Partial<DeployTarget> as DeployTarget;
  return { target, asked };
}

function setupWith(status: DeploymentStatus): DeploySetup {
  const { target } = targetWith(status);
  return {
    deploys: createDeployService({ loadTarget: async () => target, clock: { now: () => now } }),
    clock: { now: () => now },
    timeZone: "UTC",
  };
}

async function deploy(setup: DeploySetup, args: readonly string[]) {
  const io = captureIo(folder);
  const code = await runCli(["deploy", ...args], io, [deployCommandWith(setup)]);
  return { code, io };
}

verifies("cli.commands.deploy.status", () => {
  it("shows the rows of what's live, with the version a rollback goes back to", async () => {
    const { code, io } = await deploy(setupWith(live), ["status", "web"]);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      "web · Cloudflare · sam@example.com's Account",
      "  Address   https://acme.sam-example.workers.dev",
      "  Live      version 2 · commit 8d1a04b · since 12 Nov 14:02",
      `  Halonic   ${halonicVersion}, the same as this computer`,
      "  Health    ✓ answering · last routine tick 14:30",
      "  Runs      1 running · 1 waiting for you · 12 in the last day",
      "  Before    version 1 · commit 3f9c2e1   halonic deploy rollback web",
    ]);
  });

  it("points at the address when the host can't count the runs", async () => {
    const { io } = await deploy(
      setupWith({ ...live, runs: undefined, health: { answering: false } }),
      ["status", "web"],
    );

    expect(io.stdout).toContain("  Health    ✕ not answering");
    expect(io.stdout).toContain("  Runs      open the address to see them");
  });

  describe("compares the live Halonic with this computer's", () => {
    it.each([
      ["0.0.9", `0.0.9 · this computer has ${halonicVersion}. Update web: halonic deploy web`],
      [
        "99.0.0",
        `99.0.0 · this computer has ${halonicVersion}. Update Halonic here before you deploy again.`,
      ],
    ])("live %s", async (there, row) => {
      const { io } = await deploy(setupWith({ ...live, live: { ...v2, halonicVersion: there } }), [
        "status",
        "web",
      ]);

      expect(io.stdout).toContain(`  Halonic   ${row}`);
    });
  });

  it("says when nothing is live yet, with no rows about a version", async () => {
    const { io } = await deploy(
      setupWith({ ...live, url: undefined, live: undefined, previous: undefined }),
      ["status", "web"],
    );

    expect(io.stdout).toEqual([
      "web · Cloudflare · sam@example.com's Account",
      "  Live   nothing yet. Deploy it: halonic deploy web",
    ]);
  });

  it("says who holds the lock and when it runs out, and leaves out the unfinished step then", async () => {
    const { io } = await deploy(
      setupWith({
        ...live,
        lockedBy: {
          who: "sam@example.com",
          startedAt: "2026-11-24T14:32:00.000Z",
          expiresAt: "2026-11-24T14:42:00.000Z",
        },
        unfinished: "database",
      }),
      ["status", "web"],
    );

    expect(io.stdout.at(-1)).toBe(
      "! A deploy of web by sam@example.com started 2 min ago and hasn't finished. If it was stopped, deploy again after 14:42, when its lock runs out.",
    );
    expect(io.stdout.join("\n")).not.toContain("The last deploy");
  });

  it("says where the last deploy stopped when no deploy holds the lock", async () => {
    const { io } = await deploy(setupWith({ ...live, unfinished: "create" }), ["status", "web"]);

    expect(io.stdout.at(-1)).toBe(
      "! The last deploy of web stopped while creating the Worker, the database and the bucket. The next deploy finishes it: halonic deploy web",
    );
  });

  it("adds what the host said and this computer's Halonic to --json", async () => {
    const { io } = await deploy(setupWith(live), ["status", "web", "--json"]);

    expect(JSON.parse(io.stdout.join("\n"))).toMatchObject({
      ok: true,
      deployment: "web",
      account,
      live: { number: 2, commit: "8d1a04b" },
      runs: { running: 1, waiting: 1, lastDay: 12 },
      thisHalonic: halonicVersion,
    });
  });

  it("asks the target about the deployment's Worker in its account", async () => {
    const { target, asked } = targetWith(live);
    await deploy(
      {
        deploys: createDeployService({ loadTarget: async () => target, clock: { now: () => now } }),
      },
      ["status", "web"],
    );

    expect(asked).toEqual([
      { name: "web", accountId: account.id, service: "acme", environment: "development" },
    ]);
  });

  it("refuses a local deployment with the halonic serve pointer", async () => {
    const { code, io } = await deploy(setupWith(live), ["status", "home"]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr).toEqual([
      "✕ Couldn't show home's status: home runs on your own machine, not on Cloudflare.",
      "  Start it with halonic serve home.",
    ]);
  });

  it("says a name that isn't in deployments.yaml isn't there, not that a name is missing", async () => {
    const { code, io } = await deploy(setupWith(live), ["status", "nope"]);

    expect(code).toBe(exitCode.notFound);
    expect(io.stderr).toEqual([
      "✕ Couldn't show nope's status: Acme has no deployment named nope.",
      "  Check the name in deployments.yaml.",
    ]);
  });

  it("needs the deployment's name", async () => {
    const { code, io } = await deploy(setupWith(live), ["status"]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr[0]).toBe("✕ Say which deployment to show.");
  });

  it("says the Cloudflare package isn't installed, with exit 4", async () => {
    const missing = Object.assign(
      new Error("Cannot find package '@halonicjs/target-cloudflare-deploy'"),
      {
        code: "ERR_MODULE_NOT_FOUND",
      },
    );
    const { code, io } = await deploy(
      {
        environment: {},
        importPackage: async () => {
          throw missing;
        },
      },
      ["status", "web"],
    );

    expect(code).toBe(exitCode.notFound);
    expect(io.stderr[0]).toContain("@halonicjs/target-cloudflare-deploy");
  });
});
