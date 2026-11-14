import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileConnectionSettingsStore } from "@halonicjs/adapter-fs-node";
import { connectionSettingsFolder, profileFolder } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { googleCommandWith } from "./command.ts";

const profileEnvironment = (folder: string) => ({
  platform: process.platform === "win32" ? ("windows" as const) : ("linux" as const),
  homeFolder: folder,
  variables: { HALONIC_HOME: join(folder, "profile") },
});

let folder: string;
let acme: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-google-"));
  acme = join(folder, "acme");
  await mkdir(join(acme, "library", "connectors"), { recursive: true });
  await writeFile(join(acme, "workspace.yaml"), "id: acme\nname: Acme\n");
  await writeFile(
    join(acme, "library", "connectors", "mailbox.connector.yaml"),
    "name: Mailbox\ntransport:\n  google:\n    account: family@example.com\n",
  );
  await writeFile(
    join(acme, "library", "connectors", "bank.connector.yaml"),
    "name: Bank\ntransport:\n  http:\n    url: http://localhost:8700/mcp\n",
  );
});

afterEach(() => rm(folder, { recursive: true, force: true }));

async function google(args: readonly string[], cwd = acme) {
  const io = captureIo(cwd);
  const code = await runCli(["google", ...args], io, [
    googleCommandWith({ profile: profileEnvironment(folder) }),
  ]);
  return { code, io };
}

/** The setting the profile holds for a connection of Acme. */
async function saved(connector: string) {
  const store = new FileConnectionSettingsStore(
    connectionSettingsFolder(profileFolder(profileEnvironment(folder))),
  );
  return store.get({ location: await realpath(acme), connector });
}

verifies("cli.commands.google.allow-sending", () => {
  it("switches sending on for a Google connection, and says so", async () => {
    const { code, io } = await google(["allow-sending", "mailbox", "on"]);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["✓ Sending is on for mailbox in Acme."]);
    expect((await saved("mailbox"))?.allowSending).toBe(true);
  });

  it("switches it off again, replacing the setting", async () => {
    await google(["allow-sending", "mailbox", "on"]);

    const { code, io } = await google(["allow-sending", "mailbox", "off"]);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["✓ Sending is off for mailbox in Acme."]);
    expect((await saved("mailbox"))?.allowSending).toBe(false);
  });

  it("succeeds when the setting already has that value", async () => {
    await google(["allow-sending", "mailbox", "on"]);

    const { code, io } = await google(["allow-sending", "mailbox", "on"]);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["✓ Sending is on for mailbox in Acme."]);
  });

  it("works on the workspace in --dir, and keeps it apart from other connections", async () => {
    const { code } = await google(["allow-sending", "mailbox", "on", "--dir", "acme"], folder);

    expect(code).toBe(exitCode.ok);
    expect((await saved("mailbox"))?.allowSending).toBe(true);
    expect(await saved("bank")).toBeNull();
  });

  it("adds the connection, the workspace and the setting to --json", async () => {
    const { code, io } = await google(["allow-sending", "mailbox", "on", "--json"]);

    expect(code).toBe(exitCode.ok);
    expect(JSON.parse(io.stdout.join("\n"))).toMatchObject({
      ok: true,
      connection: "mailbox",
      workspace: "Acme",
      allowSending: true,
    });
  });

  it("refuses a connection the workspace doesn't have, with a near match, and saves nothing", async () => {
    const { code, io } = await google(["allow-sending", "mailbox2", "on"]);

    expect(code).toBe(exitCode.notFound);
    expect(io.stderr[0]).toBe('✕ There\'s no connection called "mailbox2" in Acme.');
    expect(io.stderr[1]).toContain("Did you mean mailbox?");
    expect(await saved("mailbox2")).toBeNull();
  });

  it("refuses a connection that isn't a Google one, and saves nothing", async () => {
    const { code, io } = await google(["allow-sending", "bank", "on"]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr[0]).toBe('✕ "bank" isn\'t a Google connection.');
    expect(await saved("bank")).toBeNull();
  });

  it("refuses a folder that isn't a workspace", async () => {
    const { code } = await google(["allow-sending", "mailbox", "on"], folder);

    expect(code).not.toBe(exitCode.ok);
    expect(await saved("mailbox")).toBeNull();
  });

  it("needs a connection and on or off, and saves nothing otherwise", async () => {
    for (const args of [
      ["allow-sending"],
      ["allow-sending", "mailbox"],
      ["allow-sending", "mailbox", "maybe"],
      ["allow-sending", "mailbox", "on", "extra"],
    ]) {
      const { code, io } = await google(args);

      expect(code).toBe(exitCode.usage);
      expect(io.stderr[0]).toContain("halonic google allow-sending");
    }
    expect(await saved("mailbox")).toBeNull();
  });
});
