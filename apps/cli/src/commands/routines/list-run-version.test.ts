import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { type OpenWorkspaceHistory, openGitHistory } from "../../run-workspace.ts";
import { captureIo } from "../../test/capture-io.ts";
import { testRunSetup } from "../../test/run-setup.ts";
import { trustedAt, trustKit } from "../../test/trust-kit.spec.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { createTrustCommand } from "../trust/command.ts";
import { routinesCommandWith } from "./command.ts";

/** Each test runs git itself, which is slow on a busy runner, as in the git adapter's own tests. */
const gitTimeout = 30_000;

const { folder, store, writeAcme } = trustKit();

/** The workspace's history through git itself, as the CLI opens it. */
const history: OpenWorkspaceHistory = async (root) =>
  openGitHistory(root, { git: await testGit() });

const noCommands = { path: undefined, endings: [] };

/** The trust records `halonic routines` reads: the kit's, which `halonic trust` writes. */
const trustMachine = () => ({
  trustStore: store(),
  clock: fixedClock(trustedAt),
  commandSearch: noCommands,
});

const morning =
  'id: morning\nname: Morning check\ntrigger: { schedule: "0 8 * * *" }\nrun: { workflow: reply }\n';
const mailWithAll =
  "name: Mail\ntransport:\n  stdio:\n    command: npx\n    args: ['@acme/mail-mcp', '--all']\ntools:\n  approve: []\n";

let runner: GitRunner;

beforeEach(async () => {
  runner = await GitRunner.create({ git: await testGit() });
});

afterEach(async () => {
  await runner.close();
});

const acme = () => join(folder(), "acme");

/** Commits every file in Acme's folder as its first version. */
async function commitAcme(): Promise<void> {
  const vcs = new GitVcs(acme(), { runner, author: { name: "Test", email: "test@example.com" } });
  await vcs.init();
  const files = readdirSync(acme(), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(acme(), join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
    .filter((path) => !path.startsWith(".git/"));
  await vcs.stage(files);
  await vcs.commit("First version");
}

/** Acme committed, then trusted with `halonic trust` while a saved change to a connector isn't committed. */
async function trustAcmeWithChangeNotCommitted(): Promise<void> {
  writeAcme({ "workflows/routines/morning.routine.yaml": morning });
  await commitAcme();
  writeAcme({ "library/connectors/mail.connector.yaml": mailWithAll });
  const command = createTrustCommand(() => ({
    store: store(),
    clock: fixedClock(trustedAt),
    commandSearch: noCommands,
    history,
  }));
  const shown = captureIo(folder());
  await runCli(["trust", "--dir", "acme"], shown, [command]);
  const fingerprint = shown.stdout.at(-1) ?? "";
  const trust = ["trust", "--dir", "acme", "--yes", "--fingerprint", fingerprint];
  expect(await runCli(trust, captureIo(folder()), [command])).toBe(exitCode.ok);
}

verifies("cli.trust-state-run-version", () => {
  it(
    "lists the routines as able to start once the version they start is trusted, with a saved change not committed",
    async () => {
      await trustAcmeWithChangeNotCommitted();
      const profile = {
        ...nodeProfileEnvironment(),
        variables: { HALONIC_HOME: join(folder(), "profile") },
      };
      const command = routinesCommandWith({
        ...testRunSetup(folder(), profile),
        trust: trustMachine,
        history,
      });
      const io = captureIo(acme());

      await runCli(["routines", "--json"], io, [command]);

      expect(JSON.parse(io.stdout.join("\n"))).toMatchObject({ trusted: true });
    },
    gitTimeout,
  );
});
