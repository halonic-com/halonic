import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileRecordStore } from "@halonicjs/adapter-fs-node";
import { createTokenStore, tokenKeySecret } from "@halonicjs/adapter-token-store";
import { type ProfileEnvironment, profileFolder, tokenFolders } from "@halonicjs/profile";
import { encodeBase64url, systemClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { type GoogleSetup, openGoogleHost } from "../../google-host.ts";
import { runCli, type Terminal } from "../../run-cli.ts";
import { openSecretStore } from "../../secret-host.ts";
import { captureIo } from "../../test/capture-io.ts";
import { typing } from "../../test/secret-setup.ts";
import { terminalTyping } from "../../test/tools-kit.spec.ts";
import { googleCommandWith } from "./command.ts";

const fakeSecret = "fake-client-secret-0001";

let folder: string;
let profile: ProfileEnvironment;
let setup: GoogleSetup;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-google-reset-"));
  profile = {
    platform: process.platform === "win32" ? "windows" : "linux",
    homeFolder: folder,
    variables: { HALONIC_HOME: join(folder, "profile") },
  };
  setup = { profile, secrets: withTokenKey() };
});

afterEach(() => rm(folder, { recursive: true, force: true }));

/** Secrets holding a fake `token-key`, or none. */
function withTokenKey(set = true): NonNullable<GoogleSetup["secrets"]> {
  const key = encodeBase64url(new Uint8Array(32).fill(7));
  return { get: async (name) => (set && name === tokenKeySecret ? key : null) };
}

async function newAccount(): Promise<string> {
  const record = await openGoogleHost(setup).setups.start({
    route: { app: "own", runsOn: "this-computer" },
    accountType: "personal",
    connector: { workspace: "0123456789abcdef0123456789abcdef", id: "gmail" },
  });
  return record.accountRef;
}

async function google(args: readonly string[], terminal?: Terminal) {
  const io = captureIo(folder);
  const code = await runCli(["google", ...args], io, [googleCommandWith(setup)], {
    ...(terminal === undefined ? {} : { terminal }),
  });
  return { code, io };
}

function folders() {
  const root = profileFolder(profile);
  return { google: join(root.root, "google"), signIns: tokenFolders(root).integrationSignIns };
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

/**
 * A profile whose token key is gone while a Google secret and a sign-in
 * sealed with it remain, holding one other secret that must survive.
 */
async function profileWithLostKey(): Promise<void> {
  await google(["secret", await newAccount()], typing(fakeSecret).terminal);
  const signIns = createTokenStore({
    records: new FileRecordStore(folders().signIns),
    secrets: withTokenKey(),
    clock: systemClock,
  });
  await signIns.set("example-grant", "fake-grant-0001");
  await openSecretStore(profile).set("openai-key", "fake-other-secret");
  setup = { ...setup, secrets: withTokenKey(false) };
}

verifies("cli.commands.google.reset", () => {
  it("on yes removes what the lost key sealed, so Google can be set up again", async () => {
    await profileWithLostKey();
    const { terminal, written } = terminalTyping("y");

    const { code, io } = await google(["reset"], terminal);

    expect(code).toBe(exitCode.ok);
    expect(written.join("")).toContain("Remove the Google accounts set up on this computer");
    expect(io.stdout).toEqual([
      "✓ Removed. Set up Google again in the Studio. You can save the client secret and sign in there, or with halonic google secret <account> and halonic google sign-in <account>.",
    ]);
    expect(await exists(folders().google)).toBe(false);
    expect(await exists(folders().signIns)).toBe(false);
    expect(await openSecretStore(profile).get("openai-key")).toBe("fake-other-secret");

    const again = await google(["secret", await newAccount()], typing(fakeSecret).terminal);
    expect(again.code).toBe(exitCode.ok);
    expect(await openSecretStore(profile).get(tokenKeySecret)).not.toBeNull();
  });

  it.each(["n", ""])("on %j removes nothing and exits 1", async (answer) => {
    await profileWithLostKey();

    const { code, io } = await google(["reset"], terminalTyping(answer).terminal);

    expect(code).toBe(exitCode.failed);
    expect(io.stdout).toEqual(["Nothing was removed."]);
    expect(await exists(folders().google)).toBe(true);
    expect(await exists(folders().signIns)).toBe(true);
  });

  it("without a terminal and without --yes removes nothing and exits 2", async () => {
    await profileWithLostKey();

    const { code, io } = await google(["reset"]);

    expect(code).toBe(exitCode.usage);
    const said = io.stderr.join("\n");
    expect(said).toContain("every integration's saved sign-ins");
    expect(said).toContain("To remove them anyway, pass --yes.");
    expect(await exists(folders().google)).toBe(true);
  });

  it.each([
    ["with --yes", ["--yes"]],
    ["without --yes", []],
  ])("%s on a fresh profile asks nothing and says there's nothing to remove", async (_, extra) => {
    const { terminal, written } = terminalTyping();

    const { code, io } = await google(["reset", ...extra], terminal);

    expect(code).toBe(exitCode.ok);
    expect(written).toEqual([]);
    expect(io.stdout).toEqual([
      "Nothing to remove: this computer has no Google accounts or saved sign-ins.",
    ]);
  });

  it("names every integration's saved sign-ins in its help", async () => {
    const { io } = await google(["reset", "--help"]);

    expect(io.stdout.join("\n")).toContain("every integration's saved sign-ins");
  });

  it("exits 2 with its usage when given an argument", async () => {
    const { code, io } = await google(["reset", "some-account", "--yes"]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr.join("\n")).toContain("halonic google reset [--yes]");
  });

  it("is named in the fix line when the key is gone but sealed tokens remain", async () => {
    await profileWithLostKey();

    const { code, io } = await google(["secret", await newAccount()], typing(fakeSecret).terminal);

    expect(code).toBe(exitCode.conflict);
    expect(io.stderr.join("\n")).toContain("run halonic google reset");
  });
});
