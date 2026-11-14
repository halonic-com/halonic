import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tokenKeySecret } from "@halonicjs/adapter-token-store";
import { encodeBase64url } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { type GoogleSetup, openGoogleHost } from "../../google-host.ts";
import { runCli, type Terminal } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { typing } from "../../test/secret-setup.ts";
import { googleCommandWith } from "./command.ts";

const fakeSecret = "fake-client-secret-0001";
const otherSecret = "fake-client-secret-0002";

let folder: string;
let setup: GoogleSetup;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-google-secret-"));
  setup = {
    profile: {
      platform: process.platform === "win32" ? "windows" : "linux",
      homeFolder: folder,
      variables: { HALONIC_HOME: join(folder, "profile") },
    },
    secrets: withTokenKey(),
  };
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

async function googleSecret(args: readonly string[], terminal?: Terminal) {
  const io = captureIo(folder);
  const code = await runCli(["google", "secret", ...args], io, [googleCommandWith(setup)], {
    ...(terminal === undefined ? {} : { terminal }),
  });
  return { code, io, printed: [...io.stdout, ...io.stderr].join("\n") };
}

/** Every file under the profile, as text, to look for a secret that was written in the clear. */
async function profileText(): Promise<string> {
  const files = await readdir(join(folder, "profile"), { recursive: true, withFileTypes: true });
  const texts = await Promise.all(
    files
      .filter((file) => file.isFile())
      .map((file) => readFile(join(file.parentPath, file.name), "utf8")),
  );
  return texts.join("\n");
}

verifies("cli.commands.google.secret", () => {
  it("saves the typed secret, records it and prints only Saved", async () => {
    const accountRef = await newAccount();
    const { terminal, written } = typing(fakeSecret);

    const { code, io, printed } = await googleSecret([accountRef], terminal);

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual(["✓ Saved."]);
    expect(written()).toBe("Client secret: \n");
    const host = openGoogleHost(setup);
    const record = await host.setups.read(accountRef);
    expect(record?.clientSecret).not.toBeNull();
    expect(await host.clientSecrets.readClientSecret(record?.clientSecret?.clientRef ?? "")).toBe(
      fakeSecret,
    );
    expect(printed).not.toContain(fakeSecret);
    expect(await profileText()).not.toContain(fakeSecret);
  });

  it("replaces a secret while the account has never signed in", async () => {
    const accountRef = await newAccount();
    await googleSecret([accountRef], typing(fakeSecret).terminal);

    const { code } = await googleSecret([accountRef], typing(otherSecret).terminal);

    const host = openGoogleHost(setup);
    const record = await host.setups.read(accountRef);
    expect(code).toBe(exitCode.ok);
    expect(await host.clientSecrets.readClientSecret(record?.clientSecret?.clientRef ?? "")).toBe(
      otherSecret,
    );
  });

  it("keeps the secret of an account that has signed in", async () => {
    const accountRef = await newAccount();
    await googleSecret([accountRef], typing(fakeSecret).terminal);
    const host = openGoogleHost(setup);
    await host.setups.update(accountRef, { kind: "signed-in" });

    const { code, printed } = await googleSecret([accountRef], typing(otherSecret).terminal);

    const record = await host.setups.read(accountRef);
    expect(code).toBe(exitCode.conflict);
    expect(printed).toContain("Studio");
    expect(printed).not.toContain(otherSecret);
    expect(await host.clientSecrets.readClientSecret(record?.clientSecret?.clientRef ?? "")).toBe(
      fakeSecret,
    );
  });

  it("never takes the secret from an argument and prints no part of it", async () => {
    const accountRef = await newAccount();
    const { terminal, written } = typing(otherSecret);

    const { code, printed } = await googleSecret([accountRef, fakeSecret], terminal);

    expect(code).toBe(exitCode.usage);
    expect(written()).toBe("");
    expect(printed).not.toContain(fakeSecret);
    expect((await openGoogleHost(setup).setups.read(accountRef))?.clientSecret).toBeNull();
  });

  it("needs an account", async () => {
    const { code, io } = await googleSecret([]);

    expect(code).toBe(exitCode.usage);
    expect(io.stderr[0]).toBe("✕ halonic google secret needs an account.");
  });

  it("exits 4 for an account that has no setup, without asking", async () => {
    const { terminal, written } = typing(fakeSecret);

    const { code, printed } = await googleSecret(["acct_nothere"], terminal);

    expect(code).toBe(exitCode.notFound);
    expect(written()).toBe("");
    expect(printed).not.toContain(fakeSecret);
  });

  it("asks nothing and saves nothing where nobody can type, also with --json", async () => {
    const accountRef = await newAccount();
    const piped = await googleSecret([accountRef]);
    const json = await googleSecret([accountRef, "--json"], typing(fakeSecret).terminal);

    expect(piped.code).toBe(exitCode.usage);
    expect(json.code).toBe(exitCode.usage);
    expect((await openGoogleHost(setup).setups.read(accountRef))?.clientSecret).toBeNull();
  });

  it("stops before the prompt when token-key isn't set", async () => {
    const accountRef = await newAccount();
    setup = { ...setup, secrets: withTokenKey(false) };
    const { terminal, written } = typing(fakeSecret);

    const { code, io } = await googleSecret([accountRef], terminal);

    expect(code).toBe(exitCode.usage);
    expect(written()).toBe("");
    expect(io.stderr.join("\n")).toContain("token-key");
  });

  it("saves nothing and says nothing of the value when it is only spaces", async () => {
    const accountRef = await newAccount();

    const { code } = await googleSecret([accountRef], typing("   ").terminal);

    expect(code).toBe(exitCode.usage);
    expect((await openGoogleHost(setup).setups.read(accountRef))?.clientSecret).toBeNull();
  });

  it("writes no log line that holds the secret, also with --debug", async () => {
    const accountRef = await newAccount();

    const { printed } = await googleSecret([accountRef, "--debug"], typing(fakeSecret).terminal);

    expect(printed).not.toContain(fakeSecret);
  });
});
