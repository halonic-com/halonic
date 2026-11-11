import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import type { QuestionTerminal } from "../../output/question.ts";
import { runCli, type Terminal } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { createTrustCommand, type TrustMachine } from "./command.ts";

/** Midday on 3 Nov, so the day is the same in every time zone the tests run in. */
const trustedAt = Date.UTC(2026, 10, 3, 12);

const fullFingerprint = /^hfp1:[0-9a-f]{64}$/u;

let folder: string;
let store: FileTrustStore;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-trust-"));
  store = new FileTrustStore(join(folder, "profile", "trust"));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

/** The trust records in the test's profile, a clock stopped on 3 Nov, and no `PATH`. */
function machine(): TrustMachine {
  return { store, clock: fixedClock(trustedAt), commandSearch: { path: undefined, endings: [] } };
}

const commands = () => [createTrustCommand(machine)];

/** Writes Acme to `acme`, with one connector that starts `npx`, and `extra` files on top. */
function writeAcme(extra: Record<string, string> = {}): void {
  const files: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "library/connectors/mail.connector.yaml":
      "name: Mail\ntransport:\n  stdio:\n    command: npx\n    args: ['@acme/mail-mcp']\ntools:\n  approve: []\n",
    ...extra,
  };
  for (const [path, text] of Object.entries(files)) {
    const file = join(folder, "acme", path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

/** A terminal on stdin where the user types `answers`, keeping what was written to stderr. */
function terminalTyping(...answers: string[]) {
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

/** Runs `halonic trust` through pipes and returns the fingerprint on its last stdout line. */
async function fingerprintOfAcme(): Promise<string> {
  const io = captureIo(folder);
  await runCli(["trust", "--dir", "acme"], io, commands());
  return io.stdout.at(-1) ?? "";
}

verifies("cli.commands.trust.review-and-trust", () => {
  it("shows the check, asks both questions in a terminal and trusts on two yeses", async () => {
    writeAcme();
    const io = captureIo(folder);
    const { terminal, written } = terminalTyping("y", "y");

    const code = await runCli(["trust", "--dir", "acme"], io, commands(), { terminal });

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["✓ Acme can run now."]);
    expect(written()).toContain(`Trust check for Acme (.${sep}acme)`);
    expect(written()).toContain("! Can download new code from npm when it starts");
    expect(written()).toContain("Trust Acme on this computer? [y/N]");
    expect(written()).toContain("It can download new code when it starts. Trust it anyway? [y/N]");
    expect(await store.list()).toHaveLength(1);
  });

  it("saves nothing when either answer is no", async () => {
    writeAcme();
    for (const answers of [["n"], ["y", ""]]) {
      const io = captureIo(folder);
      const { terminal } = terminalTyping(...answers);

      const code = await runCli(["trust", "--dir", "acme"], io, commands(), { terminal });

      expect(code).toBe(exitCode.notTrusted);
      expect(io.stdout).toEqual(["Not trusted. Nothing was started."]);
    }
    expect(await store.list()).toEqual([]);
  });

  it("without a terminal, refuses with the check on stderr and the bare fingerprint last on stdout", async () => {
    writeAcme();
    const io = captureIo(folder);

    const code = await runCli(["trust", "--dir", "acme"], io, commands());

    expect(code).toBe(exitCode.notTrusted);
    expect(io.stderr[0]).toBe(`Trust check for Acme (.${sep}acme)`);
    expect(io.stderr.slice(-2)).toEqual([
      "✕ Acme isn't trusted on this computer yet, and there's no terminal to ask you.",
      "  Review it with halonic trust --dir acme, then pass --yes --fingerprint <fingerprint>.",
    ]);
    expect(io.stdout).toHaveLength(1);
    expect(io.stdout[0]).toMatch(fullFingerprint);
    expect([...io.stdout, ...io.stderr].join("\n")).not.toContain("…");
    expect(await store.list()).toEqual([]);
  });

  it("trusts with --yes and the fingerprint the check printed, asking nothing, then says it's already trusted", async () => {
    writeAcme();
    const fingerprint = await fingerprintOfAcme();
    const { terminal, written } = terminalTyping();
    const args = ["trust", "--dir", "acme", "--yes", "--fingerprint", fingerprint];

    const first = captureIo(folder);
    expect(await runCli(args, first, commands(), { terminal })).toBe(exitCode.ok);
    const again = captureIo(folder);
    expect(await runCli(["trust", "--dir", "acme"], again, commands())).toBe(exitCode.ok);

    expect(first.stdout).toEqual(["✓ Acme can run now."]);
    expect(written()).toBe("");
    expect(again.stdout).toEqual([
      "✓ Acme is already trusted on this computer. Nothing changed since 3 Nov.",
    ]);
  });

  it("refuses --yes without --fingerprint as wrong usage, before reading the workspace", async () => {
    const io = captureIo(folder);

    const code = await runCli(["trust", "--dir", "acme", "--yes"], io, commands());

    expect(code).toBe(exitCode.usage);
    expect(io.stderr).toEqual([
      "✕ --yes needs --fingerprint, so you trust exactly what you reviewed.",
      "  Run halonic trust --dir acme to see it; the fingerprint is in the check, above the question.",
    ]);
  });

  it("refuses a fingerprint made before the workspace changed, also in a terminal", async () => {
    writeAcme();
    const old = await fingerprintOfAcme();
    writeAcme({
      "library/connectors/notes.connector.yaml":
        "name: Notes\ntransport:\n  stdio:\n    command: notes-server\ntools:\n  approve: []\n",
    });
    const io = captureIo(folder);
    const { terminal, written } = terminalTyping("y", "y");

    const args = ["trust", "--dir", "acme", "--yes", "--fingerprint", old];
    const code = await runCli(args, io, commands(), { terminal });

    expect(code).toBe(exitCode.notTrusted);
    expect(io.stderr.slice(-2)).toEqual([
      "✕ Couldn't trust Acme: it changed since that fingerprint was made.",
      "  Run halonic trust --dir acme again to see what changed.",
    ]);
    expect(io.stdout.at(-1)).not.toBe(old);
    expect(written()).toBe("");
    expect(await store.list()).toEqual([]);
  });

  it("with --json and no --yes, refuses with the fingerprint in the error", async () => {
    writeAcme();
    const io = captureIo(folder);

    const code = await runCli(["trust", "--dir", "acme", "--json"], io, commands());

    expect(code).toBe(exitCode.notTrusted);
    const document = JSON.parse(io.stdout.join("\n"));
    expect(document.ok).toBe(false);
    expect(document.error.kind).toBe("not_trusted");
    expect(document.error.fingerprint).toMatch(fullFingerprint);
  });

  it("lists the trusted workspaces, with the fingerprint only in --json, and removes one", async () => {
    writeAcme();
    const empty = captureIo(folder);
    await runCli(["trust", "--list"], empty, commands());
    const fingerprint = await fingerprintOfAcme();
    const trust = ["trust", "--dir", "acme", "--yes", "--fingerprint", fingerprint];
    await runCli(trust, captureIo(folder), commands());

    const list = captureIo(folder);
    await runCli(["trust", "--list"], list, commands());
    const json = captureIo(folder);
    await runCli(["trust", "--list", "--json"], json, commands());
    const removed = captureIo(folder);
    const code = await runCli(["trust", "--dir", "acme", "--remove"], removed, commands());

    expect(empty.stdout).toEqual(["No trusted workspaces yet."]);
    expect(list.stdout).toEqual([`Acme   .${sep}acme   trusted on 3 Nov`]);
    expect(JSON.parse(json.stdout.join("\n")).workspaces).toEqual([
      { name: "Acme", folder: `.${sep}acme`, fingerprint, trustedAt: "2026-11-03T12:00:00.000Z" },
    ]);
    expect(code).toBe(exitCode.ok);
    expect(removed.stdout).toEqual([
      "✓ Removed trust for Acme. Its programs and real models won't start until you review it again.",
    ]);
    expect(await store.list()).toEqual([]);
  });

  it("lists a workspace from where the user is, also when they got there through a link", async () => {
    writeAcme();
    const fingerprint = await fingerprintOfAcme();
    const trust = ["trust", "--dir", "acme", "--yes", "--fingerprint", fingerprint];
    await runCli(trust, captureIo(folder), commands());
    // A link stands in for what a Windows short name such as `RUNNER~1` does:
    // the same folder under another path than the record's real one.
    const link = join(folder, "link");
    symlinkSync(folder, link, "junction");

    const list = captureIo(link);
    await runCli(["trust", "--list"], list, commands());

    expect(list.stdout).toEqual([`Acme   .${sep}acme   trusted on 3 Nov`]);
  });

  it("removes the trust of a workspace whose folder is gone", async () => {
    writeAcme();
    const fingerprint = await fingerprintOfAcme();
    await runCli(
      ["trust", "--dir", "acme", "--yes", "--fingerprint", fingerprint],
      captureIo(folder),
      commands(),
    );
    rmSync(join(folder, "acme"), { recursive: true });
    const io = captureIo(folder);

    // The record's key is the real path; the folder is gone, so it's the resolved one.
    const code = await runCli(["trust", "--dir", "acme", "--remove"], io, commands());

    expect(code).toBe(exitCode.ok);
    expect(io.stdout[0]).toContain(`Removed trust for .${sep}acme.`);
  });
});

/** Trusts Acme as {@link writeAcme} writes it, then adds the connector `notes` and changes `mail`'s args. */
async function trustAcmeThenChangeIt(): Promise<void> {
  writeAcme();
  const fingerprint = await fingerprintOfAcme();
  await runCli(
    ["trust", "--dir", "acme", "--yes", "--fingerprint", fingerprint],
    captureIo(folder),
    commands(),
  );
  writeAcme({
    "library/connectors/mail.connector.yaml":
      "name: Mail\ntransport:\n  stdio:\n    command: npx\n    args: ['@acme/mail-mcp', '--all']\ntools:\n  approve: []\n",
    "library/connectors/notes.connector.yaml":
      "name: Notes\ntransport:\n  stdio:\n    command: notes-server\ntools:\n  approve: []\n",
  });
}

verifies("cli.commands.trust.changes-json", () => {
  it("refuses a changed workspace with what changed in error.changes, by id and field", async () => {
    await trustAcmeThenChangeIt();
    const io = captureIo(folder);

    const code = await runCli(["trust", "--dir", "acme", "--json"], io, commands());

    expect(code).toBe(exitCode.notTrusted);
    const { error } = JSON.parse(io.stdout.join("\n"));
    expect(error.kind).toBe("not_trusted");
    expect(error.changes).toEqual({
      trustedAt: "2026-11-03T12:00:00.000Z",
      connectors: {
        added: ["notes"],
        changed: [{ id: "mail", fields: ["settings"] }],
        removed: [],
      },
      agents: { added: [], changed: [], removed: [] },
      integrations: { added: [], changed: [], removed: [] },
      providers: { added: [], changed: [], removed: [] },
    });
    expect(JSON.stringify(error.changes)).not.toContain("--all");
  });

  it("gives the changes with the trust when --yes --fingerprint trusts the changed workspace", async () => {
    await trustAcmeThenChangeIt();
    const fingerprint = await fingerprintOfAcme();
    const io = captureIo(folder);

    const args = ["trust", "--dir", "acme", "--yes", "--fingerprint", fingerprint, "--json"];
    const code = await runCli(args, io, commands());

    expect(code).toBe(exitCode.ok);
    const document = JSON.parse(io.stdout.join("\n"));
    expect(document.status).toBe("trusted");
    expect(document.changes.connectors.added).toEqual(["notes"]);
  });

  it("has no changes for a workspace that was never trusted", async () => {
    writeAcme();
    const io = captureIo(folder);

    await runCli(["trust", "--dir", "acme", "--json"], io, commands());

    expect(JSON.parse(io.stdout.join("\n")).error).not.toHaveProperty("changes");
  });
});
