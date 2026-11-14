import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PasswordHasher } from "@halonicjs/ports";
import { secretCommandWith } from "../commands/secret/command.ts";
import { runCli, type Terminal } from "../run-cli.ts";
import { openSecretStore, type SecretSetup } from "../secret-host.ts";
import { captureIo } from "./capture-io.ts";

/** A hasher that marks what it hashed without any work, so a test sees "hash of", never the password. */
export const fakeHasher: PasswordHasher = {
  hash: async (password) => `hash-of(${password.length})`,
  verify: async () => false,
  needsRehash: () => false,
};

/** A profile in a temporary folder, with the secret setup over it. */
export async function secretFixture(stdin?: SecretSetup["stdin"]) {
  const folder = await mkdtemp(join(tmpdir(), "halonic-secret-"));
  const profile = {
    platform: process.platform === "win32" ? ("windows" as const) : ("linux" as const),
    homeFolder: folder,
    variables: { HALONIC_HOME: join(folder, "profile") },
  };
  const setup: SecretSetup = {
    profile,
    hasher: fakeHasher,
    ...(stdin === undefined ? {} : { stdin }),
  };
  return {
    folder,
    setup,
    store: () => openSecretStore(profile),
    cleanup: () => rm(folder, { recursive: true, force: true }),
  };
}

/** Stdin that is a pipe holding `text`. */
export const pipe = (text: string): NonNullable<SecretSetup["stdin"]> => ({
  isTerminal: false,
  read: async () => text,
});

/** Stdin that is a terminal where the user types `values`, one per prompt; the prompts written to stderr are kept. */
export function typing(...values: (string | undefined)[]) {
  const written: string[] = [];
  const terminal: Terminal = {
    env: { LANG: "en_US.UTF-8", NO_COLOR: "1" },
    platform: "linux",
    stdoutIsTerminal: true,
    stderrIsTerminal: true,
    questions: {
      write: (text) => written.push(text),
      readLine: async () => undefined,
      readSecret: async () => values.shift(),
    },
  };
  return {
    terminal,
    stdin: { isTerminal: true, read: async () => "" },
    written: () => written.join(""),
  };
}

/** Runs `halonic secret <args>` in-process. */
export async function secret(
  folder: string,
  setup: SecretSetup,
  args: readonly string[],
  terminal?: Terminal,
) {
  const io = captureIo(folder);
  const code = await runCli(["secret", ...args], io, [secretCommandWith(setup)], {
    ...(terminal === undefined ? {} : { terminal }),
  });
  return { code, io };
}
