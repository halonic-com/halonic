import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tokenKeySecret } from "@halonicjs/adapter-token-store";
import type { HttpClient } from "@halonicjs/ports";
import { encodeBase64url, encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { type GoogleSetup, openGoogleHost } from "../../google-host.ts";
import { type CallbackListener, callbackPath, listenForCallback } from "../../loopback-callback.ts";
import { runCli, type Terminal } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { typing } from "../../test/secret-setup.ts";
import { googleCommandWith } from "./command.ts";
import type { GoogleSignInMachine } from "./sign-in.ts";

const clientId = "1234-fake.apps.googleusercontent.com";
const fakeClientSecret = "fake-client-secret-0001";
const fakeCode = "fake-authorisation-code-0001";
const fakeAccessToken = "fake-access-token-0001";
const fakeRefreshToken = "fake-refresh-token-0001";
const address = "family@example.com";
const now = new Date("2026-11-14T12:00:00.000Z");

let folder: string;
let acme: string;
let setup: GoogleSetup;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-google-sign-in-"));
  acme = join(folder, "acme");
  await mkdir(join(acme, "library", "connectors"), { recursive: true });
  await mkdir(join(acme, "integrations", "gmail"), { recursive: true });
  await writeFile(join(acme, "workspace.yaml"), "id: acme\nname: Acme\n");
  await writeFile(
    join(acme, "library", "connectors", "mailbox.connector.yaml"),
    `name: Mailbox\ntransport:\n  google:\n    account: ${address}\n`,
  );
  await writeFile(
    join(acme, "library", "connectors", "bank.connector.yaml"),
    "name: Bank\ntransport:\n  http:\n    url: http://localhost:8700/mcp\n",
  );
  await writeFile(join(acme, "integrations", "gmail", "integration.yaml"), gmailSheet);
  setup = {
    profile: {
      platform: process.platform === "win32" ? "windows" : "linux",
      homeFolder: folder,
      variables: { HALONIC_HOME: join(folder, "profile") },
    },
    clock: { now: () => now },
    secrets: {
      get: async (name) =>
        name === tokenKeySecret ? encodeBase64url(new Uint8Array(32).fill(7)) : null,
    },
  };
});

afterEach(() => rm(folder, { recursive: true, force: true }));

const gmailSheet = `id: gmail
version: 0.1.0
kit: 1
provides: [connector]
hosts:
  - gmail.googleapis.com
secrets:
  google-account:
    purpose: Access to the Google account you connect.
    hosts: [gmail.googleapis.com]
    as: bearer
googleScopes:
  - scope: https://www.googleapis.com/auth/gmail.modify
    reason: Reads and sends your mail.
googleApis:
  - api: gmail.googleapis.com
    name: Gmail API
googleCheck:
  method: GET
  url: https://gmail.googleapis.com/gmail/v1/users/me/profile
tools: []
`;

/** A setup record that has its client ID and a saved fake secret. */
async function readyAccount(): Promise<string> {
  const host = openGoogleHost(setup);
  const record = await host.setups.start({
    route: { app: "own", runsOn: "this-computer" },
    accountType: "personal",
  });
  await host.setups.update(record.accountRef, { kind: "client-id", clientId });
  const clientRef = await host.clientSecrets.saveClientSecret(fakeClientSecret);
  await host.setups.update(record.accountRef, { kind: "client-secret-saved", clientRef });
  return record.accountRef;
}

function idToken(email: string): string {
  const part = (value: unknown) => encodeBase64url(encodeUtf8(JSON.stringify(value)));
  return `${part({ alg: "RS256" })}.${part({
    iss: "https://accounts.google.com",
    aud: clientId,
    sub: "100000000000000000001",
    email,
    email_verified: true,
    exp: now.getTime() / 1000 + 3600,
  })}.fake-signature`;
}

/** A Google that answers the code exchange and the service check. */
function fakeGoogle(signedInAs = address): HttpClient & { readonly urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    async fetch(url) {
      urls.push(url);
      if (url.endsWith("/token")) {
        return Response.json({
          access_token: fakeAccessToken,
          refresh_token: fakeRefreshToken,
          id_token: idToken(signedInAs),
          scope: "openid email https://www.googleapis.com/auth/gmail.modify",
          token_type: "Bearer",
          expires_in: 3599,
        });
      }
      return Response.json({});
    },
  };
}

/**
 * A browser and a loopback server in one: opening the address sends back
 * what `answer` makes of its `state`, as Google's redirect would.
 */
function fakeBrowser(
  answer: (state: string) => string,
  { opens = true }: { opens?: boolean } = {},
) {
  const opened: string[] = [];
  let deliver: (query: URLSearchParams) => void = () => {};
  const arrived = new Promise<URLSearchParams>((resolve) => {
    deliver = resolve;
  });
  const listener: CallbackListener = {
    port: 45123,
    firstCallback: (signal) =>
      Promise.race([
        arrived,
        new Promise<undefined>((resolve) =>
          signal.addEventListener("abort", () => resolve(undefined), { once: true }),
        ),
      ]),
    close: async () => {},
  };
  const machine: GoogleSignInMachine = {
    listen: async () => listener,
    openBrowser: async (url) => {
      opened.push(url);
      const state = new URL(url).searchParams.get("state") ?? "";
      deliver(new URLSearchParams(answer(state)));
      return opens;
    },
  };
  return { machine, opened };
}

const goodAnswer = (state: string) => `state=${state}&code=${fakeCode}`;

async function signIn(args: readonly string[], machine: GoogleSignInMachine, terminal?: Terminal) {
  const io = captureIo(acme);
  const code = await runCli(
    ["google", "sign-in", ...args],
    io,
    [googleCommandWith({ ...setup, ...machine })],
    { ...(terminal === undefined ? {} : { terminal }) },
  );
  return { code, io, printed: [...io.stdout, ...io.stderr].join("\n") };
}

/** Every file under the profile, as text, to look for a value written in the clear. */
async function profileText(): Promise<string> {
  const files = await readdir(join(folder, "profile"), { recursive: true, withFileTypes: true });
  const texts = await Promise.all(
    files
      .filter((file) => file.isFile())
      .map((file) => readFile(join(file.parentPath, file.name), "utf8")),
  );
  return texts.join("\n");
}

verifies("cli.commands.google.sign-in", () => {
  it("signs in, saves the token sealed, records the result and prints no address or token", async () => {
    const accountRef = await readyAccount();
    const browser = fakeBrowser(goodAnswer);
    const google = fakeGoogle();

    const { code, io, printed } = await signIn([accountRef, "--connection", "mailbox"], {
      ...browser.machine,
      http: google,
    });

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toContain("✓ Signed in.");
    expect(io.stdout).toContain("✓ gmail works.");
    expect(new URL(browser.opened[0] ?? "").searchParams.get("login_hint")).toBe(address);
    const host = openGoogleHost(setup);
    const record = await host.setups.read(accountRef);
    expect(record?.lastSignInAt).not.toBeNull();
    expect(record?.signInStartedAt).toBeNull();
    expect(record?.services["gmail"]?.result).toEqual({ kind: "works" });
    expect(await host.tokens.get(`google-account-${accountRef}`)).toBe(fakeRefreshToken);
    for (const secret of [fakeClientSecret, fakeCode, fakeAccessToken, fakeRefreshToken, address]) {
      expect(printed).not.toContain(secret);
    }
    expect(await profileText()).not.toContain(fakeRefreshToken);
  });

  it("prints the address when no browser opens, and still signs in", async () => {
    const accountRef = await readyAccount();
    const browser = fakeBrowser(goodAnswer, { opens: false });

    const { code, io } = await signIn([accountRef, "--connection", "mailbox"], {
      ...browser.machine,
      http: fakeGoogle(),
    });

    expect(code).toBe(exitCode.ok);
    expect(io.stdout.join("\n")).toContain(browser.opened[0]);
  });

  it("saves nothing when another Google account signs in", async () => {
    const accountRef = await readyAccount();

    const { code, printed } = await signIn([accountRef, "--connection", "mailbox"], {
      ...fakeBrowser(goodAnswer).machine,
      http: fakeGoogle("someone.else@example.com"),
    });

    const host = openGoogleHost(setup);
    expect(code).toBe(exitCode.denied);
    expect(printed).toContain("Another Google account signed in");
    expect(printed).not.toContain("someone.else@example.com");
    expect(await host.tokens.get(`google-account-${accountRef}`)).toBeNull();
    expect((await host.setups.read(accountRef))?.signInStartedAt).toBeNull();
  });

  it("says so when the person cancels at Google", async () => {
    const accountRef = await readyAccount();

    const { code } = await signIn([accountRef, "--connection", "mailbox"], {
      ...fakeBrowser((state) => `state=${state}&error=access_denied`).machine,
      http: fakeGoogle(),
    });

    expect(code).toBe(exitCode.denied);
    expect((await openGoogleHost(setup).setups.read(accountRef))?.lastSignInAt).toBeNull();
  });

  it("gives up after the wait and leaves nothing waiting", async () => {
    const accountRef = await readyAccount();
    const never = fakeBrowser(goodAnswer).machine;

    const { code, printed } = await signIn([accountRef, "--connection", "mailbox"], {
      ...never,
      openBrowser: async () => true,
      waitMs: 20,
    });

    expect(code).toBe(exitCode.unavailable);
    expect(printed).toContain("No sign-in came back in time");
    expect((await openGoogleHost(setup).setups.read(accountRef))?.signInStartedAt).toBeNull();
  });

  it("needs an account and --connection", async () => {
    for (const args of [[], ["gaccount_x"], ["--connection", "mailbox"]]) {
      const { code, io } = await signIn(args, fakeBrowser(goodAnswer).machine);

      expect(code).toBe(exitCode.usage);
      expect(io.stderr[0]).toContain("halonic google sign-in");
    }
  });

  it("refuses an unknown account, a connection that isn't Google, and a missing secret", async () => {
    const machine = fakeBrowser(goodAnswer).machine;
    expect((await signIn(["gaccount_x", "--connection", "mailbox"], machine)).code).toBe(
      exitCode.notFound,
    );
    const accountRef = await readyAccount();
    expect((await signIn([accountRef, "--connection", "bank"], machine)).code).toBe(exitCode.usage);
    const bare = await openGoogleHost(setup).setups.start({
      route: { app: "own", runsOn: "this-computer" },
      accountType: "personal",
    });
    const missing = await signIn([bare.accountRef, "--connection", "mailbox"], machine);
    expect(missing.code).not.toBe(exitCode.ok);
    expect(missing.printed).toContain("client");
  });

  it("never takes a secret from the terminal", async () => {
    const accountRef = await readyAccount();
    const { terminal, written } = typing(fakeClientSecret);

    await signIn(
      [accountRef, "--connection", "mailbox"],
      fakeBrowser(goodAnswer).machine,
      terminal,
    );

    expect(written()).toBe("");
  });
});

verifies("cli.loopback-callback", () => {
  it("answers only the callback path and hands over the first sign-in answer", async () => {
    const listener = await listenForCallback();
    try {
      const base = `http://127.0.0.1:${listener.port}`;
      expect((await fetch(`${base}/other`)).status).toBe(404);
      expect((await fetch(`${base}${callbackPath}`)).status).toBe(400);
      const waiting = listener.firstCallback(AbortSignal.timeout(5000));

      const answered = await fetch(`${base}${callbackPath}?state=s1&code=c1`);

      expect(answered.status).toBe(200);
      expect((await waiting)?.get("state")).toBe("s1");
      expect((await listener.firstCallback(AbortSignal.timeout(5000)))?.get("state")).toBe("s1");
    } finally {
      await listener.close();
    }
  });

  it("stops waiting when the signal ends", async () => {
    const listener = await listenForCallback();
    try {
      expect(await listener.firstCallback(AbortSignal.timeout(20))).toBeUndefined();
    } finally {
      await listener.close();
    }
  });
});
