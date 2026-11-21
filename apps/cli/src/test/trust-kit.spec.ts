// A spec helper, not a test file of its own: it uses Vitest, so its name ends in `.spec.ts`.
// `halonic trust` run in-process on an Acme with one connector that starts `npx`,
// for the tests of `commands/trust`, split by flow.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import { fixedClock } from "@halonicjs/std";
import { afterEach, beforeEach } from "vitest";
import type { CliCommand } from "../command.ts";
import { createTrustCommand } from "../commands/trust/command.ts";
import type { QuestionTerminal } from "../output/question.ts";
import { runCli, type Terminal } from "../run-cli.ts";
import { captureIo } from "./capture-io.ts";

/** Midday on 3 Nov, so the day is the same in every time zone the tests run in. */
export const trustedAt = Date.UTC(2026, 10, 3, 12);

/** A full workspace fingerprint, as `halonic trust` prints it. */
export const fullFingerprint = /^hfp1:[0-9a-f]{64}$/u;

/** What a test file of `halonic trust` works in and runs its command lines with. */
export interface TrustKit {
  /** This test's folder, which holds `acme` and the profile. */
  folder(): string;
  /** The trust records in this test's profile. */
  store(): FileTrustStore;
  /** `halonic trust` on {@link TrustKit.store}, a clock stopped on 3 Nov, and no `PATH`. */
  commands(): CliCommand[];
  /** Writes Acme to `acme`, with one connector that starts `npx`, and `extra` files on top. */
  writeAcme(extra?: Record<string, string>): void;
  /** Runs `halonic trust` through pipes and returns the fingerprint on its last stdout line. */
  fingerprintOfAcme(): Promise<string>;
  /** Trusts Acme as {@link TrustKit.writeAcme} writes it, then adds the connector `notes` and changes `mail`'s args. */
  trustAcmeThenChangeIt(): Promise<void>;
}

/** A fresh folder and trust store before each test of the file, removed after it. */
export function trustKit(): TrustKit {
  let folder: string | undefined;
  let store: FileTrustStore | undefined;
  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "halonic-cli-trust-"));
    store = new FileTrustStore(join(folder, "profile", "trust"));
  });
  afterEach(() => {
    if (folder !== undefined) rmSync(folder, { recursive: true, force: true });
  });
  const currentFolder = (): string => {
    if (folder === undefined) throw new Error("The folder is made before each test.");
    return folder;
  };
  const currentStore = (): FileTrustStore => {
    if (store === undefined) throw new Error("The trust store is made before each test.");
    return store;
  };
  const commands = (): CliCommand[] => [
    createTrustCommand(() => ({
      store: currentStore(),
      clock: fixedClock(trustedAt),
      commandSearch: { path: undefined, endings: [] },
    })),
  ];
  const writeAcme = (extra: Record<string, string> = {}): void => {
    const files: Record<string, string> = {
      "workspace.yaml": "id: acme\nname: Acme\n",
      "library/connectors/mail.connector.yaml":
        "name: Mail\ntransport:\n  stdio:\n    command: npx\n    args: ['@acme/mail-mcp']\ntools:\n  approve: []\n",
      ...extra,
    };
    for (const [path, text] of Object.entries(files)) {
      const file = join(currentFolder(), "acme", path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
  };
  const fingerprintOfAcme = async (): Promise<string> => {
    const io = captureIo(currentFolder());
    await runCli(["trust", "--dir", "acme"], io, commands());
    return io.stdout.at(-1) ?? "";
  };
  return {
    folder: currentFolder,
    store: currentStore,
    commands,
    writeAcme,
    fingerprintOfAcme,
    async trustAcmeThenChangeIt() {
      writeAcme();
      const fingerprint = await fingerprintOfAcme();
      await runCli(
        ["trust", "--dir", "acme", "--yes", "--fingerprint", fingerprint],
        captureIo(currentFolder()),
        commands(),
      );
      writeAcme({
        "library/connectors/mail.connector.yaml":
          "name: Mail\ntransport:\n  stdio:\n    command: npx\n    args: ['@acme/mail-mcp', '--all']\ntools:\n  approve: []\n",
        "library/connectors/notes.connector.yaml":
          "name: Notes\ntransport:\n  stdio:\n    command: notes-server\ntools:\n  approve: []\n",
      });
    },
  };
}

/** A terminal on stdin where the user types `answers`, keeping what was written to stderr. */
export function terminalTyping(...answers: string[]) {
  const written: string[] = [];
  const questions: QuestionTerminal = {
    write: (text) => written.push(text),
    readLine: async () => answers.shift(),
  };
  const terminal: Terminal = {
    env: { LANG: "en_US.UTF-8", NO_COLOR: "1" },
    platform: "linux",
    stdoutIsTerminal: true,
    stderrIsTerminal: true,
    questions,
  };
  return { terminal, written: () => written.join("") };
}
