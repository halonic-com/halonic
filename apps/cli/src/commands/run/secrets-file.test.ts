import { chmod, cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import { FileSecretStore } from "@halonicjs/adapter-secrets-file";
import { type ProfileEnvironment, profileFolder, secretsFile } from "@halonicjs/profile";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { turnOffLocalOnly } from "../../test/local-only.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { engineStart, testRunSetup } from "../../test/run-setup.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { assertTrustable, cliTrustService, readWorkspaceTrust } from "../../workspace-trust.ts";
import { runCommandWith } from "./command.ts";

// A secrets file other users can read stops a run that reads a key from it.
// `halonic run` says so with the fix and exit 7, as `halonic secret list`
// does for the same file, rather than asking for a bug report (HAL-12569).

const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));
const samsEmail = ["--input", "examples/refund-question.json"];

let folder: string;
let acme: string;
let profile: ProfileEnvironment;
let secrets: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-run-secrets-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  profile = { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: join(folder, "profile") } };
  secrets = secretsFile(profileFolder(profile));
});

afterEach(async () => {
  await removeTestFolder(folder);
});

/** Points Writer at Anthropic, whose key is the secret `anthropic`, and trusts Acme as it is then. */
async function useAnthropicForWriter(): Promise<void> {
  await turnOffLocalOnly(acme);
  await writeFile(
    join(acme, "providers/anthropic.yaml"),
    "id: anthropic\nname: Anthropic\ntype: anthropic\nsecret: anthropic\n",
  );
  const models = join(acme, "models.yaml");
  await writeFile(
    models,
    `${await readFile(models, "utf8")}  smart:\n    provider: anthropic\n    model: a-model\n`,
  );
  const writer = join(acme, "hubs/support/agents/writer.agent.yaml");
  await writeFile(writer, `${await readFile(writer, "utf8")}model: smart\n`);

  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const read = await readWorkspaceTrust(dir, { path: undefined, endings: [] });
  const trust = cliTrustService(new FileTrustStore(join(folder, "trust")), fixedClock(engineStart));
  const check = await trust.check(read.subject);
  assertTrustable(check, read);
  expect((await trust.grant(read.subject, check.fingerprint, "cli")).ok).toBe(true);
}

/** Saves the key in the profile's secrets file, then lets group and others read the file. */
async function saveKeyInReadableFile(): Promise<void> {
  await new FileSecretStore(secrets).set("anthropic", "not-a-real-key");
  await chmod(secrets, 0o644);
}

async function run(...args: string[]): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(acme);
  const code = await runCli(["run", ...args], io, [runCommandWith(testRunSetup(folder, profile))]);
  return { code, io };
}

// Windows has no permission check on the file; the profile folder protects it there.
describe.skipIf(process.platform === "win32")("a secrets file other users can read", () => {
  verifies("cli.run", () => {
    it("says the cause and chmod 600, with no report link, and exits 7 (HAL-12569)", async () => {
      await useAnthropicForWriter();
      await saveKeyInReadableFile();

      const { code, io } = await run("support-reply", ...samsEmail);

      expect(code).toBe(exitCode.denied);
      const failed = io.stdout.findLastIndex((line) => line.startsWith("✕"));
      expect(io.stdout.slice(failed, failed + 2)).toEqual([
        `✕ Support reply failed in the step Read the email: the secrets file ${secrets} can be read by other users.`,
        `  Run chmod 600 ${secrets}, then run again.`,
      ]);
      expect(io.stdout.join("\n")).not.toContain("report it");
    });
  });

  verifies("cli.json-lines", () => {
    it("carries the cause and the file in the run's cause, and exits 7 with it", async () => {
      await useAnthropicForWriter();
      await saveKeyInReadableFile();

      const { code, io } = await run("support-reply", ...samsEmail, "--json");

      expect(code).toBe(exitCode.denied);
      expect(JSON.parse(io.stdout.join("\n"))).toMatchObject({
        ok: false,
        run: {
          status: "failed",
          cause: { kind: "denied", code: "secrets.file-readable", detail: { file: secrets } },
        },
      });
    });
  });
});
