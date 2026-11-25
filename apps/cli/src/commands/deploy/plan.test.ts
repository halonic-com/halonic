import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDeployService } from "@halonicjs/app";
import type {
  DeployDone,
  DeployedVersion,
  DeployPlan,
  DeployRequest,
  DeployTarget,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DeploySetup } from "../../deploy-host.ts";
import { exitCode } from "../../exit-code.ts";
import type { QuestionTerminal } from "../../output/question.ts";
import { runCli, type Terminal } from "../../run-cli.ts";
import type { OpenWorkspaceHistory } from "../../run-workspace.ts";
import { captureIo } from "../../test/capture-io.ts";
import { halonicVersion } from "../../version.ts";
import { deployCommandWith } from "./command.ts";

const account = { id: "9a7806061c88ada191ed06f989cc3dac", name: "sam@example.com's Account" };
const url = "https://acme.sam-example.workers.dev";
const commit = "8d1a04b6e5f1c2d3a4b5c6d7e8f9a0b1c2d3e4f5";
const v1: DeployedVersion = {
  number: 1,
  id: "v-1",
  commit: "3f9c2e1",
  halonicVersion,
  liveSince: undefined,
};

const claude = "id: claude\ntype: anthropic\nsecret: anthropic-key\n";
const filesConnector =
  "name: Files\ntransport:\n  stdio:\n    command: acme-files-server\ntools:\n  allow: [read_file]\n";
const ollama = "id: ollama\ntype: ollama\n";

/** `deployments.yaml` with the one deployment `web` on Cloudflare, at `stage`. */
function deploymentsYaml(stage: "production" | "development"): string {
  return [
    "deployments:",
    "  web:",
    "    name: Web",
    "    host: cloudflare",
    `    stage: ${stage}`,
    "    cloudflare:",
    `      account: ${account.id}`,
    "      worker: acme",
    "",
  ].join("\n");
}

const committed = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "deployments.yaml": deploymentsYaml("production"),
  "providers/claude.yaml": claude,
};

const firstPlan: DeployPlan = {
  account,
  url,
  creates: [
    { kind: "service", name: "acme" },
    { kind: "database", name: "acme-data" },
    { kind: "bucket", name: "acme-blobs" },
  ],
  adopts: [],
  databaseChanges: ["0001"],
  deletesData: false,
  live: undefined,
  liveReaches: undefined,
  lockedBy: undefined,
  unchanged: false,
  files: Object.keys(committed).sort(),
};

const laterPlan: DeployPlan = {
  ...firstPlan,
  creates: [],
  databaseChanges: [],
  live: v1,
  liveReaches: [{ address: "api.anthropic.com", secret: "anthropic-key" }],
};

const done: DeployDone = {
  outcome: "deployed",
  url,
  version: { ...v1, number: 2, id: "v-2", commit: "8d1a04b" },
  previous: v1,
  warnings: [],
};

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-deploy-plan-"));
  await writeFile(join(folder, "workspace.yaml"), "id: acme\nname: Acme\n");
  await writeFile(join(folder, "deployments.yaml"), deploymentsYaml("production"));
});

afterEach(() => rm(folder, { recursive: true, force: true }));

/** A history of one commit with `files`, and `changed` files not in it. */
function historyOf(files: Record<string, string>, changed: number): OpenWorkspaceHistory {
  return async () => ({
    vcs: {
      status: async () => ({
        isRepo: true,
        branch: "main",
        upstream: null,
        ahead: 0,
        behind: 0,
        changes: Array.from({ length: changed }, (_, index) => ({
          path: `changed-${index}.yaml`,
          status: "modified" as const,
          staged: false,
        })),
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
      listAt: async (_version, dir) =>
        Object.keys(files)
          .filter((path) => dir === undefined || path.startsWith(`${dir}/`))
          .sort(),
    },
    close: async () => {},
  });
}

function setupWith(plan: DeployPlan, files: Record<string, string> = committed, changed = 0) {
  const calls: string[] = [];
  const deployed: DeployRequest[] = [];
  const target = {
    accounts: async () => [account],
    plan: async () => {
      calls.push("plan");
      return plan;
    },
    deploy: async (request: DeployRequest, onEvent) => {
      calls.push("deploy");
      deployed.push(request);
      onEvent({ phase: "started", step: "upload", version: 2, files: 3, secrets: 1 });
      onEvent({ phase: "done", step: "upload", version: 2, files: 3, secrets: 1 });
      return done;
    },
  } as Partial<DeployTarget> as DeployTarget;
  const clock = { now: () => new Date("2026-11-25T10:00:00Z") };
  const setup: DeploySetup = {
    deploys: createDeployService({ loadTarget: async () => target, clock }),
    clock,
    timeZone: "UTC",
    openHistory: historyOf(files, changed),
  };
  return { setup, calls, deployed };
}

/** A terminal where the user types `answers`, one per question. */
function terminalTyping(...answers: string[]) {
  const written: string[] = [];
  const questions: QuestionTerminal = {
    write: (text) => written.push(text),
    readLine: async () => answers.shift(),
    readSecret: async () => answers.shift(),
  };
  const terminal: Terminal = {
    env: { LANG: "en_US.UTF-8", NO_COLOR: "1" },
    platform: "linux",
    stdoutIsTerminal: true,
    stderrIsTerminal: true,
    questions,
  };
  return { terminal, written };
}

async function deploy(setup: DeploySetup, args: readonly string[], terminal?: Terminal) {
  const io = captureIo(folder);
  const code = await runCli(["deploy", ...args], io, [deployCommandWith(setup)], {
    ...(terminal === undefined ? {} : { terminal }),
  });
  return { code, io };
}

verifies("cli.commands.deploy.plan", () => {
  it("shows the summary and every file, and changes nothing", async () => {
    const { setup, calls } = setupWith(firstPlan);
    const { code, io } = await deploy(setup, ["web", "--plan"]);
    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      "Deploy Acme to Cloudflare?",
      "  Account     sam@example.com's Account",
      `  Address     ${url}`,
      '  Files       3 from commit 8d1a04b "Add the Friday routine"',
      "  Creates     the Worker acme, the D1 database acme-data, the R2 bucket acme-blobs",
      "  Reaches     api.anthropic.com, with anthropic-key",
      "  Secrets     anthropic-key",
      "    deployments.yaml",
      "    providers/claude.yaml",
      "    workspace.yaml",
      "Nothing changed on Cloudflare. Run without --plan to deploy.",
    ]);
    expect(calls).toEqual(["plan"]);
  });

  it("exits 1 with --exit-code when the deploy would change something", async () => {
    const { setup } = setupWith(firstPlan);
    expect((await deploy(setup, ["web", "--plan", "--exit-code"])).code).toBe(exitCode.failed);
  });

  it("exits 0 with --exit-code when nothing would change", async () => {
    const { setup } = setupWith({ ...laterPlan, unchanged: true });
    expect((await deploy(setup, ["web", "--plan", "--exit-code"])).code).toBe(exitCode.ok);
  });

  it("refuses --exit-code without --plan as wrong usage", async () => {
    const { setup, calls } = setupWith(firstPlan);
    const { code, io } = await deploy(setup, ["web", "--exit-code"]);
    expect(code).toBe(exitCode.usage);
    expect(io.stderr[0]).toBe("✕ --exit-code works only with --plan.");
    expect(calls).toEqual([]);
  });

  it("lists --plan next to status in --help", async () => {
    const { setup } = setupWith(firstPlan);
    const help = (await deploy(setup, ["--help"])).io.stdout.join("\n");
    expect(help).toContain("halonic deploy [<deployment>] [--plan [--exit-code]] [--yes]");
    expect(help).toContain("status");
    expect(help).toContain("--plan");
  });
});

verifies("cli.commands.deploy.run", () => {
  describe("the gate (3.6)", () => {
    it("refuses uncommitted changes on production", async () => {
      const { setup, calls } = setupWith(firstPlan, committed, 2);
      const { code, io } = await deploy(setup, ["web"]);
      expect(code).toBe(exitCode.conflict);
      expect(io.stderr.slice(0, 2)).toEqual([
        "✕ Couldn't deploy web: 2 files have changes that aren't committed. Nothing changed on Cloudflare.",
        "  Commit them (git status lists them), then run again.",
      ]);
      expect(calls).toEqual([]);
    });

    it("takes the stage from the commit, not from an uncommitted deployments.yaml", async () => {
      await writeFile(join(folder, "deployments.yaml"), deploymentsYaml("development"));
      const { setup, calls } = setupWith(firstPlan, committed, 1);
      const { code, io } = await deploy(setup, ["web"]);
      expect(code).toBe(exitCode.conflict);
      expect(io.stderr[0]).toBe(
        "✕ Couldn't deploy web: 1 file has changes that aren't committed. Nothing changed on Cloudflare.",
      );
      expect(calls).toEqual([]);
    });

    it("lists every file that can't run on Cloudflare", async () => {
      const { setup, calls } = setupWith(firstPlan, {
        ...committed,
        "library/connectors/files.connector.yaml": filesConnector,
        "providers/ollama.yaml": ollama,
      });
      const { code, io } = await deploy(setup, ["web"]);
      expect(code).toBe(exitCode.denied);
      expect(io.stderr[0]).toBe(
        "✕ Couldn't deploy web: 2 things in Acme can't run on Cloudflare. Nothing changed on Cloudflare.",
      );
      const all = io.stderr.join("\n");
      expect(all).toContain(
        "The connector files starts a program, and Cloudflare can't start programs.  (capability-missing)",
      );
      expect(all).toContain(
        "The provider ollama is at localhost, which Cloudflare can't reach.  (capability-missing)",
      );
      expect(calls).toEqual([]);
    });

    it("says one thing on line 1, with the fix for an address", async () => {
      const { setup } = setupWith(firstPlan, { ...committed, "providers/ollama.yaml": ollama });
      const { code, io } = await deploy(setup, ["web"]);
      expect(code).toBe(exitCode.denied);
      expect(io.stderr.slice(0, 2)).toEqual([
        "✕ Couldn't deploy web: the provider ollama is at localhost, which Cloudflare can't reach. Nothing changed on Cloudflare.",
        "  Give it an internet address instead, or leave it out of the hubs web uses.",
      ]);
    });

    it("says one thing on line 1, with the fix for a program", async () => {
      const { setup } = setupWith(firstPlan, {
        ...committed,
        "library/connectors/files.connector.yaml": filesConnector,
      });
      const { io } = await deploy(setup, ["web"]);
      expect(io.stderr.slice(0, 2)).toEqual([
        "✕ Couldn't deploy web: the connector files starts a program, and Cloudflare can't start programs. Nothing changed on Cloudflare.",
        "  Leave it out of the hubs web uses, or run Acme with halonic serve on your own machine.",
      ]);
    });

    it("takes one deployment", async () => {
      const { setup, calls } = setupWith(firstPlan);
      const { code, io } = await deploy(setup, ["web", "staging"]);
      expect(code).toBe(exitCode.usage);
      expect(io.stderr[0]).toBe("✕ halonic deploy takes one deployment. Run it once for each.");
      expect(calls).toEqual([]);
    });
  });

  describe("secrets (2.6)", () => {
    it("asks for each secret with what names it, and sends what the workspace reaches", async () => {
      const { setup, deployed } = setupWith(laterPlan);
      const { terminal, written } = terminalTyping("sk-test");
      const { code } = await deploy(setup, ["web"], terminal);
      expect(code).toBe(exitCode.ok);
      expect(written.join("")).toContain(
        "Acme's provider claude needs the secret anthropic-key on Cloudflare.",
      );
      expect(written.join("")).not.toContain("Deploy?");
      expect(deployed[0]?.secrets.get("anthropic-key")).toBe("sk-test");
      expect(deployed[0]?.reaches).toEqual([
        { address: "api.anthropic.com", secret: "anthropic-key" },
      ]);
    });

    it("lists every missing answer in one error without a terminal", async () => {
      const { setup, calls } = setupWith(firstPlan);
      const { code, io } = await deploy(setup, ["web"]);
      expect(code).toBe(exitCode.usage);
      expect(io.stderr[0]).toContain("2 answers are missing, and there's no terminal to ask you.");
      expect(calls).not.toContain("deploy");
    });
  });
});
